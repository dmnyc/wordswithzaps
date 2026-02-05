import { useSyncExternalStore } from "react";
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
  clearNotifications,
  subscribeToNotificationStore,
} from "../stores/notificationStore";
import { getTotalUnreadCount } from "../stores/dmStore";
import type { Notification } from "../stores/notificationStore";

let _snapshot = {
  notifications: getNotifications(),
  unreadCount: getUnreadCount(),
  dmUnreadCount: getTotalUnreadCount(),
};

function subscribe(callback: () => void): () => void {
  return subscribeToNotificationStore(callback);
}

function getSnapshot() {
  const notifications = getNotifications();
  const unreadCount = getUnreadCount();
  const dmUnreadCount = getTotalUnreadCount();

  if (
    notifications !== _snapshot.notifications ||
    unreadCount !== _snapshot.unreadCount ||
    dmUnreadCount !== _snapshot.dmUnreadCount
  ) {
    _snapshot = { notifications, unreadCount, dmUnreadCount };
  }
  return _snapshot;
}

export function useNotifications(): {
  notifications: Notification[];
  unreadCount: number;
  dmUnreadCount: number;
  totalUnread: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearNotifications: () => void;
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  return {
    notifications: snapshot.notifications,
    unreadCount: snapshot.unreadCount,
    dmUnreadCount: snapshot.dmUnreadCount,
    totalUnread: snapshot.unreadCount + snapshot.dmUnreadCount,
    markAllRead,
    markRead,
    clearNotifications,
  };
}
