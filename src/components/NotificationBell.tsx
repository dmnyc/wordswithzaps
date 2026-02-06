import { useState, useRef, useEffect } from "react";
import { useNotifications } from "../hooks/useNotifications";
import { BellIcon, BellFilledIcon } from "./icons/NotificationIcons";
import NotificationPanel from "./NotificationPanel";
import "./NotificationBell.css";

interface NotificationBellProps {
  onOpenMessages?: (pubkey?: string) => void;
}

export default function NotificationBell({
  onOpenMessages,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { totalUnread } = useNotifications();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="notification-bell-wrap" ref={ref}>
      <button
        className="notification-bell-btn"
        onClick={() => setOpen((prev) => !prev)}
        title="Notifications"
      >
        {totalUnread > 0 ? (
          <BellFilledIcon className="notification-bell-icon active" />
        ) : (
          <BellIcon className="notification-bell-icon" />
        )}
        {totalUnread > 0 && (
          <span className="notification-badge">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>
      {open && (
        <NotificationPanel
          onClose={() => setOpen(false)}
          onOpenMessages={(pubkey) => {
            setOpen(false);
            onOpenMessages?.(pubkey);
          }}
        />
      )}
    </div>
  );
}
