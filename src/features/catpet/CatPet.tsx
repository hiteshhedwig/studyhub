import { useEffect, useRef, useState } from "react";
import { appWindow, currentMonitor, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { useSessionTimerStore } from "../../store/sessionTimerStore";
import { CatSprite } from "./CatSprite";
import "./catPet.css";

type Pose = "sit" | "walk" | "run" | "sleep";
type Facing = "left" | "right";
type Point = { x: number; y: number };

// Behaviour tuning (CSS px / px-per-second). The cat bolts when the cursor comes
// within FLEE_RADIUS, walks leisurely otherwise, and sits between wanders.
const FLEE_RADIUS = 150;
const WALK_SPEED = 70;
const RUN_SPEED = 340;
const FLEE_DISTANCE = 260;
const MARGIN = 12;
const CAT_W = 72;
const CAT_H = 80;
// A short stretch when waking, so focus→break doesn't snap straight into roaming.
const WAKE_STRETCH_MS = 1600;
// Generous inset for the nap spot so the cat AND its thought bubble stay fully on
// screen (off the very corner), with room above for the Zzz.
const NAP_INSET = 52;
// Note-quoting cadence while asleep.
const QUOTE_VISIBLE_MS = 10_000;
const QUOTE_GAP_MS = 2600;
const NOTES_CACHE_KEY = "study-hub-notes-cache";

/** A focus block is actively ticking → the cat should go curl up and sleep. */
function focusIsRunning(): boolean {
  const t = useSessionTimerStore.getState();
  return Boolean(t.activeSessionId) && t.isRunning && t.phase === "focus" && !t.awaitingNextPhase && !t.awaitingFinalChoice;
}

export function CatPet() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pose, setPose] = useState<Pose>("sit");
  const [facing, setFacing] = useState<Facing>("right");
  const [quote, setQuote] = useState<string | null>(null);
  const quotes = useRef<string[]>([]);

  // Live simulation values held in refs so the 60fps loop never triggers React
  // re-renders (only pose/facing changes, which are rare, go through state).
  const pos = useRef<Point>({ x: 200, y: 200 });
  const target = useRef<Point>({ x: 200, y: 200 });
  const cursor = useRef<Point | null>(null);
  const bounds = useRef<{ w: number; h: number }>({ w: 800, h: 600 });
  // Global→local conversion: cursor comes in physical screen px; subtract the
  // monitor origin and divide by the scale factor to land in this window's CSS px.
  const monitor = useRef<{ x: number; y: number; scale: number }>({ x: 0, y: 0, scale: 1 });
  const nextWanderAt = useRef<number>(0);
  // Companion mode bookkeeping: whether we're currently heading-to-rest, whether
  // we've actually arrived and curled up, and when a wake stretch ends.
  const resting = useRef<boolean>(false);
  const asleep = useRef<boolean>(false);
  const wakeUntil = useRef<number>(0);

  useEffect(() => {
    let raf = 0;
    let lastTs = 0;
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    function clampX(x: number) {
      return Math.max(MARGIN, Math.min(bounds.current.w - CAT_W - MARGIN, x));
    }
    function clampY(y: number) {
      return Math.max(MARGIN, Math.min(bounds.current.h - CAT_H - MARGIN, y));
    }

    // The cosy nap spot: top-right, but inset from the edges so the cat and its
    // thought bubble (which grows to the left) stay fully on screen.
    function napSpot(): Point {
      return { x: bounds.current.w - CAT_W - NAP_INSET, y: NAP_INSET };
    }

    async function setup() {
      try {
        const mon = await currentMonitor();
        if (mon) {
          monitor.current = { x: mon.position.x, y: mon.position.y, scale: mon.scaleFactor };
          await appWindow.setPosition(new PhysicalPosition(mon.position.x, mon.position.y));
          await appWindow.setSize(new PhysicalSize(mon.size.width, mon.size.height));
          bounds.current = { w: mon.size.width / mon.scaleFactor, h: mon.size.height / mon.scaleFactor };
        } else {
          bounds.current = { w: window.innerWidth, h: window.innerHeight };
        }
        // Click-through everywhere: the cat lives above your work but never eats a click.
        await appWindow.setIgnoreCursorEvents(true);
      } catch {
        // Browser preview (no Tauri) — fall back to the viewport so the loop still runs.
        bounds.current = { w: window.innerWidth, h: window.innerHeight };
      }
      if (cancelled) return;

      pos.current = { x: bounds.current.w * 0.5, y: bounds.current.h * 0.7 };
      target.current = { ...pos.current };
      nextWanderAt.current = performance.now() + 1800;

      unlisten = await listen<{ x: number; y: number }>("global-cursor", (event) => {
        const m = monitor.current;
        cursor.current = { x: (event.payload.x - m.x) / m.scale, y: (event.payload.y - m.y) / m.scale };
      });

      raf = requestAnimationFrame(tick);
    }

    function pickWanderTarget() {
      const reach = 80 + Math.random() * 220;
      const angle = Math.random() * Math.PI * 2;
      target.current = {
        x: clampX(pos.current.x + Math.cos(angle) * reach),
        y: clampY(pos.current.y + Math.sin(angle) * reach)
      };
    }

    function tick(ts: number) {
      const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0;
      lastTs = ts;

      // React to focus state changes: pick up a nap target, or wake with a stretch.
      const shouldRest = focusIsRunning();
      if (shouldRest !== resting.current) {
        resting.current = shouldRest;
        if (shouldRest) {
          target.current = napSpot();
        } else {
          if (asleep.current) wakeUntil.current = ts + WAKE_STRETCH_MS;
          asleep.current = false;
          nextWanderAt.current = ts + WAKE_STRETCH_MS;
        }
      }
      const waking = ts < wakeUntil.current;

      // Already curled up and still in focus — stay asleep, ignore everything.
      if (resting.current && asleep.current) {
        setPose((prev) => (prev === "sleep" ? prev : "sleep"));
        raf = requestAnimationFrame(tick);
        return;
      }

      const cx = pos.current.x + CAT_W / 2;
      const cy = pos.current.y + CAT_H / 2;

      // Flee only while awake, off-duty, and not mid wake-stretch.
      let fleeing = false;
      if (!resting.current && !waking) {
        const c = cursor.current;
        if (c) {
          const dx = cx - c.x;
          const dy = cy - c.y;
          const dist = Math.hypot(dx, dy);
          if (dist < FLEE_RADIUS) {
            fleeing = true;
            const n = dist || 1;
            target.current = {
              x: clampX(pos.current.x + (dx / n) * FLEE_DISTANCE),
              y: clampY(pos.current.y + (dy / n) * FLEE_DISTANCE)
            };
          }
        }
      }

      const tdx = target.current.x - pos.current.x;
      const tdy = target.current.y - pos.current.y;
      const tdist = Math.hypot(tdx, tdy);
      const speed = fleeing ? RUN_SPEED : WALK_SPEED;

      let nextPose: Pose = "sit";
      if (tdist > 2) {
        const step = Math.min(speed * dt, tdist);
        pos.current.x += (tdx / tdist) * step;
        pos.current.y += (tdy / tdist) * step;
        nextPose = fleeing ? "run" : "walk";
        setFacing((prev) => {
          const want: Facing = tdx < 0 ? "left" : "right";
          return prev === want ? prev : want;
        });
      } else if (resting.current) {
        // Reached the corner — curl up and sleep.
        asleep.current = true;
        nextPose = "sleep";
      } else if (!waking && ts > nextWanderAt.current) {
        // Arrived and calm — sit a beat, then meander somewhere new.
        if (Math.random() < 0.7) pickWanderTarget();
        nextWanderAt.current = ts + 2500 + Math.random() * 4000;
      }

      setPose((prev) => (prev === nextPose ? prev : nextPose));

      if (rootRef.current) {
        rootRef.current.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    }

    void setup();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    document.body.classList.add("catpet-body");
    return () => document.body.classList.remove("catpet-body");
  }, []);

  // Pull your notes from the shared cache the main window writes, and stay current
  // as you edit them (localStorage is shared across Tauri windows).
  useEffect(() => {
    function load() {
      try {
        const raw = localStorage.getItem(NOTES_CACHE_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        quotes.current = Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string") : [];
      } catch {
        quotes.current = [];
      }
    }
    load();
    function onStorage(event: StorageEvent) {
      if (event.key === NOTES_CACHE_KEY) load();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // While the cat sleeps, it gently murmurs your notes — one at a time, ~10s each,
  // with a breath between. Cleared the moment it wakes (pose leaves "sleep").
  useEffect(() => {
    if (pose !== "sleep") {
      setQuote(null);
      return;
    }
    let handle = 0;
    function showNext() {
      const pool = quotes.current;
      if (pool.length === 0) {
        handle = window.setTimeout(showNext, 4000); // nothing to say yet — check back
        return;
      }
      setQuote(pool[Math.floor(Math.random() * pool.length)]);
      handle = window.setTimeout(() => {
        setQuote(null);
        handle = window.setTimeout(showNext, QUOTE_GAP_MS);
      }, QUOTE_VISIBLE_MS);
    }
    handle = window.setTimeout(showNext, 1400); // settle in before the first murmur
    return () => {
      window.clearTimeout(handle);
      setQuote(null);
    };
  }, [pose]);

  return (
    <div className="catpet-stage" aria-hidden="true">
      <div className="cat-root" ref={rootRef}>
        {pose === "sleep" && quote ? <div className="cat-bubble" aria-hidden="true">{quote}</div> : null}
        {pose === "sleep" ? (
          <div className="cat-zzz" aria-hidden="true">
            <span>z</span>
            <span>z</span>
            <span>z</span>
          </div>
        ) : null}
        <div className={`cat-sprite pose-${pose} face-${facing}`}>
          <CatSprite pose={pose} />
        </div>
      </div>
    </div>
  );
}
