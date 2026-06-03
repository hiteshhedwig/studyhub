#!/usr/bin/env python3
"""
studyhub_sync.py

Google Drive courier for StudyHub JSON files using rclone.

Daily flow:
  Morning:
    python studyhub_sync.py --remote gdrive: push-questions /path/to/studyhub-questions.json

  Evening:
    python studyhub_sync.py --remote gdrive: pull-practice

Important:
  pull-practice downloads valid practice JSON files AND automatically moves
  those remote files out of Drive practice/inbox/ into practice/processed/YYYY-MM-DD/.
  Your local downloaded copy remains in ~/StudyHubSync/inbox/ for desktop Import & merge.

The script does NOT read your app DB.
The app remains responsible for export/import/merge.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


EXPECTED_QUESTIONS_TYPE = "studyhub-questions"
EXPECTED_PRACTICE_TYPE = "studyhub-practice"
EXPECTED_VERSION = 1


@dataclass(frozen=True)
class Config:
    remote: str
    root: str
    local_root: Path


class SyncError(Exception):
    pass


def run_rclone(args: list[str], *, capture: bool = False) -> str:
    cmd = ["rclone", *args]
    try:
        completed = subprocess.run(
            cmd,
            check=True,
            text=True,
            capture_output=capture,
        )
    except FileNotFoundError as exc:
        raise SyncError(
            "rclone is not installed or not on PATH. Install/configure rclone first."
        ) from exc
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() if exc.stderr else ""
        stdout = exc.stdout.strip() if exc.stdout else ""
        detail = stderr or stdout or str(exc)
        raise SyncError(f"rclone command failed: {' '.join(cmd)}\n{detail}") from exc

    return completed.stdout if capture else ""


def remote_path(cfg: Config, *parts: str) -> str:
    clean_parts = [cfg.root.strip("/")]
    clean_parts.extend(str(p).strip("/") for p in parts if p)
    suffix = "/".join(clean_parts)

    remote = cfg.remote.strip()
    if remote.endswith(":"):
        return f"{remote}{suffix}"
    return f"{remote.rstrip('/')}/{suffix}"


def local_path(cfg: Config, *parts: str) -> Path:
    return cfg.local_root.joinpath(*parts)


def load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError as exc:
        raise SyncError(f"File not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise SyncError(f"Invalid JSON: {path}\n{exc}") from exc

    if not isinstance(data, dict):
        raise SyncError(f"Expected top-level JSON object: {path}")

    return data


def validate_studyhub_json(path: Path, expected_type: str) -> None:
    data = load_json(path)

    actual_type = data.get("type")
    actual_version = data.get("version")

    if actual_type != expected_type:
        raise SyncError(
            f"Wrong JSON type for {path.name}: expected {expected_type!r}, "
            f"got {actual_type!r}"
        )

    if actual_version != EXPECTED_VERSION:
        raise SyncError(
            f"Wrong JSON version for {path.name}: expected {EXPECTED_VERSION}, "
            f"got {actual_version!r}"
        )


def timestamped_name(filename: str) -> str:
    return f"{datetime.now().strftime('%H-%M-%S')}-{filename}"


def init_dirs(cfg: Config) -> None:
    today = datetime.now().strftime("%Y-%m-%d")
    dirs = [
        remote_path(cfg, "questions", "current"),
        remote_path(cfg, "questions", "archive", today),
        remote_path(cfg, "practice", "inbox"),
        remote_path(cfg, "practice", "processed", today),
        remote_path(cfg, "practice", "invalid", today),
    ]

    for d in dirs:
        run_rclone(["mkdir", d])

    local_path(cfg, "inbox").mkdir(parents=True, exist_ok=True)
    local_path(cfg, "processed", today).mkdir(parents=True, exist_ok=True)
    local_path(cfg, "invalid").mkdir(parents=True, exist_ok=True)

    print("Initialized StudyHub sync folders:")
    print(f"  Remote root: {remote_path(cfg)}")
    print(f"  Local root:  {cfg.local_root}")


def push_questions(cfg: Config, questions_json: Path) -> None:
    questions_json = questions_json.expanduser().resolve()
    validate_studyhub_json(questions_json, EXPECTED_QUESTIONS_TYPE)

    now = datetime.now()
    date_part = now.strftime("%Y-%m-%d")
    time_part = now.strftime("%H-%M-%S")

    current_remote = remote_path(
        cfg,
        "questions",
        "current",
        "studyhub-questions-current.json",
    )

    archive_folder = remote_path(cfg, "questions", "archive", date_part)
    archive_remote = remote_path(
        cfg,
        "questions",
        "archive",
        date_part,
        f"{time_part}-studyhub-questions.json",
    )

    run_rclone(["mkdir", remote_path(cfg, "questions", "current")])
    run_rclone(["mkdir", archive_folder])

    print("Uploading current questions copy...")
    run_rclone(["copyto", str(questions_json), current_remote])

    print("Uploading archived questions copy...")
    run_rclone(["copyto", str(questions_json), archive_remote])

    print("Done.")
    print(f"  Current: {current_remote}")
    print(f"  Archive: {archive_remote}")


def list_practice_inbox(cfg: Config) -> list[dict[str, Any]]:
    inbox_remote = remote_path(cfg, "practice", "inbox")
    try:
        output = run_rclone(["lsjson", inbox_remote, "--files-only"], capture=True)
    except SyncError:
        run_rclone(["mkdir", inbox_remote])
        return []

    if not output.strip():
        return []

    try:
        files = json.loads(output)
    except json.JSONDecodeError as exc:
        raise SyncError(f"Could not parse rclone lsjson output:\n{output}") from exc

    if not isinstance(files, list):
        raise SyncError("Unexpected rclone lsjson output.")

    return files


def move_remote_to_processed(cfg: Config, filename: str) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    processed_filename = timestamped_name(filename)

    source_remote = remote_path(cfg, "practice", "inbox", filename)
    processed_folder_remote = remote_path(cfg, "practice", "processed", today)
    dest_remote = remote_path(cfg, "practice", "processed", today, processed_filename)

    run_rclone(["mkdir", processed_folder_remote])
    run_rclone(["moveto", source_remote, dest_remote])

    return dest_remote


def move_remote_to_invalid(cfg: Config, filename: str) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    invalid_filename = timestamped_name(filename)

    source_remote = remote_path(cfg, "practice", "inbox", filename)
    invalid_folder_remote = remote_path(cfg, "practice", "invalid", today)
    dest_remote = remote_path(cfg, "practice", "invalid", today, invalid_filename)

    run_rclone(["mkdir", invalid_folder_remote])
    run_rclone(["moveto", source_remote, dest_remote])

    return dest_remote


def pull_practice(cfg: Config) -> None:
    """
    Download all JSON files from Drive practice/inbox.

    Valid files:
      - downloaded to local inbox
      - validated
      - moved remotely from practice/inbox to practice/processed/YYYY-MM-DD

    Invalid files:
      - moved locally/remotely to invalid
    """
    inbox_remote = remote_path(cfg, "practice", "inbox")
    local_inbox = local_path(cfg, "inbox")
    local_inbox.mkdir(parents=True, exist_ok=True)

    files = list_practice_inbox(cfg)
    json_files = [
        f for f in files
        if isinstance(f, dict)
        and not f.get("IsDir")
        and str(f.get("Name", "")).lower().endswith(".json")
    ]

    if not json_files:
        print(f"No practice JSON files found in: {inbox_remote}")
        return

    ready = 0
    invalid = 0
    errors = 0

    for item in json_files:
        name = item["Name"]
        remote_file = remote_path(cfg, "practice", "inbox", name)
        local_file = local_inbox / name

        print(f"\nProcessing: {name}")

        try:
            if local_file.exists():
                print(f"  Local copy already exists: {local_file}")
            else:
                print("  Downloading...")
                run_rclone(["copyto", remote_file, str(local_file)])

            try:
                validate_studyhub_json(local_file, EXPECTED_PRACTICE_TYPE)
            except SyncError as exc:
                invalid += 1

                invalid_dir = local_path(cfg, "invalid")
                invalid_dir.mkdir(parents=True, exist_ok=True)
                invalid_target = invalid_dir / name

                if local_file.exists():
                    shutil.move(str(local_file), str(invalid_target))

                print(f"  Invalid practice JSON: {exc}")
                print(f"  Local invalid copy moved to: {invalid_target}")

                try:
                    remote_invalid = move_remote_to_invalid(cfg, name)
                    print(f"  Remote invalid file moved to: {remote_invalid}")
                except SyncError as remote_exc:
                    errors += 1
                    print(f"  Could not move remote invalid file: {remote_exc}")

                continue

            remote_processed = move_remote_to_processed(cfg, name)
            ready += 1

            print(f"  Ready for StudyHub Import & merge: {local_file}")
            print(f"  Remote moved out of inbox: {remote_processed}")

        except SyncError as exc:
            errors += 1
            print(f"  ERROR: {exc}")
            print("  Leaving remote file in inbox so it can be retried.")

    print()
    print("Done.")
    print(f"  Valid files ready to import: {ready}")
    print(f"  Invalid files: {invalid}")
    print(f"  Errors: {errors}")
    print(f"  Local import folder: {local_inbox}")


def show_status(cfg: Config) -> None:
    print("Remote folders:")
    for p in [
        remote_path(cfg, "questions", "current"),
        remote_path(cfg, "practice", "inbox"),
        remote_path(cfg, "practice", "processed", datetime.now().strftime("%Y-%m-%d")),
    ]:
        print(f"\n{p}")
        try:
            output = run_rclone(["lsf", p], capture=True)
            print(output.strip() or "  <empty>")
        except SyncError as exc:
            print(f"  unavailable: {exc}")

    print(f"\nLocal inbox: {local_path(cfg, 'inbox')}")
    if local_path(cfg, "inbox").exists():
        files = sorted(local_path(cfg, "inbox").glob("*.json"))
        if files:
            for f in files:
                print(f"  {f.name}")
        else:
            print("  <empty>")
    else:
        print("  <missing>")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="StudyHub Google Drive JSON sync helper using rclone."
    )

    parser.add_argument(
        "--remote",
        default="gdrive:",
        help="rclone remote, e.g. 'gdrive:' or 'gdrive:Backups'. Default: gdrive:",
    )
    parser.add_argument(
        "--root",
        default="StudyHub Sync",
        help="Root folder inside the remote. Default: 'StudyHub Sync'.",
    )
    parser.add_argument(
        "--local-root",
        default=str(Path.home() / "StudyHubSync"),
        help="Local sync folder. Default: ~/StudyHubSync.",
    )

    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="Create remote/local folder structure.")

    push = sub.add_parser("push-questions", help="Upload exported questions JSON.")
    push.add_argument("questions_json", help="Path to studyhub-questions JSON.")

    sub.add_parser(
        "pull-practice",
        help="Download practice JSON files and automatically move remote copies to processed.",
    )

    sub.add_parser("status", help="Show current remote/local sync status.")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    cfg = Config(
        remote=args.remote,
        root=args.root,
        local_root=Path(args.local_root).expanduser().resolve(),
    )

    try:
        if args.command == "init":
            init_dirs(cfg)
        elif args.command == "push-questions":
            push_questions(cfg, Path(args.questions_json))
        elif args.command == "pull-practice":
            pull_practice(cfg)
        elif args.command == "status":
            show_status(cfg)
        else:
            parser.error(f"Unknown command: {args.command}")
    except SyncError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())