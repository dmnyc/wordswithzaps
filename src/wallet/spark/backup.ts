/**
 * Spark Wallet Backup to Nostr Relays
 *
 * Backs up the Spark mnemonic to Nostr using NIP-78 (kind 30078)
 * with NIP-44 encryption (falls back to NIP-04).
 */

import { NDKEvent } from "@nostr-dev-kit/ndk";
import { getNDK } from "../../nostr/client";
import { loadMnemonic } from "./storage";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";

const BACKUP_EVENT_KIND = 30078;
const BACKUP_D_TAG_PREFIX = "wordswithzaps-spark-backup";

type EncryptionMethod = "nip44" | "nip04";

/**
 * Generate a wallet ID from mnemonic (first 8 chars of sha256 hash)
 */
function getSparkWalletId(mnemonic: string): string {
  const mnemonicBytes = new TextEncoder().encode(mnemonic.trim().toLowerCase());
  const hash = sha256(mnemonicBytes);
  return bytesToHex(hash).slice(0, 8);
}

/**
 * Get the backup d-tag for a wallet
 */
function getBackupTag(walletId: string | null): string {
  return walletId ? `${BACKUP_D_TAG_PREFIX}-${walletId}` : BACKUP_D_TAG_PREFIX;
}

/**
 * Check if NIP-44 encryption is available
 */
function hasNip44Support(): boolean {
  if (typeof window === "undefined" || !window.nostr) return false;
  return typeof (window.nostr as { nip44?: unknown }).nip44 !== "undefined";
}

/**
 * Check if NIP-04 encryption is available
 */
function hasNip04Support(): boolean {
  if (typeof window === "undefined" || !window.nostr) return false;
  return typeof (window.nostr as { nip04?: unknown }).nip04 !== "undefined";
}

/**
 * Check if any encryption method is available
 */
export function hasEncryptionSupport(): boolean {
  return hasNip44Support() || hasNip04Support();
}

/**
 * Get the best available encryption method
 */
function getBestEncryptionMethod(): EncryptionMethod | null {
  if (hasNip44Support()) return "nip44";
  if (hasNip04Support()) return "nip04";
  return null;
}

/**
 * Detect encryption method from ciphertext format
 */
function detectEncryptionMethod(ciphertext: string): EncryptionMethod {
  // NIP-04 format: base64?iv=base64
  if (ciphertext.includes("?iv=")) {
    return "nip04";
  }
  return "nip44";
}

/**
 * Encrypt content using NIP-07 extension
 */
async function encrypt(
  pubkey: string,
  plaintext: string,
): Promise<{ ciphertext: string; method: EncryptionMethod }> {
  const method = getBestEncryptionMethod();
  if (!method) {
    throw new Error("No encryption method available");
  }

  if (
    method === "nip44" &&
    (
      window.nostr as {
        nip44?: {
          encrypt: (pubkey: string, plaintext: string) => Promise<string>;
        };
      }
    ).nip44
  ) {
    const ciphertext = await (
      window.nostr as {
        nip44: {
          encrypt: (pubkey: string, plaintext: string) => Promise<string>;
        };
      }
    ).nip44.encrypt(pubkey, plaintext);
    return { ciphertext, method: "nip44" };
  }

  if (
    (
      window.nostr as {
        nip04?: {
          encrypt: (pubkey: string, plaintext: string) => Promise<string>;
        };
      }
    ).nip04
  ) {
    const ciphertext = await (
      window.nostr as {
        nip04: {
          encrypt: (pubkey: string, plaintext: string) => Promise<string>;
        };
      }
    ).nip04.encrypt(pubkey, plaintext);
    return { ciphertext, method: "nip04" };
  }

  throw new Error("Encryption failed");
}

/**
 * Decrypt content using NIP-07 extension
 */
async function decrypt(
  pubkey: string,
  ciphertext: string,
  method: EncryptionMethod,
): Promise<string> {
  if (
    method === "nip44" &&
    (
      window.nostr as {
        nip44?: {
          decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
        };
      }
    ).nip44
  ) {
    return await (
      window.nostr as {
        nip44: {
          decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
        };
      }
    ).nip44.decrypt(pubkey, ciphertext);
  }

  if (
    (
      window.nostr as {
        nip04?: {
          decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
        };
      }
    ).nip04
  ) {
    return await (
      window.nostr as {
        nip04: {
          decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
        };
      }
    ).nip04.decrypt(pubkey, ciphertext);
  }

  throw new Error("Decryption failed - no compatible method available");
}

/**
 * Check if an event is a deleted backup
 */
function isDeletedBackupEvent(event: NDKEvent): boolean {
  return event.tags?.some((t) => t[0] === "deleted") || !event.content;
}

/**
 * Backup Spark mnemonic to Nostr relays.
 * Uses NIP-78 (kind 30078) replaceable events with NIP-44/NIP-04 encryption.
 * @param pubkey The user's Nostr public key.
 * @param mnemonic The mnemonic to backup (if not provided, loads from storage).
 */
export async function backupSparkToNostr(
  pubkey: string,
  mnemonic?: string,
): Promise<NDKEvent> {
  const mnemonicToBackup = mnemonic || (await loadMnemonic(pubkey));

  if (!mnemonicToBackup) {
    throw new Error("No mnemonic to backup");
  }

  if (!hasEncryptionSupport()) {
    throw new Error(
      "No encryption method available. Please use a NIP-07 extension with encryption support.",
    );
  }

  const ndk = getNDK();
  const walletId = getSparkWalletId(mnemonicToBackup);
  const backupTag = getBackupTag(walletId);

  // Encrypt the mnemonic
  console.log("[Spark Backup] Encrypting mnemonic...");
  const { ciphertext: encryptedContent, method: encryptionMethod } =
    await encrypt(pubkey, mnemonicToBackup);
  console.log("[Spark Backup] Encrypted with", encryptionMethod);

  // Create the backup event
  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = BACKUP_EVENT_KIND;
  ndkEvent.content = encryptedContent;
  ndkEvent.tags = [
    ["d", backupTag],
    ["client", "wordswithzaps"],
    ["encryption", encryptionMethod],
    ["wallet-type", "spark"],
  ];

  console.log("[Spark Backup] Signing backup event...");
  await ndkEvent.sign();

  console.log("[Spark Backup] Publishing backup to Nostr relays...");
  await ndkEvent.publish();

  console.log("[Spark Backup] Mnemonic backed up to Nostr successfully");
  return ndkEvent;
}

/**
 * Restore Spark mnemonic from Nostr backup.
 * Fetches NIP-78 event and decrypts with NIP-44 or NIP-04.
 * @param pubkey The user's Nostr public key.
 * @returns The decrypted mnemonic if found, null otherwise.
 */
export async function restoreSparkFromNostr(
  pubkey: string,
): Promise<string | null> {
  console.log(
    "[Spark Restore] Starting restore for pubkey:",
    pubkey.slice(0, 8) + "...",
  );

  if (!hasEncryptionSupport()) {
    throw new Error(
      "No decryption method available. Please use a NIP-07 extension with encryption support.",
    );
  }

  const ndk = getNDK();

  // Query for backup events (both legacy and multi-wallet)
  const filter = {
    kinds: [BACKUP_EVENT_KIND],
    authors: [pubkey],
  };
  console.log("[Spark Restore] Fetching backup events...");

  const events = await ndk.fetchEvents(filter, { closeOnEose: true });
  console.log("[Spark Restore] Found", events?.size || 0, "events");

  if (!events || events.size === 0) {
    console.log("[Spark Restore] No backup found on Nostr relays");
    return null;
  }

  // Find the most recent valid Spark backup
  let latestEvent: NDKEvent | null = null;
  for (const event of events) {
    // Check if it's a Spark backup (d-tag starts with our prefix)
    const dTag = event.tags?.find((t) => t[0] === "d")?.[1];
    if (!dTag || !dTag.startsWith(BACKUP_D_TAG_PREFIX)) continue;

    // Skip deleted events
    if (isDeletedBackupEvent(event)) continue;

    // Check wallet-type tag if present
    const walletType = event.tags?.find((t) => t[0] === "wallet-type")?.[1];
    if (walletType && walletType !== "spark") continue;

    if (
      !latestEvent ||
      (event.created_at || 0) > (latestEvent.created_at || 0)
    ) {
      latestEvent = event;
    }
  }

  if (!latestEvent || !latestEvent.content) {
    console.log("[Spark Restore] No valid Spark backup found");
    return null;
  }

  // Determine encryption method
  const encryptionTag = latestEvent.tags?.find((t) => t[0] === "encryption");
  let encryptionMethod: EncryptionMethod;
  if (encryptionTag?.[1] === "nip04" || encryptionTag?.[1] === "nip44") {
    encryptionMethod = encryptionTag[1] as EncryptionMethod;
  } else {
    encryptionMethod = detectEncryptionMethod(latestEvent.content);
  }
  console.log("[Spark Restore] Encryption method:", encryptionMethod);

  // Decrypt the mnemonic
  console.log("[Spark Restore] Decrypting mnemonic...");
  const mnemonic = await decrypt(pubkey, latestEvent.content, encryptionMethod);

  if (!mnemonic) {
    throw new Error(
      "Failed to decrypt backup. Make sure you are using the same Nostr key.",
    );
  }

  // Basic validation - check it looks like a mnemonic
  const words = mnemonic.trim().split(/\s+/);
  const validWordCounts = [12, 15, 18, 21, 24];
  if (!validWordCounts.includes(words.length)) {
    throw new Error("Decrypted data does not appear to be a valid mnemonic.");
  }

  console.log(
    "[Spark Restore] Successfully restored mnemonic from Nostr backup",
  );
  return mnemonic;
}

/**
 * Check if a Spark backup exists on Nostr relays.
 * @param pubkey The user's Nostr public key.
 * @returns True if a backup exists, false otherwise.
 */
export async function hasSparkBackupOnNostr(pubkey: string): Promise<boolean> {
  try {
    const ndk = getNDK();

    const filter = {
      kinds: [BACKUP_EVENT_KIND],
      authors: [pubkey],
    };

    const events = await ndk.fetchEvents(filter, { closeOnEose: true });

    if (events && events.size > 0) {
      for (const event of events) {
        const dTag = event.tags?.find((t) => t[0] === "d")?.[1];
        if (
          dTag &&
          dTag.startsWith(BACKUP_D_TAG_PREFIX) &&
          !isDeletedBackupEvent(event)
        ) {
          return true;
        }
      }
    }

    return false;
  } catch (e) {
    console.error("[Spark Backup] Error checking for backup:", e);
    return false;
  }
}

/**
 * Delete Spark wallet backup from Nostr relays.
 * Publishes an empty replaceable event to overwrite the backup.
 * @param pubkey The user's Nostr public key.
 */
export async function deleteSparkBackupFromNostr(
  pubkey: string,
): Promise<void> {
  const ndk = getNDK();

  // Get wallet ID from stored mnemonic
  const mnemonic = await loadMnemonic(pubkey);
  const walletId = mnemonic ? getSparkWalletId(mnemonic) : null;
  const backupTag = getBackupTag(walletId);

  console.log(
    "[Spark Backup] Deleting backup by publishing empty replacement...",
  );

  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = BACKUP_EVENT_KIND;
  ndkEvent.content = "";
  ndkEvent.tags = [
    ["d", backupTag],
    ["deleted", "true"],
  ];

  await ndkEvent.sign();
  await ndkEvent.publish();

  console.log("[Spark Backup] Backup deleted (replaced with empty event)");
}

export default {
  backupSparkToNostr,
  restoreSparkFromNostr,
  hasSparkBackupOnNostr,
  deleteSparkBackupFromNostr,
  hasEncryptionSupport,
};
