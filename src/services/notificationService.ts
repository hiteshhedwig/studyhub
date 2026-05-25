export async function notifyRevision(title: string, body: string) {
  try {
    const notifications = await import("@tauri-apps/api/notification");
    let allowed = await notifications.isPermissionGranted();
    if (!allowed) {
      const permission = await notifications.requestPermission();
      allowed = permission === "granted";
    }
    if (allowed) notifications.sendNotification({ title, body });
  } catch {
    // Browser preview cannot display Tauri notifications.
  }
}
