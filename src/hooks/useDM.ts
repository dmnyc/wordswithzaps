import { useCallback, useSyncExternalStore } from "react";
import {
  getConversations,
  getConversation,
  getMessages,
  getTotalUnreadCount,
  markConversationRead,
  setConversationProtocol,
  subscribeToDMStore,
} from "../stores/dmStore";
import { sendNip04DM, sendNip17DM, supportsNip17 } from "../nostr/dm";
import type { DMConversation, DMMessage } from "../stores/dmStore";

let _snapshot = {
  conversations: getConversations(),
  totalUnread: getTotalUnreadCount(),
};

function subscribe(callback: () => void): () => void {
  return subscribeToDMStore(callback);
}

function getSnapshot() {
  const conversations = getConversations();
  const totalUnread = getTotalUnreadCount();

  if (
    conversations !== _snapshot.conversations ||
    totalUnread !== _snapshot.totalUnread
  ) {
    _snapshot = { conversations, totalUnread };
  }
  return _snapshot;
}

export function useDM(): {
  conversations: DMConversation[];
  totalUnread: number;
  getMessages: (pubkey: string) => DMMessage[];
  getConversation: (pubkey: string) => DMConversation | undefined;
  markConversationRead: (pubkey: string) => void;
  setConversationProtocol: (
    pubkey: string,
    protocol: "nip04" | "nip17",
  ) => void;
  sendMessage: (
    recipientPubkey: string,
    text: string,
    protocol?: "nip04" | "nip17",
  ) => Promise<DMMessage>;
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  const sendMessage = useCallback(
    async (
      recipientPubkey: string,
      text: string,
      protocol?: "nip04" | "nip17",
    ): Promise<DMMessage> => {
      // Use explicit protocol if provided, otherwise check conversation preference
      let useNip17 = false;
      if (protocol) {
        useNip17 = protocol === "nip17";
      } else {
        const convo = getConversation(recipientPubkey);
        if (convo) {
          useNip17 = convo.protocol === "nip17";
        } else {
          useNip17 = await supportsNip17(recipientPubkey);
        }
      }

      if (useNip17) {
        return sendNip17DM(recipientPubkey, text);
      }
      return sendNip04DM(recipientPubkey, text);
    },
    [],
  );

  return {
    conversations: snapshot.conversations,
    totalUnread: snapshot.totalUnread,
    getMessages,
    getConversation,
    markConversationRead,
    setConversationProtocol,
    sendMessage,
  };
}
