/**
 * Spark Wallet Mnemonic Storage
 *
 * Stores the Breez SDK mnemonic in localStorage, encrypted with NIP-44
 * (encrypt-to-self). Only the user's Nostr private key can decrypt it.
 *
 * V1 (legacy): AES-GCM with key derived from pubkey (effectively unencrypted
 * since pubkey is public). Detected as raw hex string in localStorage.
 *
 * V2 (current): NIP-44 encrypt-to-self via the user's Nostr signer.
 * Stored as JSON: { version: 2, ciphertext: "<nip44_blob>" }
 */

import { sha256 } from "@noble/hashes/sha2";
import { hexToBytes } from "@noble/hashes/utils";
import { getEncryptionProvider } from "../../nostr/encryption";
import { getCurrentUser } from "../../nostr/client";

const LOCAL_STORAGE_KEY_PREFIX = "spark_wallet_";

interface EncryptedMnemonicV2 {
  version: 2;
  ciphertext: string;
}

// ── V1 Legacy (kept only for migration) ──────────────────────────────────

async function deriveKeyLegacy(pubkey: string): Promise<CryptoKey> {
  const pubkeyBytes = hexToBytes(pubkey);
  const keyMaterial = sha256(pubkeyBytes);
  const keyBuffer = new Uint8Array(keyMaterial).buffer as ArrayBuffer;
  return crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function decryptV1(pubkey: string, storedHex: string): Promise<string | null> {
  try {
    const storedData = hexToBytes(storedHex);
    const iv = storedData.slice(0, 12);
    const ciphertext = storedData.slice(12);
    const key = await deriveKeyLegacy(pubkey);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("[Spark Storage] Failed to decrypt V1 mnemonic:", error);
    return null;
  }
}

// ── V2 NIP-44 ────────────────────────────────────────────────────────────

function isV2(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    return parsed?.version === 2;
  } catch {
    return false;
  }
}

/**
 * Saves an encrypted mnemonic to localStorage using NIP-44 encrypt-to-self.
 */
export async function saveMnemonic(
  pubkey: string,
  mnemonic: string,
): Promise<void> {
  const user = getCurrentUser();
  if (!user?.pubkey) {
    throw new Error("Must be logged in to save mnemonic");
  }

  const provider = getEncryptionProvider();
  const ciphertext = await provider.encrypt(user.pubkey, mnemonic);

  const data: EncryptedMnemonicV2 = { version: 2, ciphertext };
  localStorage.setItem(
    `${LOCAL_STORAGE_KEY_PREFIX}${pubkey}`,
    JSON.stringify(data),
  );
}

/**
 * Loads and decrypts a mnemonic from localStorage.
 * Handles both V2 (NIP-44) and V1 (legacy AES-GCM) formats.
 * V1 mnemonics are silently migrated to V2 on load.
 */
export async function loadMnemonic(pubkey: string): Promise<string | null> {
  const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${pubkey}`);
  if (!raw) return null;

  // V2: NIP-44 encrypted
  if (isV2(raw)) {
    try {
      const data: EncryptedMnemonicV2 = JSON.parse(raw);
      const user = getCurrentUser();
      if (!user?.pubkey) {
        console.error("[Spark Storage] Not logged in, cannot decrypt V2 mnemonic");
        return null;
      }
      const provider = getEncryptionProvider();
      return await provider.decrypt(user.pubkey, data.ciphertext);
    } catch (error) {
      console.error("[Spark Storage] Failed to decrypt V2 mnemonic:", error);
      return null;
    }
  }

  // V1 legacy: AES-GCM with pubkey-derived key
  const mnemonic = await decryptV1(pubkey, raw);
  if (mnemonic) {
    // Silent migration: re-encrypt as V2
    try {
      await saveMnemonic(pubkey, mnemonic);
      console.log("[Spark Storage] Migrated mnemonic from V1 to V2 (NIP-44)");
    } catch (error) {
      // Migration failed (e.g. signer not ready) — not fatal, will retry next load
      console.warn("[Spark Storage] V1→V2 migration deferred:", error);
    }
  }
  return mnemonic;
}

/**
 * Checks if a mnemonic exists in local storage for a given public key.
 * @param pubkey The user's Nostr public key (hex string).
 * @returns True if a mnemonic exists, false otherwise.
 */
export function hasMnemonic(pubkey: string): boolean {
  return localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${pubkey}`) !== null;
}

/**
 * Deletes a mnemonic from local storage for a given public key.
 * @param pubkey The user's Nostr public key (hex string).
 */
export function deleteMnemonic(pubkey: string): void {
  localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}${pubkey}`);
}

/**
 * Clears all Spark wallet mnemonics from local storage.
 */
export function clearAllSparkWallets(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LOCAL_STORAGE_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

export default {
  saveMnemonic,
  loadMnemonic,
  hasMnemonic,
  deleteMnemonic,
  clearAllSparkWallets,
};
