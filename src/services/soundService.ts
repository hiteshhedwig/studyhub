// Small Web Audio bells. No bundled assets — generated on the fly.
//
// The same timer ticks in both the main window and the mini overlay, so a
// short cross-window lock in localStorage prevents the same beep from
// playing twice within a ~1.2s window.

const LOCK_PREFIX = "study-hub-sound-lock:";
const LOCK_TTL_MS = 1200;
const VOLUME_KEY = "study-hub-sound-volume";
const DEFAULT_VOLUME = 1;
const MAX_VOLUME = 5;

let context: AudioContext | null = null;
let warnedNoAudio = false;

export function getVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw == null) return DEFAULT_VOLUME;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_VOLUME;
    return Math.max(0, Math.min(MAX_VOLUME, parsed));
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function setVolume(value: number) {
  const clamped = Math.max(0, Math.min(MAX_VOLUME, value));
  try {
    localStorage.setItem(VOLUME_KEY, String(clamped));
  } catch {
    // ignore
  }
}

export const SOUND_VOLUME_MAX = MAX_VOLUME;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) {
    if (!warnedNoAudio) {
      warnedNoAudio = true;
      console.warn("[study-hub sound] AudioContext is not available in this webview.");
    }
    return null;
  }
  context = new Ctor();
  console.info("[study-hub sound] AudioContext created, state =", context.state);
  return context;
}

function claimLock(key: string): boolean {
  try {
    const lockKey = LOCK_PREFIX + key;
    const existing = localStorage.getItem(lockKey);
    const now = Date.now();
    if (existing && now - Number(existing) < LOCK_TTL_MS) return false;
    localStorage.setItem(lockKey, String(now));
    return true;
  } catch {
    return true;
  }
}

function tone(frequency: number, durationSec: number, basePeakGain: number, volumeOverride?: number) {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch((err) => console.warn("[study-hub sound] resume failed", err));
  }
  const volume = volumeOverride ?? getVolume();
  if (volume <= 0) return;
  // Cap final peak at 0.95 to avoid clipping when the slider is cranked.
  const peakGain = Math.min(0.95, Math.max(0.0005, basePeakGain * volume));
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.04);
}

// Base peak gains chosen so that at volume = 1.0 the cues are clearly
// audible (~10x louder than the original very-soft mix). The volume slider
// scales these from 0x (mute) up to 2x.
const TICK_BASE_GAIN = 0.5;
const BELL_BASE_GAIN_LOW = 0.7;
const BELL_BASE_GAIN_HIGH = 0.6;

// A short tick for the last-5-seconds warning.
export function playPreEndTick(key: string) {
  if (!claimLock("tick:" + key)) return;
  tone(880, 0.14, TICK_BASE_GAIN);
}

// A fuller two-note bell when a phase actually ends.
export function playPhaseEndBell(key: string) {
  if (!claimLock("bell:" + key)) return;
  tone(660, 0.55, BELL_BASE_GAIN_LOW);
  setTimeout(() => tone(990, 0.65, BELL_BASE_GAIN_HIGH), 140);
}

// Plays the bell once at an explicit volume so the settings screen can
// preview without changing the saved value.
export function previewBell(volumeOverride: number) {
  tone(660, 0.55, BELL_BASE_GAIN_LOW, volumeOverride);
  setTimeout(() => tone(990, 0.65, BELL_BASE_GAIN_HIGH, volumeOverride), 140);
}

// WebKitGTK / Chromium require a user gesture before audio plays. Calling
// this synchronously inside a click/pointerdown handler creates the context
// and resumes it so subsequent beeps are audible.
export function unlockAudio() {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume()
      .then(() => console.info("[study-hub sound] AudioContext resumed."))
      .catch((err) => console.warn("[study-hub sound] resume failed", err));
  }
  // Play an inaudible blip to fully prime the pipeline on stricter engines.
  tone(440, 0.02, 0.0005);
}
