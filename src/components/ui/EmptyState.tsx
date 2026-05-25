import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";

export function EmptyState({ children, icon: Icon = Inbox }: { children: ReactNode; icon?: LucideIcon | null }) {
  return (
    <div className="empty">
      {Icon ? (
        <span className="empty-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
      ) : null}
      <span>{children}</span>
    </div>
  );
}
