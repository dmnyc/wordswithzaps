import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  getChatMessages,
  getUnreadCount,
  markChatRead,
  subscribeToGameChatStore,
  type GameChatMessage,
} from "../stores/gameChatStore";
import {
  sendGameChatMessage,
  subscribeToGameChat,
} from "../nostr/gameChat";
import { getCurrentUser } from "../nostr/client";

interface UseGameChatArgs {
  gameId: string;
  creatorPubkey: string;
  otherPlayerPubkey: string;
}

interface UseGameChatReturn {
  messages: GameChatMessage[];
  unreadCount: number;
  myPubkey: string;
  send: (text: string) => Promise<void>;
  markRead: () => void;
}

function subscribe(callback: () => void): () => void {
  return subscribeToGameChatStore(callback);
}

/**
 * Subscribe to a single game's kind 1111 chat. Starts a Nostr
 * subscription on mount and tears it down on unmount or when the
 * game/creator changes.
 */
export function useGameChat({
  gameId,
  creatorPubkey,
  otherPlayerPubkey,
}: UseGameChatArgs): UseGameChatReturn {
  const myPubkey = getCurrentUser()?.pubkey || "";

  // Start the relay subscription as soon as we know who the creator is.
  useEffect(() => {
    if (!gameId || !creatorPubkey) return;
    const unsubscribe = subscribeToGameChat({ gameId, creatorPubkey });
    return unsubscribe;
  }, [gameId, creatorPubkey]);

  const getSnapshot = useCallback(
    () => ({
      messages: getChatMessages(gameId),
      unreadCount: getUnreadCount(gameId, myPubkey),
    }),
    [gameId, myPubkey],
  );

  // useSyncExternalStore requires getSnapshot to return the same reference
  // when the data hasn't changed. We compare messages by id+pending+failed.
  const cachedRef = useRef<{
    messages: GameChatMessage[];
    unreadCount: number;
  }>({ messages: [], unreadCount: 0 });
  const stableGetSnapshot = useCallback(() => {
    const next = getSnapshot();
    const prev = cachedRef.current;
    const sameLen = prev.messages.length === next.messages.length;
    const sameUnread = prev.unreadCount === next.unreadCount;
    const sameMsgs =
      sameLen &&
      prev.messages.every((m, i) => {
        const n = next.messages[i];
        return (
          m.id === n.id &&
          m.pending === n.pending &&
          m.failed === n.failed &&
          m.content === n.content
        );
      });
    if (sameMsgs && sameUnread) return prev;
    cachedRef.current = next;
    return next;
  }, [getSnapshot]);

  const snapshot = useSyncExternalStore(subscribe, stableGetSnapshot);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await sendGameChatMessage({
        gameId,
        creatorPubkey,
        otherPlayerPubkey,
        content: trimmed,
      });
    },
    [gameId, creatorPubkey, otherPlayerPubkey],
  );

  const markRead = useCallback(() => {
    markChatRead(gameId);
  }, [gameId]);

  return {
    messages: snapshot.messages,
    unreadCount: snapshot.unreadCount,
    myPubkey,
    send,
    markRead,
  };
}
