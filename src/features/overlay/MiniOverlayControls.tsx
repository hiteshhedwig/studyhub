import { X, Minimize2, Maximize2 } from "lucide-react";

export function MiniOverlayControls({
  collapsed,
  onCollapse,
  onClose
}: {
  collapsed: boolean;
  onCollapse: () => void;
  onClose: () => void;
}) {
  return (
    <div className="overlay-controls" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" aria-label={collapsed ? "Expand overlay" : "Collapse overlay"} onClick={onCollapse}>
        {collapsed ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
      </button>
      <button type="button" aria-label="Close Mini Overlay" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}
