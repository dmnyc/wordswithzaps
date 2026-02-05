/**
 * DM Module
 *
 * Handles sending/receiving DMs via NIP-04 (legacy) and NIP-17 (private).
 * Manages subscriptions for incoming messages and zap receipts.
 */

import { generateSecretKey } from "nostr-tools";
import { NDKEvent, NDKPrivateKeySigner, NDKRelaySet } from "@nostr-dev-kit/ndk";
import type { NDKFilter } from "@nostr-dev-kit/ndk";
import {
  getNDK,
  getCurrentUser,
  createEvent,
  publishEvent,
  subscribeToEvents,
  fetchEvents,
} from "./client";
import { encryptDirectMessage, decryptDirectMessage } from "./encryption";
import { addMessage } from "../stores/dmStore";
import { addNotification } from "../stores/notificationStore";
import type { DMMessage } from "../stores/dmStore";
import { DM_RELAY_KIND } from "../types/nostr";

// --- Subscription management ---
type Unsub = { unsubscribe: () => void };
let _nip04Unsub: Unsub | null = null;
let _nip17Unsub: Unsub | null = null;
let _zapUnsub: Unsub | null = null;
const _processedIds = new Set<string>();

/**
 * Start all DM and notification subscriptions.
 * Called when user connects.
 */
export function startSubscriptions(userPubkey: string): void {
  stopSubscriptions();
  _processedIds.clear();

  _nip04Unsub = subscribeNip04(userPubkey);
  _nip17Unsub = subscribeNip17(userPubkey);
  _zapUnsub = subscribeZapReceipts(userPubkey);
}

/**
 * Stop all subscriptions. Called on disconnect.
 */
export function stopSubscriptions(): void {
  _nip04Unsub?.unsubscribe();
  _nip04Unsub = null;
  _nip17Unsub?.unsubscribe();
  _nip17Unsub = null;
  _zapUnsub?.unsubscribe();
  _zapUnsub = null;
}

// --- NIP-04 (Legacy DMs) ---

function subscribeNip04(userPubkey: string): Unsub {
  const since = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60; // 7 days
  const filter: NDKFilter = {
    kinds: [4],
    "#p": [userPubkey],
    since,
  };

  // Also subscribe to our own sent messages
  const sentFilter: NDKFilter = {
    kinds: [4],
    authors: [userPubkey],
    since,
  };

  const handleEvent = async (event: NDKEvent) => {
    if (_processedIds.has(event.id)) return;
    _processedIds.add(event.id);

    try {
      const isOwnMessage = event.pubkey === userPubkey;
      const otherPubkey = isOwnMessage
        ? event.tags.find((t) => t[0] === "p")?.[1] || ""
        : event.pubkey;

      if (!otherPubkey) return;

      const plaintext = await decryptDirectMessage(
        isOwnMessage ? otherPubkey : event.pubkey,
        event.content,
      );

      const msg: DMMessage = {
        id: event.id,
        fromPubkey: event.pubkey,
        toPubkey: isOwnMessage ? otherPubkey : userPubkey,
        content: plaintext,
        createdAt: event.created_at || Math.floor(Date.now() / 1000),
        protocol: "nip04",
      };

      addMessage(msg, isOwnMessage);

      if (!isOwnMessage) {
        addNotification({
          id: `dm_${event.id}`,
          type: "dm",
          fromPubkey: event.pubkey,
          content:
            plaintext.length > 100
              ? plaintext.slice(0, 100) + "..."
              : plaintext,
          conversationPubkey: event.pubkey,
          createdAt: event.created_at || Math.floor(Date.now() / 1000),
          read: false,
        });
      }
    } catch (err) {
      console.warn("[DM] Failed to decrypt NIP-04 message:", err);
    }
  };

  const sub1 = subscribeToEvents(filter, handleEvent);
  const sub2 = subscribeToEvents(sentFilter, handleEvent);

  return {
    unsubscribe: () => {
      sub1.unsubscribe();
      sub2.unsubscribe();
    },
  };
}

export async function sendNip04DM(
  recipientPubkey: string,
  text: string,
): Promise<DMMessage> {
  const user = getCurrentUser();
  if (!user?.pubkey) throw new Error("Not connected");

  const encrypted = await encryptDirectMessage(recipientPubkey, text);
  const event = createEvent(4, encrypted, [["p", recipientPubkey]]);
  await publishEvent(event);

  const msg: DMMessage = {
    id: event.id || `pending_${Date.now()}`,
    fromPubkey: user.pubkey,
    toPubkey: recipientPubkey,
    content: text,
    createdAt: Math.floor(Date.now() / 1000),
    protocol: "nip04",
  };

  addMessage(msg, true);
  return msg;
}

// --- NIP-17 (Private DMs via Gift Wrap) ---

function subscribeNip17(userPubkey: string): Unsub {
  const since = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const filter: NDKFilter = {
    kinds: [1059],
    "#p": [userPubkey],
    since,
  };

  const handleEvent = async (event: NDKEvent) => {
    if (_processedIds.has(event.id)) return;
    _processedIds.add(event.id);

    try {
      const rumor = await unwrapGiftWrap(event, userPubkey);
      if (!rumor || rumor.kind !== 14) return;

      const isOwnMessage = rumor.pubkey === userPubkey;
      const otherPubkey = isOwnMessage
        ? rumor.tags?.find((t: string[]) => t[0] === "p")?.[1] || ""
        : rumor.pubkey;

      if (!otherPubkey) return;

      const msg: DMMessage = {
        id: rumor.id || event.id,
        fromPubkey: rumor.pubkey,
        toPubkey: isOwnMessage ? otherPubkey : userPubkey,
        content: rumor.content,
        createdAt: rumor.created_at || Math.floor(Date.now() / 1000),
        protocol: "nip17",
      };

      addMessage(msg, isOwnMessage);

      if (!isOwnMessage) {
        addNotification({
          id: `dm_${rumor.id || event.id}`,
          type: "dm",
          fromPubkey: rumor.pubkey,
          content:
            rumor.content.length > 100
              ? rumor.content.slice(0, 100) + "..."
              : rumor.content,
          conversationPubkey: rumor.pubkey,
          createdAt: rumor.created_at || Math.floor(Date.now() / 1000),
          read: false,
        });
      }
    } catch (err) {
      console.warn("[DM] Failed to unwrap NIP-17 gift wrap:", err);
    }
  };

  return subscribeToEvents(filter, handleEvent);
}

/**
 * Unwrap a NIP-17 gift wrap: kind 1059 → kind 13 (seal) → kind 14 (rumor)
 */
async function unwrapGiftWrap(
  giftWrap: NDKEvent,
  _userPubkey: string,
): Promise<{
  id: string;
  pubkey: string;
  content: string;
  kind: number;
  created_at: number;
  tags: string[][];
} | null> {
  const ndk = getNDK();
  const signer = ndk.signer;
  if (!signer) return null;

  try {
    // Decrypt gift wrap content → seal (kind 13)
    const wrapSender = ndk.getUser({ pubkey: giftWrap.pubkey });
    const sealJson = await signer.decrypt(
      wrapSender,
      giftWrap.content,
      "nip44",
    );
    const seal = JSON.parse(sealJson);

    if (seal.kind !== 13) return null;

    // Decrypt seal content → rumor (kind 14)
    const sealSender = ndk.getUser({ pubkey: seal.pubkey });
    const rumorJson = await signer.decrypt(sealSender, seal.content, "nip44");
    const rumor = JSON.parse(rumorJson);

    // Verify pubkey chain: seal pubkey must match rumor pubkey
    if (seal.pubkey !== rumor.pubkey) {
      console.warn("[DM] NIP-17 pubkey mismatch: seal vs rumor");
      return null;
    }

    return rumor;
  } catch (err) {
    console.warn("[DM] Failed to unwrap gift wrap:", err);
    return null;
  }
}

export async function sendNip17DM(
  recipientPubkey: string,
  text: string,
): Promise<DMMessage> {
  const ndk = getNDK();
  const signer = ndk.signer;
  if (!signer) throw new Error("No signer available");

  const sender = await signer.user();
  const now = Math.floor(Date.now() / 1000);
  const twoDays = 2 * 24 * 60 * 60;
  const randomTs = () => now - Math.floor(Math.random() * twoDays);

  // Rumor (unsigned kind 14)
  const rumor = {
    kind: 14,
    content: text,
    tags: [["p", recipientPubkey]],
    created_at: now,
    pubkey: sender.pubkey,
  };

  // Send to recipient
  await sendGiftWrap(rumor, recipientPubkey, signer, ndk, randomTs);

  // Send self-copy so we can recover sent messages
  await sendGiftWrap(rumor, sender.pubkey, signer, ndk, randomTs);

  const msg: DMMessage = {
    id: `nip17_${now}_${Math.random().toString(36).slice(2, 9)}`,
    fromPubkey: sender.pubkey,
    toPubkey: recipientPubkey,
    content: text,
    createdAt: now,
    protocol: "nip17",
  };

  addMessage(msg, true);
  return msg;
}

async function sendGiftWrap(
  rumor: Record<string, unknown>,
  targetPubkey: string,
  signer: NonNullable<ReturnType<typeof getNDK>["signer"]>,
  ndk: ReturnType<typeof getNDK>,
  randomTs: () => number,
): Promise<void> {
  const recipient = ndk.getUser({ pubkey: targetPubkey });

  // Seal (kind 13) - encrypt rumor to target
  const sealContent = await signer.encrypt(
    recipient,
    JSON.stringify(rumor),
    "nip44",
  );
  const seal = new NDKEvent(ndk);
  seal.kind = 13;
  seal.content = sealContent;
  seal.created_at = randomTs();
  await seal.sign(signer);

  // Gift wrap (kind 1059) with ephemeral key
  const ephemeralSigner = new NDKPrivateKeySigner(generateSecretKey());
  const wrapContent = await ephemeralSigner.encrypt(
    recipient,
    JSON.stringify(seal.rawEvent()),
    "nip44",
  );
  const wrap = new NDKEvent(ndk);
  wrap.kind = 1059;
  wrap.content = wrapContent;
  wrap.tags = [["p", targetPubkey]];
  wrap.created_at = randomTs();
  await wrap.sign(ephemeralSigner);

  // Try to publish to recipient's DM relays, fall back to pool
  try {
    const dmRelays = await fetchDMRelays(targetPubkey);
    if (dmRelays.length > 0) {
      const poolRelayUrls = Array.from(ndk.pool.relays.values()).map(
        (r) => r.url,
      );
      const allRelays = [...new Set([...poolRelayUrls, ...dmRelays])];
      const relaySet = NDKRelaySet.fromRelayUrls(allRelays, ndk, true);
      const pub = wrap.publish(relaySet);
      const timeout = new Promise<void>((r) => setTimeout(r, 3000));
      await Promise.race([pub, timeout]);
      return;
    }
  } catch {
    // Fall through to default publish
  }

  const pub = wrap.publish();
  const timeout = new Promise<void>((r) => setTimeout(r, 3000));
  await Promise.race([pub, timeout]);
}

// --- DM Relay Preferences (Kind 10050) ---

const _dmRelayCache = new Map<
  string,
  { relays: string[]; fetchedAt: number }
>();
const DM_RELAY_CACHE_TTL = 5 * 60_000;

export async function fetchDMRelays(pubkey: string): Promise<string[]> {
  const cached = _dmRelayCache.get(pubkey);
  if (cached && Date.now() - cached.fetchedAt < DM_RELAY_CACHE_TTL) {
    return cached.relays;
  }

  const events = await fetchEvents({
    kinds: [DM_RELAY_KIND],
    authors: [pubkey],
    limit: 5,
  });

  if (events.length === 0) {
    _dmRelayCache.set(pubkey, { relays: [], fetchedAt: Date.now() });
    return [];
  }

  const latest = events.sort(
    (a, b) => (b.created_at || 0) - (a.created_at || 0),
  )[0];

  const relays = latest.tags
    .filter((t) => t[0] === "relay" && t[1])
    .map((t) => t[1]);

  _dmRelayCache.set(pubkey, { relays, fetchedAt: Date.now() });
  return relays;
}

/**
 * Check if a pubkey supports NIP-17 (has kind 10050 relays published).
 */
export async function supportsNip17(pubkey: string): Promise<boolean> {
  const relays = await fetchDMRelays(pubkey);
  return relays.length > 0;
}

// --- Zap Receipt Subscriptions ---

function subscribeZapReceipts(userPubkey: string): Unsub {
  const since = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const filter: NDKFilter = {
    kinds: [9735],
    "#p": [userPubkey],
    since,
  };

  return subscribeToEvents(filter, (event: NDKEvent) => {
    if (_processedIds.has(event.id)) return;
    _processedIds.add(event.id);

    try {
      const descriptionTag = event.tags.find((t) => t[0] === "description");
      if (!descriptionTag?.[1]) return;

      const zapRequest = JSON.parse(descriptionTag[1]);
      const senderPubkey = zapRequest.pubkey;
      if (!senderPubkey || senderPubkey === userPubkey) return;

      // Extract amount from bolt11
      let amountSats: number | undefined;
      const bolt11Tag = event.tags.find((t) => t[0] === "bolt11");
      if (bolt11Tag?.[1]) {
        amountSats = parseBolt11Amount(bolt11Tag[1]);
      }

      // Fall back to zap request amount tag
      if (!amountSats) {
        const amountTag = zapRequest.tags?.find(
          (t: string[]) => t[0] === "amount",
        );
        if (amountTag?.[1]) {
          amountSats = Math.floor(parseInt(amountTag[1], 10) / 1000);
        }
      }

      const zapComment = zapRequest.content || undefined;

      addNotification({
        id: `zap_${event.id}`,
        type: "zap",
        fromPubkey: senderPubkey,
        content: zapComment,
        amount: amountSats,
        createdAt: event.created_at || Math.floor(Date.now() / 1000),
        read: false,
      });
    } catch {
      // Ignore malformed zap receipts
    }
  });
}

/**
 * Parse amount in sats from a bolt11 invoice string.
 * Handles the standard BOLT11 amount encoding.
 */
function parseBolt11Amount(bolt11: string): number | undefined {
  const lower = bolt11.toLowerCase();
  // Match lnbc<amount><multiplier>
  const match = lower.match(/^lnbc(\d+)([munp]?)1/);
  if (!match) return undefined;

  const num = parseInt(match[1], 10);
  const multiplier = match[2];

  switch (multiplier) {
    case "":
      return num * 100_000_000; // BTC to sats
    case "m":
      return num * 100_000; // mBTC to sats
    case "u":
      return num * 100; // uBTC to sats
    case "n":
      return Math.floor(num / 10); // nBTC to sats
    case "p":
      return Math.floor(num / 10_000); // pBTC to sats
    default:
      return undefined;
  }
}
