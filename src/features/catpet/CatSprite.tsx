import catSit from "./sprites/cat-sit.png";
import catSleep from "./sprites/cat-sleep.png";
import catWalk from "./sprites/cat-walk.png";

// Real cropped frames from the calico/tabby reference sheet. Every frame shares a
// common bottom-centered canvas so the cat's feet stay planted as poses switch.
// Authored facing right; the parent flips for leftward movement.
type Pose = "sit" | "walk" | "run" | "sleep";

const FRAME: Record<Pose, string> = {
  sit: catSit,
  walk: catWalk,
  run: catWalk, // same frame, faster bob (set by the pose class)
  sleep: catSleep
};

export function CatSprite({ pose }: { pose: Pose }) {
  return <img className="cat-img" src={FRAME[pose]} alt="" draggable={false} />;
}
