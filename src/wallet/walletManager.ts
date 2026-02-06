/**
 * Wallet Manager
 *
 * Unified interface for managing wallet types.
 * Routes operations to Spark (embedded) or Bitcoin Connect (external).
 */

import {
  WalletKind,
  type Wallet,
  type ZapParams,
  type Transaction,
} from "../types/wallet";
import {
  getWalletStoreState,
  subscribeToWalletStore,
  addWallet,
  removeWallet,
  setActiveWallet,
  getActiveWallet,
  setWalletBalance,
  setWalletLoading,
  setWalletLastSync,
} from "./walletStore";
import {
  connectWallet as connectSparkWallet,
  disconnectWallet as disconnectSparkWallet,
  getSparkBalance,
  sendSparkPayment,
  createSparkInvoice,
  isSparkInitialized,
  getSparkLightningAddress,
  hasSparkMnemonic,
  deleteSparkMnemonic,
  getSparkState,
  listSparkPayments,
  subscribeToSparkState,
} from "./spark";
import {
  isBitcoinConnectEnabled,
  payWithBitcoinConnect,
  initBitcoinConnect,
} from "./bitcoinConnect";
import { getCurrentUser } from "../nostr/client";
import { fetchUserProfile, createEvent, getNDK } from "../nostr/client";

// Environment variable for Breez API key
const BREEZ_API_KEY = import.meta.env?.VITE_BREEZ_SPARK_API_KEY || "";

// State
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;
let sparkStateUnsubscribe: (() => void) | null = null;

function syncSparkStateToStore(): void {
  const active = getActiveWallet();
  if (!active || active.kind !== WalletKind.SPARK) return;
  const sparkState = getSparkState();
  if (sparkState.balance !== null && sparkState.balance !== undefined) {
    setWalletBalance(sparkState.balance);
    setWalletLastSync(Date.now());
  }
}

function ensureSparkStateBridge(): void {
  if (sparkStateUnsubscribe) return;
  sparkStateUnsubscribe = subscribeToSparkState(() => {
    syncSparkStateToStore();
  });
}

// Re-export wallet store state access
export { getWalletStoreState, subscribeToWalletStore };

/**
 * Check if input is a Lightning address
 */
function isLightningAddress(input: string): boolean {
  return /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(input.trim());
}

/**
 * Connect a new wallet
 */
export async function connectWallet(
  kind: WalletKind,
): Promise<{ success: boolean; wallet?: Wallet; error?: string }> {
  try {
    setWalletLoading(true);
    ensureSparkStateBridge();

    let name: string;

    switch (kind) {
      case WalletKind.SPARK:
        const currentUser = getCurrentUser();
        if (!currentUser?.pubkey) {
          throw new Error("Must be logged in to connect Spark wallet");
        }
        if (!BREEZ_API_KEY) {
          throw new Error("Breez API key not configured");
        }
        const connected = await connectSparkWallet(
          currentUser.pubkey,
          BREEZ_API_KEY,
        );
        if (!connected) {
          throw new Error("Failed to connect Spark wallet");
        }
        name = "Spark Wallet";
        break;

      default:
        throw new Error(`Unknown wallet kind: ${kind}`);
    }

    // Add to wallet store
    const wallet = addWallet(kind, name, {});

    // Make it active
    setActiveWallet(wallet.id);

    // Sync balance from Spark state if available
    syncSparkStateToStore();

    await refreshBalance();
    return { success: true, wallet };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Connection failed";
    console.error("[WalletManager] Connection failed:", error);
    return { success: false, error };
  } finally {
    setWalletLoading(false);
  }
}

/**
 * Disconnect a wallet
 */
export async function disconnectWallet(walletId?: string): Promise<void> {
  const state = getWalletStoreState();
  const wallet = walletId
    ? state.wallets.find((w) => w.id === walletId)
    : getActiveWallet();

  if (!wallet) {
    console.warn("[WalletManager] No wallet to disconnect");
    return;
  }

  try {
    switch (wallet.kind) {
      case WalletKind.SPARK:
        await disconnectSparkWallet();
        // Delete the mnemonic from storage so wallet can be re-added
        const currentUser = getCurrentUser();
        if (currentUser?.pubkey) {
          deleteSparkMnemonic(currentUser.pubkey);
        }
        break;
    }

    removeWallet(wallet.id);
  } catch (e) {
    console.error("[WalletManager] Disconnect error:", e);
    // Still remove from store even if disconnect fails
    removeWallet(wallet.id);
    // Also delete mnemonic on error for Spark wallets
    if (wallet.kind === WalletKind.SPARK) {
      const currentUser = getCurrentUser();
      if (currentUser?.pubkey) {
        deleteSparkMnemonic(currentUser.pubkey);
      }
    }
  }
}

/**
 * Ensure the active wallet is connected (reconnect if needed)
 */
async function ensureWalletConnected(wallet: Wallet): Promise<boolean> {
  try {
    switch (wallet.kind) {
      case WalletKind.SPARK:
        if (!isSparkInitialized()) {
          const currentUser = getCurrentUser();
          if (BREEZ_API_KEY && currentUser?.pubkey) {
            try {
              const connected = await connectSparkWallet(
                currentUser.pubkey,
                BREEZ_API_KEY,
              );
              return connected;
            } catch (error) {
              console.warn("[WalletManager] Spark reconnect failed:", error);
              return false;
            }
          }
          return false;
        }
        return true;

      default:
        return false;
    }
  } catch (e) {
    console.warn("[WalletManager] Failed to reconnect wallet:", e);
    return false;
  }
}

/**
 * Refresh wallet balance
 * @param forceSync If true, forces a sync before getting balance (slower but more accurate)
 */
export async function refreshBalance(
  forceSync = false,
): Promise<number | null> {
  const wallet = getActiveWallet();

  if (!wallet) {
    setWalletBalance(null);
    return null;
  }

  try {
    setWalletLoading(true);

    const connected = await ensureWalletConnected(wallet);
    if (!connected) {
      setWalletBalance(null);
      return null;
    }

    let balance: number | null | undefined = null;

    switch (wallet.kind) {
      case WalletKind.SPARK:
        try {
          balance = await getSparkBalance(forceSync);
        } catch (e) {
          console.warn("[WalletManager] Spark balance fetch failed:", e);
          const sparkState = getSparkState();
          balance = sparkState.balance;
        }
        break;
    }

    if (balance !== null && balance !== undefined) {
      setWalletBalance(balance);
      setWalletLastSync(Date.now());
    }
    return balance ?? null;
  } catch (e) {
    console.error("[WalletManager] Failed to refresh balance:", e);
    setWalletBalance(null);
    return null;
  } finally {
    setWalletLoading(false);
  }
}

/**
 * Send a payment via the active wallet
 */
export async function sendPayment(
  invoice: string,
  metadata?: { amount?: number; description?: string; comment?: string },
): Promise<{ success: boolean; preimage?: string; error?: string }> {
  const wallet = getActiveWallet();

  // Try BitcoinConnect if no embedded wallet
  if (!wallet) {
    if (isBitcoinConnectEnabled()) {
      try {
        let bolt11Invoice = invoice;

        // If it's a lightning address, we need to resolve it to an invoice first
        if (isLightningAddress(invoice)) {
          if (!metadata?.amount) {
            throw new Error(
              "Amount is required for Lightning address payments",
            );
          }
          bolt11Invoice = await getInvoiceFromLightningAddress(
            invoice,
            metadata.amount,
            metadata?.comment,
          );
        }

        const result = await payWithBitcoinConnect(bolt11Invoice);
        return { success: true, preimage: result.preimage };
      } catch (e) {
        const error = e instanceof Error ? e.message : "Payment failed";
        return { success: false, error };
      }
    }
    return { success: false, error: "No wallet connected" };
  }

  try {
    setWalletLoading(true);

    const connected = await ensureWalletConnected(wallet);
    if (!connected) {
      // Fall back to BitcoinConnect if available
      if (isBitcoinConnectEnabled()) {
        const result = await payWithBitcoinConnect(invoice);
        return { success: true, preimage: result.preimage };
      }
      throw new Error("Wallet not connected");
    }

    let preimage: string;

    switch (wallet.kind) {
      case WalletKind.SPARK:
        const result = await sendSparkPayment(
          invoice,
          metadata?.amount,
          metadata?.comment,
        );
        preimage = result.preimage;
        break;

      default:
        throw new Error(`Unknown wallet kind: ${wallet.kind}`);
    }

    await refreshBalance();
    return { success: true, preimage };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Payment failed";
    console.error("[WalletManager] Payment failed:", e);
    return { success: false, error };
  } finally {
    setWalletLoading(false);
  }
}

/**
 * Create an invoice for receiving payment
 */
export async function createInvoice(
  amountSats: number,
  description?: string,
): Promise<{ invoice: string; paymentHash?: string }> {
  const wallet = getActiveWallet();

  if (!wallet) {
    throw new Error("No wallet connected");
  }

  if (amountSats <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  try {
    setWalletLoading(true);

    const connected = await ensureWalletConnected(wallet);
    if (!connected) {
      throw new Error("Wallet not connected");
    }

    switch (wallet.kind) {
      case WalletKind.SPARK:
        return await createSparkInvoice(amountSats, description);

      default:
        throw new Error("Wallet does not support receiving");
    }
  } finally {
    setWalletLoading(false);
  }
}

const ZAP_FETCH_TIMEOUT = 20000; // 20s timeout for LNURL fetches (longer for mobile networks)

async function fetchWithTimeout(
  input: string | URL,
  timeoutMs: number = ZAP_FETCH_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = input.toString();

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
      }
      throw new Error(`Failed to fetch ${url}: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Zap a user (game move notification)
 */
export async function zapUser(params: ZapParams): Promise<string> {
  const { recipientPubkey, amountSats, moveDescription } = params;

  // Fetch recipient's Lightning address
  const recipientUser = await fetchUserProfile(recipientPubkey);
  const lud16 = recipientUser.profile?.lud16;
  const lud06 = recipientUser.profile?.lud06;

  if (!lud16 && !lud06) {
    throw new Error("Recipient has no Lightning address configured");
  }

  // Get LNURL pay endpoint
  let lnurlPayUrl: string;
  if (lud16) {
    const [name, domain] = lud16.split("@");
    lnurlPayUrl = `https://${domain}/.well-known/lnurlp/${name}`;
  } else {
    lnurlPayUrl = decodeLnurl(lud06!);
  }

  // Fetch LNURL pay info
  const lnurlResponse = await fetchWithTimeout(lnurlPayUrl);
  const lnurlData = await lnurlResponse.json();

  let invoice: string;

  if (lnurlData.allowsNostr && lnurlData.nostrPubkey) {
    // Create zap request (NIP-57)
    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
      throw new Error("Must be logged in to send zaps");
    }

    // NIP-57 zap request - only include required/valid tags
    // Note: gameId is a UUID, not a valid Nostr event ID, so we omit the "e" tag
    const zapRequest = createEvent(9734, moveDescription, [
      [
        "relays",
        "wss://relay.damus.io",
        "wss://relay.primal.net",
        "wss://nos.lol",
        "wss://relay.snort.social",
      ],
      ["amount", (amountSats * 1000).toString()],
      ["p", recipientPubkey],
    ]);

    const ndk = getNDK();
    zapRequest.ndk = ndk;
    await zapRequest.sign();

    // Get invoice with zap request
    const callbackUrl = new URL(lnurlData.callback);
    callbackUrl.searchParams.set("amount", (amountSats * 1000).toString());
    callbackUrl.searchParams.set(
      "nostr",
      JSON.stringify(zapRequest.rawEvent()),
    );

    const invoiceResponse = await fetchWithTimeout(callbackUrl);
    const invoiceData = await invoiceResponse.json();

    if (!invoiceData.pr) {
      throw new Error("Failed to get invoice from LNURL");
    }

    invoice = invoiceData.pr;
  } else {
    // Regular payment without zap
    const callbackUrl = new URL(lnurlData.callback);
    callbackUrl.searchParams.set("amount", (amountSats * 1000).toString());
    callbackUrl.searchParams.set("comment", moveDescription);

    const invoiceResponse = await fetchWithTimeout(callbackUrl);
    const invoiceData = await invoiceResponse.json();

    if (!invoiceData.pr) {
      throw new Error("Failed to get invoice");
    }

    invoice = invoiceData.pr;
  }

  // Pay the invoice
  const result = await sendPayment(invoice, {
    amount: amountSats,
    description: moveDescription,
  });

  if (!result.success) {
    throw new Error(result.error || "Payment failed");
  }

  return result.preimage || "";
}

/**
 * Parse a NIP-57 zap request from a payment description.
 * The description field on Lightning payments may contain the JSON-encoded
 * kind 9734 zap request event that was attached via LNURL.
 */
function parseZapFromDescription(
  description: string | undefined,
  isIncoming: boolean,
): { pubkey: string; comment?: string } | null {
  if (!description) return null;

  try {
    const parsed = JSON.parse(description);
    // Must be a kind 9734 zap request event
    if (parsed.kind !== 9734 || !parsed.pubkey) return null;

    // For incoming zaps: the sender is the event pubkey
    // For outgoing zaps: the recipient is in the "p" tag
    if (isIncoming) {
      return {
        pubkey: parsed.pubkey,
        comment: parsed.content || undefined,
      };
    } else {
      const pTag = parsed.tags?.find((t: string[]) => t[0] === "p");
      if (pTag?.[1]) {
        return {
          pubkey: pTag[1],
          comment: parsed.content || undefined,
        };
      }
    }
  } catch {
    // Not JSON or not a zap request — that's fine
  }

  return null;
}

/**
 * Get transaction history from the active wallet
 */
export async function getTransactionHistory(
  options: {
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ transactions: Transaction[]; hasMore: boolean }> {
  const wallet = getActiveWallet();

  if (!wallet) {
    return { transactions: [], hasMore: false };
  }

  const limit = options.limit || 30;
  const offset = options.offset || 0;

  try {
    const connected = await ensureWalletConnected(wallet);
    if (!connected) {
      return { transactions: [], hasMore: false };
    }

    switch (wallet.kind) {
      case WalletKind.SPARK: {
        const payments = await listSparkPayments({ limit, offset });
        const transactions: Transaction[] = payments.map((p) => {
          const tx: Transaction = {
            id: p.id,
            type: p.type,
            amountSats: p.amountSats,
            feesSats: p.feesSats,
            description: p.description,
            timestamp: p.settledAt || p.createdAt,
            status: p.status,
          };

          // Try to extract zap info from the description
          const zapInfo = parseZapFromDescription(
            p.description,
            p.type === "incoming",
          );
          if (zapInfo) {
            tx.zapPubkey = zapInfo.pubkey;
            tx.zapComment = zapInfo.comment;
          }

          return tx;
        });
        // Spark doesn't have a hasMore flag, estimate based on result count
        return { transactions, hasMore: payments.length === limit };
      }

      default:
        return { transactions: [], hasMore: false };
    }
  } catch (e) {
    console.error("[WalletManager] Failed to get transaction history:", e);
    return { transactions: [], hasMore: false };
  }
}

/**
 * Check if any wallet is ready to use
 */
export function isWalletReady(): boolean {
  const wallet = getActiveWallet();
  if (!wallet) {
    return isBitcoinConnectEnabled();
  }

  switch (wallet.kind) {
    case WalletKind.SPARK:
      return isSparkInitialized();
    default:
      return false;
  }
}

/**
 * Get Lightning address for receiving (if available)
 */
export function getLightningAddress(): string | null {
  const wallet = getActiveWallet();
  if (!wallet) return null;

  switch (wallet.kind) {
    case WalletKind.SPARK:
      return getSparkLightningAddress();
    default:
      return null;
  }
}

/**
 * Initialize wallet manager on app startup
 */
export async function initializeWalletManager(): Promise<void> {
  if (isInitialized) return;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    ensureSparkStateBridge();
    // Initialize BitcoinConnect if enabled
    if (isBitcoinConnectEnabled()) {
      await initBitcoinConnect();
    }

    const state = getWalletStoreState();
    const active = state.activeWallet;

    if (active) {
      try {
        switch (active.kind) {
          case WalletKind.SPARK:
            const currentUser = getCurrentUser();
            if (
              BREEZ_API_KEY &&
              currentUser?.pubkey &&
              hasSparkMnemonic(currentUser.pubkey)
            ) {
              await connectSparkWallet(currentUser.pubkey, BREEZ_API_KEY);
              syncSparkStateToStore();
            }
            break;
        }
        await refreshBalance();
      } catch (e) {
        console.warn("[WalletManager] Failed to restore wallet:", e);
      }
    }

    isInitialized = true;
  })();

  try {
    await initializationPromise;
  } finally {
    initializationPromise = null;
  }
}

/**
 * Get a BOLT11 invoice from a Lightning address
 * Used when paying via Bitcoin Connect which only accepts invoices
 */
async function getInvoiceFromLightningAddress(
  address: string,
  amountSats: number,
  comment?: string,
): Promise<string> {
  const [username, domain] = address.trim().toLowerCase().split("@");
  const lnurlpUrl = `https://${domain}/.well-known/lnurlp/${username}`;

  const response = await fetch(lnurlpUrl);
  if (!response.ok) {
    throw new Error(`Failed to resolve Lightning address: ${response.status}`);
  }

  const data = await response.json();
  if (data.status === "ERROR") {
    throw new Error(data.reason || "Lightning address resolution failed");
  }

  const amountMsats = amountSats * 1000;
  const minSendable = data.minSendable || 1000;
  const maxSendable = data.maxSendable || 100000000000;

  if (amountMsats < minSendable) {
    throw new Error(
      `Amount too small. Minimum: ${Math.ceil(minSendable / 1000)} sats`,
    );
  }
  if (amountMsats > maxSendable) {
    throw new Error(
      `Amount too large. Maximum: ${Math.floor(maxSendable / 1000)} sats`,
    );
  }

  // Build callback URL
  let callbackUrl = `${data.callback}${data.callback.includes("?") ? "&" : "?"}amount=${amountMsats}`;

  // Add comment if allowed
  if (comment && data.commentAllowed) {
    const trimmedComment =
      comment.length > data.commentAllowed
        ? comment.substring(0, data.commentAllowed)
        : comment;
    callbackUrl += `&comment=${encodeURIComponent(trimmedComment)}`;
  }

  const invoiceResponse = await fetch(callbackUrl);
  if (!invoiceResponse.ok) {
    throw new Error(`Failed to fetch invoice: ${invoiceResponse.status}`);
  }

  const invoiceData = await invoiceResponse.json();
  if (invoiceData.status === "ERROR") {
    throw new Error(
      invoiceData.reason || "Failed to get invoice from Lightning address",
    );
  }
  if (!invoiceData.pr) {
    throw new Error("No invoice returned from Lightning address");
  }

  return invoiceData.pr;
}

/**
 * Decode bech32 LNURL to URL
 */
function decodeLnurl(lnurl: string): string {
  const ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

  const lnurlLower = lnurl.toLowerCase();
  if (!lnurlLower.startsWith("lnurl")) {
    throw new Error("Invalid LNURL");
  }

  const data = lnurlLower.slice(lnurlLower.indexOf("1") + 1);
  const bytes: number[] = [];

  for (const char of data) {
    const value = ALPHABET.indexOf(char);
    if (value === -1) break;
    bytes.push(value);
  }

  let bits = 0;
  let value = 0;
  const result: number[] = [];

  for (const b of bytes) {
    value = (value << 5) | b;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      result.push((value >> bits) & 0xff);
    }
  }

  return new TextDecoder().decode(new Uint8Array(result));
}

// Re-export useful functions
export { hasSparkMnemonic } from "./spark";

export default {
  connectWallet,
  disconnectWallet,
  refreshBalance,
  sendPayment,
  createInvoice,
  zapUser,
  isWalletReady,
  getLightningAddress,
  initializeWalletManager,
  getWalletStoreState,
  subscribeToWalletStore,
};
