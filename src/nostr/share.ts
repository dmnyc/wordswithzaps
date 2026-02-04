import { nip19 } from "nostr-tools";
import { generateSecretKey } from "nostr-tools";
import { NDKEvent, NDKUser, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { getNDK, createEvent, publishEvent } from "./client";
import { encryptDirectMessage } from "./encryption";

export type ShareMode =
  | "none"
  | "public"
  | "public-reply"
  | "private"
  | "private-dm";

/**
 * Publish a message to Nostr using one of the supported share modes.
 */
export async function publishShareMessage(options: {
  text: string;
  shareMode: "public" | "public-reply" | "private" | "private-dm";
  recipientPubkey: string;
  replyTo?: string;
}): Promise<void> {
  const { text, shareMode, recipientPubkey, replyTo } = options;

  if (shareMode === "public") {
    const event = createEvent(1, text, [
      ["t", "wordswithzaps"],
      ["client", "Words With Zaps"],
      ...(recipientPubkey ? [["p", recipientPubkey]] : []),
    ]);
    await publishEvent(event);
  } else if (shareMode === "public-reply") {
    if (!replyTo) {
      throw new Error("No note ID provided for reply.");
    }
    let eventId = replyTo;
    if (eventId.startsWith("note1")) {
      const decoded = nip19.decode(eventId);
      if (decoded.type !== "note") throw new Error("Invalid note ID.");
      eventId = decoded.data;
    } else if (eventId.startsWith("nevent1")) {
      const decoded = nip19.decode(eventId);
      if (decoded.type !== "nevent") throw new Error("Invalid nevent ID.");
      eventId = decoded.data.id;
    }
    const replyEvent = createEvent(1, text, [
      ["e", eventId, "", "root"],
      ["t", "wordswithzaps"],
      ["client", "Words With Zaps"],
      ...(recipientPubkey ? [["p", recipientPubkey]] : []),
    ]);
    await publishEvent(replyEvent);
  } else if (shareMode === "private-dm") {
    if (!recipientPubkey) {
      throw new Error("Opponent pubkey not available for DM.");
    }
    const ndk = getNDK();
    const signer = ndk.signer;
    if (!signer) throw new Error("No signer available.");
    const sender = await signer.user();
    const recipient = new NDKUser({ pubkey: recipientPubkey });
    recipient.ndk = ndk;

    const now = Math.floor(Date.now() / 1000);
    const twoDays = 2 * 24 * 60 * 60;
    const randomTs = () => now - Math.floor(Math.random() * twoDays);

    // Rumor (unsigned kind 14) — real timestamp for display
    const rumor = {
      kind: 14,
      content: text,
      tags: [["p", recipientPubkey]],
      created_at: now,
      pubkey: sender.pubkey,
    };

    // Seal (kind 13) - encrypt rumor to recipient
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
    wrap.tags = [["p", recipientPubkey]];
    wrap.created_at = randomTs();
    await wrap.sign(ephemeralSigner);

    // Publish with timeout so slow relays don't block
    const pub = wrap.publish();
    const timeout = new Promise<void>((r) => setTimeout(r, 3000));
    await Promise.race([pub, timeout]);
  } else if (shareMode === "private") {
    if (!recipientPubkey) {
      throw new Error("Opponent pubkey not available for DM.");
    }
    const encrypted = await encryptDirectMessage(recipientPubkey, text);
    const event = createEvent(4, encrypted, [["p", recipientPubkey]]);
    await publishEvent(event);
  }
}
