import { exportDatabaseBinary, replaceDatabase } from "../db/database";

function defaultFileName(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `studyhub-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.sqlite`;
}

async function saveViaTauri(bytes: Uint8Array, suggestedName: string): Promise<boolean> {
  try {
    const { save } = await import("@tauri-apps/api/dialog");
    const { writeBinaryFile } = await import("@tauri-apps/api/fs");
    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: "Study Hub backup", extensions: ["sqlite", "db"] }]
    });
    if (typeof path !== "string") return false;
    await writeBinaryFile(path, bytes);
    return true;
  } catch {
    return false;
  }
}

function saveViaBrowser(bytes: Uint8Array, suggestedName: string): void {
  const blob = new Blob([bytes.slice().buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function openViaTauri(): Promise<Uint8Array | null> {
  try {
    const { open } = await import("@tauri-apps/api/dialog");
    const { readBinaryFile } = await import("@tauri-apps/api/fs");
    const result = await open({
      multiple: false,
      filters: [{ name: "Study Hub backup", extensions: ["sqlite", "db"] }]
    });
    if (typeof result !== "string") return null;
    return await readBinaryFile(result);
  } catch {
    return null;
  }
}

function openViaBrowser(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".sqlite,.db";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const buf = await file.arrayBuffer();
      resolve(new Uint8Array(buf));
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_IPC__" in window;
}

export async function exportDatabaseToFile(): Promise<{ ok: boolean; reason?: string }> {
  const bytes = await exportDatabaseBinary();
  const name = defaultFileName();
  if (isTauri()) {
    const saved = await saveViaTauri(bytes, name);
    return saved ? { ok: true } : { ok: false, reason: "Export cancelled." };
  }
  saveViaBrowser(bytes, name);
  return { ok: true };
}

export async function importDatabaseFromFile(): Promise<{ ok: boolean; reason?: string }> {
  const bytes = isTauri() ? await openViaTauri() : await openViaBrowser();
  if (!bytes) return { ok: false, reason: "Import cancelled." };
  try {
    await replaceDatabase(bytes);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, reason: `Not a valid Study Hub backup (${message}).` };
  }
}
