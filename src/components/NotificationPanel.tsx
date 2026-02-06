import { useEffect, useRef, useState } from "react";
import { useNotifications } from "../hooks/useNotifications";
import { fetchProfile } from "../nostr/profiles";
import type { NostrProfile } from "../types/nostr";
import type { Notification } from "../stores/notificationStore";
import { MessageIcon } from "./icons/NotificationIcons";
import "./NotificationPanel.css";

const MAX_PREVIEW = 50;
type TabFilter = "all" | "zaps" | "messages";

interface NotificationPanelProps {
  onClose: () => void;
  onOpenMessages?: (pubkey?: string) => void;
}

function formatTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

function getMessage(notification: Notification): string {
  if (notification.type === "zap") {
    const sats = notification.amount;
    return sats ? `zapped you ${sats.toLocaleString()} sats` : "zapped you";
  }
  return "sent you a message";
}

function getTypeIcon(type: Notification["type"]): string {
  return type === "zap" ? "\u26A1" : "\uD83D\uDCAC";
}

export default function NotificationPanel({
  onClose,
  onOpenMessages,
}: NotificationPanelProps) {
  const { notifications, markAllRead } = useNotifications();
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(
    new Map(),
  );
  const inFlight = useRef<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabFilter>("all");

  // Auto-mark read after 500ms
  useEffect(() => {
    const timer = setTimeout(markAllRead, 500);
    return () => clearTimeout(timer);
  }, [markAllRead]);

  // Fetch profiles for all notification senders
  const notifPubkeys = [...new Set(notifications.map((n) => n.fromPubkey))];
  useEffect(() => {
    const missing = notifPubkeys.filter(
      (pk) => !profiles.has(pk) && !inFlight.current.has(pk),
    );
    if (missing.length === 0) return;

    // Mark as in-flight to prevent duplicate fetches
    missing.forEach((pk) => inFlight.current.add(pk));

    Promise.all(missing.map((pk) => fetchProfile(pk))).then((results) => {
      // Clear in-flight
      missing.forEach((pk) => inFlight.current.delete(pk));

      const newProfiles = new Map<string, NostrProfile>();
      results.forEach((profile, i) => {
        if (profile) newProfiles.set(missing[i], profile);
      });
      if (newProfiles.size > 0) {
        setProfiles((prev) => {
          const next = new Map(prev);
          newProfiles.forEach((p, pk) => next.set(pk, p));
          return next;
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifPubkeys.length]);

  const filtered =
    activeTab === "all"
      ? notifications
      : activeTab === "zaps"
        ? notifications.filter((n) => n.type === "zap")
        : notifications.filter((n) => n.type === "dm");
  const displayed = filtered.slice(0, MAX_PREVIEW);

  const zapCount = notifications.filter((n) => n.type === "zap").length;
  const dmCount = notifications.filter((n) => n.type === "dm").length;

  return (
    <div className="notification-panel">
      <div className="notification-panel-header">
        <span className="notification-panel-title">Notifications</span>
        <div className="notification-tabs">
          <button
            className={`notification-tab ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All
          </button>
          <button
            className={`notification-tab ${activeTab === "zaps" ? "active" : ""}`}
            onClick={() => setActiveTab("zaps")}
          >
            Zaps{zapCount > 0 ? ` (${zapCount})` : ""}
          </button>
          <button
            className={`notification-tab ${activeTab === "messages" ? "active" : ""}`}
            onClick={() => setActiveTab("messages")}
          >
            DMs{dmCount > 0 ? ` (${dmCount})` : ""}
          </button>
        </div>
      </div>

      {displayed.length === 0 ? (
        <div className="notification-panel-empty">
          {activeTab === "zaps"
            ? "No zaps yet"
            : activeTab === "messages"
              ? "No messages yet"
              : "No notifications yet"}
        </div>
      ) : (
        <div className="notification-panel-list">
          {displayed.map((n) => {
            const profile = profiles.get(n.fromPubkey);
            const displayName =
              profile?.displayName ||
              profile?.name ||
              n.fromPubkey.slice(0, 8) + "...";
            const picture = profile?.picture;

            return (
              <button
                key={n.id}
                className={`notification-item ${n.read ? "" : "unread"}`}
                onClick={() => {
                  if (n.type === "dm" && n.conversationPubkey) {
                    onOpenMessages?.(n.conversationPubkey);
                  }
                  onClose();
                }}
              >
                <div className="notification-item-avatar">
                  {picture ? (
                    <img
                      src={picture}
                      alt=""
                      className="notification-avatar-img"
                    />
                  ) : (
                    <div className="notification-avatar-fallback">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="notification-type-badge">
                    {getTypeIcon(n.type)}
                  </span>
                </div>
                <div className="notification-item-body">
                  <div className="notification-item-top">
                    <span className="notification-item-name">
                      {displayName}
                    </span>
                    <span className="notification-item-time">
                      {formatTime(n.createdAt)}
                    </span>
                  </div>
                  <div className="notification-item-message">
                    {getMessage(n)}
                  </div>
                  {n.type === "zap" && n.amount && (
                    <div className="notification-item-zap-amount">
                      {n.amount.toLocaleString()} sats
                    </div>
                  )}
                  {n.content && (
                    <div className="notification-item-preview">
                      {n.content.length > 60
                        ? n.content.slice(0, 60) + "..."
                        : n.content}
                    </div>
                  )}
                </div>
                {!n.read && <span className="notification-unread-dot" />}
              </button>
            );
          })}
        </div>
      )}

      {onOpenMessages && (
        <div className="notification-panel-footer">
          <button
            className="notification-panel-open-messages"
            onClick={() => onOpenMessages()}
          >
            <MessageIcon className="notification-footer-icon" />
            Open Messages
          </button>
        </div>
      )}
    </div>
  );
}
