/**
 * Game Chat Store
 *
 * Per-game in-game chat backed by NIP-22 kind 1111 events.
 * Messages live under their game's addressable coordinate so each game
 * gets its own isolated thread. Persisted to localStorage so chat history
 * survives reloads.
 */

const MESSAGE_KEY_PREFIX = "wwz_chat_";
const META_KEY_PREFIX = "wwz_chat_meta_";
const MAX_MESSAGES_PER_GAME = 200;

export interface GameChatMessage {
  id: string;
  gameId: string;
  fromPubkey: string;
  content: string;
  createdAt: number;
  pending?: boolean;
  failed?: boolean;
}

interface GameChatMeta {
  lastReadAt: number;
}

const _messages = new Map<string, GameChatMessage[]>();
const _meta = new Map<string, GameChatMeta>();

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

function loadMessages(gameId: string): GameChatMessage[] {
  const cached = _messages.get(gameId);
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(`${MESSAGE_KEY_PREFIX}${gameId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as GameChatMessage[];
      _messages.set(gameId, parsed);
      return parsed;
    }
  } catch {
    /* ignore */
  }
  const empty: GameChatMessage[] = [];
  _messages.set(gameId, empty);
  return empty;
}

function saveMessages(gameId: string, messages: GameChatMessage[]): void {
  _messages.set(gameId, messages);
  try {
    localStorage.setItem(
      `${MESSAGE_KEY_PREFIX}${gameId}`,
      JSON.stringify(messages),
    );
  } catch {
    /* ignore */
  }
}

function loadMeta(gameId: string): GameChatMeta {
  const cached = _meta.get(gameId);
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(`${META_KEY_PREFIX}${gameId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as GameChatMeta;
      _meta.set(gameId, parsed);
      return parsed;
    }
  } catch {
    /* ignore */
  }
  const fresh: GameChatMeta = { lastReadAt: 0 };
  _meta.set(gameId, fresh);
  return fresh;
}

function saveMeta(gameId: string, meta: GameChatMeta): void {
  _meta.set(gameId, meta);
  try {
    localStorage.setItem(`${META_KEY_PREFIX}${gameId}`, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

export function getChatMessages(gameId: string): GameChatMessage[] {
  return loadMessages(gameId)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function getUnreadCount(gameId: string, myPubkey: string): number {
  const meta = loadMeta(gameId);
  const messages = loadMessages(gameId);
  let count = 0;
  for (const m of messages) {
    if (m.fromPubkey !== myPubkey && m.createdAt > meta.lastReadAt) count++;
  }
  return count;
}

export function addChatMessage(message: GameChatMessage): boolean {
  const messages = loadMessages(message.gameId);

  // Dedup by event id
  if (messages.some((m) => m.id === message.id)) return false;

  // Replace any pending placeholder with the same content+sender within a small window
  const pendingIdx = messages.findIndex(
    (m) =>
      m.pending &&
      m.fromPubkey === message.fromPubkey &&
      m.content === message.content &&
      Math.abs(m.createdAt - message.createdAt) < 60,
  );

  let updated: GameChatMessage[];
  if (pendingIdx !== -1) {
    updated = messages.slice();
    updated[pendingIdx] = message;
  } else {
    updated = [...messages, message];
  }

  updated = updated
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-MAX_MESSAGES_PER_GAME);

  saveMessages(message.gameId, updated);
  notifyListeners();
  return true;
}

export function updateChatMessageStatus(
  gameId: string,
  messageId: string,
  patch: { id?: string; pending?: boolean; failed?: boolean },
): void {
  const messages = loadMessages(gameId);
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx === -1) return;
  const next = messages.slice();
  next[idx] = { ...next[idx], ...patch };
  saveMessages(gameId, next);
  notifyListeners();
}

export function markChatRead(gameId: string): void {
  const meta = loadMeta(gameId);
  const now = Math.floor(Date.now() / 1000);
  if (meta.lastReadAt >= now) return;
  saveMeta(gameId, { ...meta, lastReadAt: now });
  notifyListeners();
}

export function subscribeToGameChatStore(
  listener: StateListener,
): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}
