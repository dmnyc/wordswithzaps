/**
 * DM Store
 *
 * Manages DM conversations and messages with localStorage persistence.
 * Conversations are stored individually to keep payload sizes small.
 */

const CONVERSATIONS_KEY = "wwz_dm_conversations";
const MESSAGE_KEY_PREFIX = "wwz_dm_";
const MAX_MESSAGES_PER_CONVO = 500;

export interface DMMessage {
  id: string;
  fromPubkey: string;
  toPubkey: string;
  content: string;
  createdAt: number;
  protocol: "nip04" | "nip17";
  pending?: boolean;
  failed?: boolean;
}

export interface DMConversation {
  pubkey: string;
  lastMessageAt: number;
  lastMessagePreview: string;
  unreadCount: number;
  protocol: "nip04" | "nip17";
}

// --- State ---
let _conversations: DMConversation[] = [];
const _messageCache = new Map<string, DMMessage[]>();

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

function loadConversations(): DMConversation[] {
  try {
    const stored = localStorage.getItem(CONVERSATIONS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* ignore */
  }
  return [];
}

function saveConversations(): void {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(_conversations));
  } catch {
    /* ignore */
  }
}

function loadMessages(pubkey: string): DMMessage[] {
  const cached = _messageCache.get(pubkey);
  if (cached) return cached;

  try {
    const stored = localStorage.getItem(`${MESSAGE_KEY_PREFIX}${pubkey}`);
    if (stored) {
      const messages = JSON.parse(stored) as DMMessage[];
      _messageCache.set(pubkey, messages);
      return messages;
    }
  } catch {
    /* ignore */
  }
  return [];
}

function saveMessages(pubkey: string, messages: DMMessage[]): void {
  _messageCache.set(pubkey, messages);
  try {
    localStorage.setItem(
      `${MESSAGE_KEY_PREFIX}${pubkey}`,
      JSON.stringify(messages),
    );
  } catch {
    /* ignore */
  }
}

// Initialize
if (typeof window !== "undefined") {
  _conversations = loadConversations();
}

// --- Public API ---

export function getConversations(): DMConversation[] {
  return _conversations.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export function getConversation(pubkey: string): DMConversation | undefined {
  return _conversations.find((c) => c.pubkey === pubkey);
}

export function getMessages(pubkey: string): DMMessage[] {
  return loadMessages(pubkey).sort((a, b) => a.createdAt - b.createdAt);
}

export function getTotalUnreadCount(): number {
  return _conversations.reduce((sum, c) => sum + c.unreadCount, 0);
}

export function addMessage(
  message: DMMessage,
  isOwnMessage: boolean,
): void {
  const otherPubkey = isOwnMessage ? message.toPubkey : message.fromPubkey;
  const messages = loadMessages(otherPubkey);

  // Deduplicate
  if (messages.some((m) => m.id === message.id)) return;

  const updated = [...messages, message]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-MAX_MESSAGES_PER_CONVO);
  saveMessages(otherPubkey, updated);

  // Update or create conversation
  const existing = _conversations.find((c) => c.pubkey === otherPubkey);
  const preview =
    message.content.length > 80
      ? message.content.slice(0, 80) + "..."
      : message.content;

  if (existing) {
    _conversations = _conversations.map((c) =>
      c.pubkey === otherPubkey
        ? {
            ...c,
            lastMessageAt: Math.max(c.lastMessageAt, message.createdAt),
            lastMessagePreview: preview,
            unreadCount: isOwnMessage ? c.unreadCount : c.unreadCount + 1,
            protocol: message.protocol,
          }
        : c,
    );
  } else {
    _conversations = [
      ..._conversations,
      {
        pubkey: otherPubkey,
        lastMessageAt: message.createdAt,
        lastMessagePreview: preview,
        unreadCount: isOwnMessage ? 0 : 1,
        protocol: message.protocol,
      },
    ];
  }

  saveConversations();
  notifyListeners();
}

export function updateMessageStatus(
  messageId: string,
  pubkey: string,
  update: { pending?: boolean; failed?: boolean },
): void {
  const messages = loadMessages(pubkey);
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx === -1) return;

  messages[idx] = { ...messages[idx], ...update };
  saveMessages(pubkey, messages);
  notifyListeners();
}

export function markConversationRead(pubkey: string): void {
  const existing = _conversations.find((c) => c.pubkey === pubkey);
  if (!existing || existing.unreadCount === 0) return;

  _conversations = _conversations.map((c) =>
    c.pubkey === pubkey ? { ...c, unreadCount: 0 } : c,
  );
  saveConversations();
  notifyListeners();
}

export function setConversationProtocol(
  pubkey: string,
  protocol: "nip04" | "nip17",
): void {
  _conversations = _conversations.map((c) =>
    c.pubkey === pubkey ? { ...c, protocol } : c,
  );
  saveConversations();
  notifyListeners();
}

export function subscribeToDMStore(listener: StateListener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}
