/**
 * Game Chat (NIP-22 kind 1111)
 *
 * Public, in-game live chat scoped to a single game's addressable
 * kind-30078 event. Anyone with the game id and creator pubkey can
 * read; both players can write.
 *
 * Tagging follows NIP-22:
 *   - Uppercase A/K/P identify the root scope (the game event).
 *   - Lowercase a/k/p identify the parent (same as root for top-level messages).
 *   - An additional p tag for the other player ensures notification routing.
 */

import type { NDKEvent, NDKFilter } from "@nostr-dev-kit/ndk";
import {
  createEvent,
  getCurrentUser,
  publishEvent,
  subscribeToEvents,
} from "./client";
import { GAME_KIND, GAME_D_TAG_PREFIX } from "../types/nostr";
import {
  addChatMessage,
  updateChatMessageStatus,
  type GameChatMessage,
} from "../stores/gameChatStore";
import type { ShareImageAttachment } from "./share";

const CHAT_KIND = 1111;

/**
 * Build the addressable coordinate for the game event.
 * Format: "<kind>:<creator_pubkey>:<d-tag>"
 */
export function gameChatCoordinate(
  gameId: string,
  creatorPubkey: string,
): string {
  return `${GAME_KIND}:${creatorPubkey}:${GAME_D_TAG_PREFIX}${gameId}`;
}

interface SubscribeOptions {
  gameId: string;
  creatorPubkey: string;
}

/**
 * Subscribe to all kind 1111 chat events for a game.
 * Decoded messages are pushed into gameChatStore. Returns an
 * unsubscribe function.
 */
export function subscribeToGameChat({
  gameId,
  creatorPubkey,
}: SubscribeOptions): () => void {
  const coord = gameChatCoordinate(gameId, creatorPubkey);

  // Filter on lowercase #a (parent tag) for broadest relay support;
  // every published chat event sets `a` to the game coordinate.
  const filter: NDKFilter = {
    kinds: [CHAT_KIND],
    "#a": [coord],
  };

  const handleEvent = (event: NDKEvent) => {
    if (!event.id || !event.pubkey || !event.content) return;
    const msg: GameChatMessage = {
      id: event.id,
      gameId,
      fromPubkey: event.pubkey,
      content: event.content,
      createdAt: event.created_at || Math.floor(Date.now() / 1000),
    };
    addChatMessage(msg);
  };

  const sub = subscribeToEvents(filter, handleEvent);
  return () => sub.unsubscribe();
}

interface SendOptions {
  gameId: string;
  creatorPubkey: string;
  otherPlayerPubkey: string;
  content: string;
  image?: ShareImageAttachment;
}

function buildImetaTag(image: ShareImageAttachment): string[] {
  const parts = [`url ${image.url}`];
  if (image.mime) parts.push(`m ${image.mime}`);
  if (image.hash) parts.push(`x ${image.hash}`);
  if (image.width && image.height)
    parts.push(`dim ${image.width}x${image.height}`);
  if (image.alt) parts.push(`alt ${image.alt}`);
  return ["imeta", ...parts];
}

/**
 * Publish a kind 1111 chat message scoped to a single game.
 * Optimistically adds a pending message to the store, then upgrades it
 * to confirmed once relays accept the event (or marks it failed).
 */
export async function sendGameChatMessage({
  gameId,
  creatorPubkey,
  otherPlayerPubkey,
  content,
  image,
}: SendOptions): Promise<GameChatMessage> {
  const trimmed = content.trim();
  if (!trimmed && !image) throw new Error("Message is empty");

  const user = getCurrentUser();
  if (!user?.pubkey) throw new Error("Not connected");

  const coord = gameChatCoordinate(gameId, creatorPubkey);
  const now = Math.floor(Date.now() / 1000);

  // If we have an image but no text, the URL becomes the message body.
  // If both, append the URL on a new line.
  let body = trimmed;
  if (image) {
    if (!body) body = image.url;
    else if (!body.includes(image.url)) body = `${body}\n\n${image.url}`;
  }

  const tags: string[][] = [
    // NIP-22 root scope (uppercase)
    ["A", coord],
    ["K", String(GAME_KIND)],
    ["P", creatorPubkey],
    // NIP-22 parent (same as root for top-level chat)
    ["a", coord],
    ["k", String(GAME_KIND)],
    ["p", creatorPubkey],
    // Extra p tag so the other player gets notified (deduped if same as creator)
    ...(otherPlayerPubkey && otherPlayerPubkey !== creatorPubkey
      ? [["p", otherPlayerPubkey]]
      : []),
    ...(image ? [buildImetaTag(image)] : []),
    ["client", "Words With Zaps"],
  ];

  const event = createEvent(CHAT_KIND, body, tags);

  // Optimistic placeholder so the sender sees their message immediately
  const tempId = `pending_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const pendingMsg: GameChatMessage = {
    id: tempId,
    gameId,
    fromPubkey: user.pubkey,
    content: body,
    createdAt: now,
    pending: true,
  };
  addChatMessage(pendingMsg);

  try {
    await publishEvent(event);
    const finalId = event.id || tempId;
    updateChatMessageStatus(gameId, tempId, {
      id: finalId,
      pending: false,
      failed: false,
    });
    return { ...pendingMsg, id: finalId, pending: false };
  } catch (err) {
    updateChatMessageStatus(gameId, tempId, {
      pending: false,
      failed: true,
    });
    throw err;
  }
}
