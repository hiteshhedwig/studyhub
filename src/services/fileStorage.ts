export async function pickLocalFile(extensions?: string[]): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/api/dialog");
    const result = await open({
      multiple: false,
      filters: extensions ? [{ name: "Supported files", extensions }] : undefined
    });
    return typeof result === "string" ? result : null;
  } catch {
    return null;
  }
}

export async function readTextFile(path: string): Promise<string> {
  try {
    const { readTextFile: tauriReadTextFile } = await import("@tauri-apps/api/fs");
    return await tauriReadTextFile(path);
  } catch {
    throw new Error("File reading is available inside the Tauri desktop app.");
  }
}

export async function openLocalPath(path: string): Promise<void> {
  try {
    const { open } = await import("@tauri-apps/api/shell");
    await open(path);
  } catch {
    window.open(path, "_blank");
  }
}

export function inferFileType(path: string) {
  const match = path.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() ?? "file";
}
