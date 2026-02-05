/**
 * Notification Store
 *
 * Manages zap and DM notifications with localStorage persistence.
 * Follows the same singleton + listener pattern as walletStore.ts.
 */

const STORAGE_KEY = "wwz_notifications_v1";
const MAX_NOTIFICATIONS = 200;

export interface Notification {
  id: string;
  type: "zap" | "dm";
  fromPubkey: string;
  content?: string;
  amount?: number;
  conversationPubkey?: string;
  createdAt: number;
  read: boolean;
}

// --- State ---
let _notifications: Notification[] = [];

// State listeners
type StateListener = () => void;
const stateListeners: Set<StateListener> = new Set();

function notifyListeners() {
  stateListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore */
    }
  });
}

// --- Storage ---

function load(): Notification[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    /* ignore */
  }
  return [];
}

function save(notifications: Notification[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch {
    /* ignore */
  }
}

// Initialize
if (typeof window !== "undefined") {
  _notifications = load();
}

// --- Public API ---

export function getNotifications(): Notification[] {
  return _notifications;
}

export function getUnreadCount(): number {
  return _notifications.filter((n) => !n.read).length;
}

export function addNotification(notification: Notification): void {
  // Deduplicate by id
  if (_notifications.some((n) => n.id === notification.id)) return;

  _notifications = [notification, ..._notifications].slice(
    0,
    MAX_NOTIFICATIONS,
  );
  save(_notifications);
  notifyListeners();
}

export function markRead(id: string): void {
  const idx = _notifications.findIndex((n) => n.id === id);
  if (idx === -1 || _notifications[idx].read) return;

  _notifications = _notifications.map((n) =>
    n.id === id ? { ...n, read: true } : n,
  );
  save(_notifications);
  notifyListeners();
}

export function markAllRead(): void {
  if (_notifications.every((n) => n.read)) return;

  _notifications = _notifications.map((n) => ({ ...n, read: true }));
  save(_notifications);
  notifyListeners();
}

export function clearNotifications(): void {
  _notifications = [];
  save(_notifications);
  notifyListeners();
}

export function subscribeToNotificationStore(
  listener: StateListener,
): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}
