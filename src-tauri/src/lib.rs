use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use device_query::{DeviceQuery, DeviceState};
use tauri::Manager;

/// Tracks whether the desktop-cat cursor feed should be running. `active` is the
/// on/off switch the JS toggles; `running` guards against spawning duplicate
/// emitter threads if start is called twice.
struct PetState {
    active: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
}

const CAT_WINDOW_LABEL: &str = "cat-pet";
const CURSOR_EVENT: &str = "global-cursor";

/// Start streaming the OS-global cursor position to the cat window at ~60Hz.
/// The cat window is click-through, so it can't see mouse events itself — this
/// feed is how it knows where the cursor is in order to flee from it.
#[tauri::command]
fn start_pet_tracking(app: tauri::AppHandle, state: tauri::State<PetState>) {
    state.active.store(true, Ordering::SeqCst);
    // Already have a live emitter thread — flipping `active` back on is enough.
    if state.running.swap(true, Ordering::SeqCst) {
        return;
    }
    let active = state.active.clone();
    let running = state.running.clone();
    thread::spawn(move || {
        let device = DeviceState::new();
        while active.load(Ordering::SeqCst) {
            let coords = device.get_mouse().coords;
            let _ = app.emit_to(
                CAT_WINDOW_LABEL,
                CURSOR_EVENT,
                serde_json::json!({ "x": coords.0, "y": coords.1 }),
            );
            thread::sleep(Duration::from_millis(16));
        }
        running.store(false, Ordering::SeqCst);
    });
}

/// Stop the cursor feed (the emitter thread exits on its next tick).
#[tauri::command]
fn stop_pet_tracking(state: tauri::State<PetState>) {
    state.active.store(false, Ordering::SeqCst);
}

pub fn run() {
    tauri::Builder::default()
        .manage(PetState {
            active: Arc::new(AtomicBool::new(false)),
            running: Arc::new(AtomicBool::new(false)),
        })
        .invoke_handler(tauri::generate_handler![start_pet_tracking, stop_pet_tracking])
        .run(tauri::generate_context!())
        .expect("error while running Study Hub");
}
