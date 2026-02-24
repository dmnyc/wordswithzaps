/**
 * Spark Wallet Module
 *
 * Self-custodial Lightning wallet integration using Breez SDK Spark.
 * Adapted from zapcooking's implementation for React.
 */

import {
  saveMnemonic,
  loadMnemonic,
  hasMnemonic,
  deleteMnemonic,
} from "./storage";
import type { SparkPayment } from "../../types/wallet";

// --- State ---
let _sdkInstance: any = null;
let _wasmInitialized = false;
let _currentPubkey: string | null = null;
let _eventListenerId: string | null = null;

// Observable state (simple callbacks for React integration)
type StateListener = () => void;
const stateListeners: Set<StateListener> = new Set();

let _walletBalance: number | null = null;
let _walletInitialized = false;
let _sparkLoading = false;
let _lightningAddress: string | null = null;
let _recentPayments: SparkPayment[] = [];

function notifyListeners() {
  stateListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore */
    }
  });
}

// --- Public State Accessors ---
export function getSparkState() {
  return {
    balance: _walletBalance,
    initialized: _walletInitialized,
    loading: _sparkLoading,
    lightningAddress: _lightningAddress,
    recentPayments: _recentPayments,
  };
}

export function subscribeToSparkState(listener: StateListener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

// --- Event Callback System ---
type SparkEventCallback = (event: any) => void;
const _eventCallbacks: SparkEventCallback[] = [];

export function onSparkEvent(callback: SparkEventCallback): () => void {
  _eventCallbacks.push(callback);
  return () => {
    const index = _eventCallbacks.indexOf(callback);
    if (index > -1) {
      _eventCallbacks.splice(index, 1);
    }
  };
}

/**
 * Dynamically import bip39 with Buffer polyfill
 */
async function getBip39(): Promise<{
  generateMnemonic: (strength?: number) => string;
}> {
  if (typeof globalThis !== "undefined" && !(globalThis as any).Buffer) {
    const { Buffer } = await import("buffer");
    (globalThis as any).Buffer = Buffer;
  }
  const bip39 = await import("bip39");
  return bip39;
}

/**
 * Validate mnemonic format
 */
function validateMnemonic(mnemonic: string): boolean {
  const words = mnemonic.trim().split(/\s+/);
  const validWordCounts = [12, 15, 18, 21, 24];

  if (!validWordCounts.includes(words.length)) {
    console.warn("[Spark] Invalid mnemonic word count:", words.length);
    return false;
  }

  for (const word of words) {
    if (!/^[a-z]+$/.test(word)) {
      console.warn("[Spark] Invalid mnemonic word:", word);
      return false;
    }
  }

  return true;
}

/**
 * Initialize the WASM module
 */
async function initWasm(): Promise<void> {
  if (_wasmInitialized) return;

  try {
    const { default: init } = await import("@breeztech/breez-sdk-spark/web");
    await init();
    _wasmInitialized = true;
    console.log("[Spark] WASM module initialized");
  } catch (error) {
    console.error("[Spark] Failed to initialize WASM:", error);
    throw error;
  }
}

/**
 * Helper to add timeout to promises
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`${operation} timed out after ${timeoutMs / 1000}s`),
          ),
        timeoutMs,
      ),
    ),
  ]);
}

/**
 * Set up SDK event listener - CRITICAL: must be called immediately after connect
 */
async function setupEventListener(): Promise<void> {
  if (!_sdkInstance) return;

  const listener = {
    onEvent: (event: any) => {
      if (event.type === "paymentSucceeded" && event.payment) {
        // Add to recent payments for immediate UI update
        const payment = mapPayment(event.payment);
        _recentPayments = [payment, ..._recentPayments].slice(0, 20);
        refreshBalanceInternal();
        notifyListeners();
      }

      if (event.type === "synced") {
        refreshBalanceInternal();
      }

      // Notify external callbacks
      _eventCallbacks.forEach((callback) => {
        try {
          callback(event);
        } catch {
          /* ignore */
        }
      });
    },
  };

  _eventListenerId = await _sdkInstance.addEventListener(listener);
}

/**
 * Internal balance refresh - NEVER use ensureSynced: true (causes 30+ second hangs)
 */
async function refreshBalanceInternal(): Promise<void> {
  if (!_sdkInstance) return;
  try {
    const info = await _sdkInstance.getInfo({ ensureSynced: false });
    const balanceValue =
      info.balanceSats ??
      info.balanceSat ??
      info.balance_sats ??
      info.balance ??
      0;
    const nextBalance = Number(balanceValue);
    if (!Number.isFinite(nextBalance)) return;
    // Show whatever the SDK reports — even 0 before sync.
    // A momentary 0 is better than an eternal loading spinner.
    _walletBalance = nextBalance;
    notifyListeners();
  } catch (error) {
    console.error("[Spark] Failed to refresh balance:", error);
  }
}

/**
 * Map SDK payment to our SparkPayment type
 */
function mapPayment(p: any): SparkPayment {
  // SDK uses paymentType with values like "received", "receive", "send", "sent"
  const paymentType = p.paymentType || p.payment_type || p.type || "";
  const isIncoming =
    paymentType === "received" ||
    paymentType === "RECEIVED" ||
    paymentType === "receive" ||
    paymentType === "incoming";

  // Handle amount - SDK may return msat or sat
  const amountMsat = p.amountMsat || p.amount_msat || p.amountMSat || 0;
  const amountSats =
    p.amountSat ||
    p.amount_sat ||
    p.amountSats ||
    p.amount ||
    Math.floor(Number(amountMsat) / 1000);

  // Handle fees
  const feesMsat = p.feesMsat || p.fees_msat || p.feesMSat || 0;
  const feesSats =
    p.feesSat ||
    p.fees_sat ||
    p.feesSats ||
    (feesMsat ? Math.floor(Number(feesMsat) / 1000) : undefined);

  // Handle timestamp - SDK may return in ms or s
  let timestamp = p.createdAt || p.created_at || p.timestamp || Date.now();
  if (timestamp > 4102444800) timestamp = Math.floor(timestamp / 1000); // Convert ms to s if needed

  return {
    id: p.id || p.paymentHash || p.payment_hash || String(Date.now()),
    type: isIncoming ? "incoming" : "outgoing",
    amountSats: Number(amountSats),
    feesSats: feesSats !== undefined ? Number(feesSats) : undefined,
    description: p.description || p.details?.description || p.bolt11Description,
    preimage: p.preimage || p.details?.preimage,
    paymentHash: p.paymentHash || p.payment_hash || p.details?.paymentHash,
    createdAt: timestamp,
    settledAt: p.settledAt || p.settled_at,
    status:
      p.status === "succeeded" ||
      p.status === "complete" ||
      p.status === "completed"
        ? "succeeded"
        : p.status === "failed"
          ? "failed"
          : "pending",
  };
}

/**
 * Extract lightning address string from SDK response
 */
function extractLightningAddressString(addr: unknown): string | null {
  if (!addr) return null;
  if (typeof addr === "string") return addr;

  if (typeof addr === "object" && addr !== null) {
    const obj = addr as Record<string, unknown>;
    const possibleKeys = [
      "lightningAddress",
      "lightning_address",
      "address",
      "lnAddress",
    ];

    for (const key of possibleKeys) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }

    // Look for any string that looks like a lightning address
    for (const value of Object.values(obj)) {
      if (typeof value === "string" && value.includes("@")) {
        return value;
      }
    }
  }

  return null;
}

/**
 * Fetch lightning address from SDK
 */
async function fetchLightningAddress(): Promise<void> {
  if (!_sdkInstance) return;

  try {
    const addr = await _sdkInstance.getLightningAddress();
    const address = extractLightningAddressString(addr);
    if (address) {
      _lightningAddress = address;
      notifyListeners();
      console.log("[Spark] Lightning address:", address);
    }
  } catch (error) {
    console.debug("[Spark] No lightning address available:", error);
  }
}

/**
 * Initialize the Breez SDK and connect the wallet
 * @param pubkey User's Nostr public key
 * @param mnemonic BIP39 mnemonic
 * @param apiKey Breez API key
 */
export async function initializeSdk(
  pubkey: string,
  mnemonic: string,
  apiKey: string,
): Promise<boolean> {
  // Already initialized for this pubkey
  if (_currentPubkey === pubkey && _sdkInstance) {
    console.log("[Spark] SDK already initialized for this pubkey");
    return true;
  }

  try {
    _sparkLoading = true;
    notifyListeners();

    // Disconnect any existing connection
    await disconnectWallet();

    // Initialize WASM
    await initWasm();

    // Import SDK functions
    const { defaultConfig, SdkBuilder } =
      await import("@breeztech/breez-sdk-spark/web");

    const config = defaultConfig("mainnet");
    config.apiKey = apiKey;
    config.privateEnabledDefault = true;

    const cleanMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, " ");

    // Custom LNURL REST client that short-circuits the /recover endpoint.
    // The SDK hits POST breez.tips/lnurlpay/.../recover on every connect/sync,
    // and if the wallet has no registered lightning address it returns 404.
    // The SDK retries this with backoff for ~48 seconds. By intercepting it
    // and returning an immediate 200, we skip the retry loop entirely.
    const lnurlClient = {
      async getRequest(url: string, headers?: Record<string, string>) {
        const resp = await fetch(url, { headers });
        return { status: resp.status, body: await resp.text() };
      },
      async postRequest(
        url: string,
        headers?: Record<string, string>,
        body?: string,
      ) {
        if (url.includes("/recover")) {
          return { status: 200, body: "{}" };
        }
        const resp = await fetch(url, { method: "POST", headers, body });
        return { status: resp.status, body: await resp.text() };
      },
      async deleteRequest(
        url: string,
        headers?: Record<string, string>,
        body?: string,
      ) {
        const resp = await fetch(url, { method: "DELETE", headers, body });
        return { status: resp.status, body: await resp.text() };
      },
    };

    // Clear stale IndexedDB from old SDK versions (0.1.x → 0.9.1)
    // The storage format changed; mnemonic is stored separately so no data is lost.
    try {
      const dbs = await indexedDB.databases();
      const staleDb = dbs.find(
        (db) => db.name && db.name.includes("wordswithzaps-spark"),
      );
      if (staleDb?.name && staleDb.version && staleDb.version < 3) {
        console.log(
          `[Spark] Clearing stale IndexedDB: ${staleDb.name} (v${staleDb.version})`,
        );
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase(staleDb.name!);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
    } catch {
      // indexedDB.databases() not supported in all browsers — safe to skip
    }

    // Use SdkBuilder to inject custom LNURL client
    let builder = SdkBuilder.new(config, {
      type: "mnemonic",
      mnemonic: cleanMnemonic,
    });
    builder = builder.withLnurlClient(lnurlClient);

    builder = await builder.withDefaultStorage("wordswithzaps-spark");
    _sdkInstance = await withTimeout(builder.build(), 20000, "SDK connect");

    _currentPubkey = pubkey;

    // CRITICAL: Set up event listener immediately after connect
    await setupEventListener();

    // Get cached balance immediately (without waiting for sync)
    await refreshBalanceInternal();

    // Mark as initialized
    _walletInitialized = true;
    console.log("[Spark] SDK initialized");
    notifyListeners();

    // Fire-and-forget sync — uses our custom LNURL client which intercepts
    // the /recover 404. The SDK's built-in auto-sync bypasses our client
    // and hits the real fetch, so we trigger our own sync here.
    _sdkInstance
      .syncWallet({})
      .then(() => {
        refreshBalanceInternal();
      })
      .catch(() => {});

    // Fetch lightning address in background
    fetchLightningAddress().catch(() => {});

    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Spark] Failed to initialize SDK:", errorMessage, error);
    _walletInitialized = false;
    _sdkInstance = null;
    _currentPubkey = null;
    notifyListeners();
    // Re-throw with more context for the UI
    throw new Error(`Spark SDK initialization failed: ${errorMessage}`);
  } finally {
    _sparkLoading = false;
    notifyListeners();
  }
}

/**
 * Create a new wallet with generated mnemonic
 */
export async function createAndConnectWallet(
  pubkey: string,
  apiKey: string,
): Promise<string> {
  const { generateMnemonic } = await getBip39();
  const newMnemonic = generateMnemonic(128); // 12 words

  await saveMnemonic(pubkey, newMnemonic);

  try {
    await initializeSdk(pubkey, newMnemonic, apiKey);
  } catch (error) {
    deleteMnemonic(pubkey);
    throw error;
  }

  return newMnemonic;
}

/**
 * Connect wallet using stored mnemonic
 */
export async function connectWallet(
  pubkey: string,
  apiKey: string,
): Promise<boolean> {
  const mnemonic = await loadMnemonic(pubkey);
  if (!mnemonic) {
    console.warn("[Spark] No mnemonic found in local storage for this pubkey");
    return false;
  }

  if (!validateMnemonic(mnemonic)) {
    console.error("[Spark] Loaded mnemonic is invalid");
    deleteMnemonic(pubkey);
    return false;
  }

  await initializeSdk(pubkey, mnemonic, apiKey);
  return true;
}

/**
 * Import existing mnemonic and connect
 */
export async function importAndConnectWallet(
  pubkey: string,
  mnemonic: string,
  apiKey: string,
): Promise<boolean> {
  if (!validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }

  await saveMnemonic(pubkey, mnemonic);

  try {
    await initializeSdk(pubkey, mnemonic, apiKey);
  } catch (error) {
    deleteMnemonic(pubkey);
    throw error;
  }

  return true;
}

/**
 * Disconnect wallet
 */
export async function disconnectWallet(): Promise<void> {
  try {
    if (_sdkInstance) {
      if (_eventListenerId) {
        try {
          await _sdkInstance.removeEventListener(_eventListenerId);
        } catch {
          /* ignore */
        }
        _eventListenerId = null;
      }
      try {
        await _sdkInstance.disconnect();
      } catch {
        /* ignore */
      }
    }
  } finally {
    _sdkInstance = null;
    _currentPubkey = null;
    _walletBalance = null;
    _walletInitialized = false;
    _lightningAddress = null;
    _recentPayments = [];
    notifyListeners();
  }
}

/**
 * Check if wallet is initialized
 */
export function isSparkInitialized(): boolean {
  return _walletInitialized && _sdkInstance !== null;
}

/**
 * Get current balance
 * @param forceSync If true, waits for wallet sync before returning balance
 */
export async function getSparkBalance(
  forceSync = false,
): Promise<number | null> {
  if (!_sdkInstance) throw new Error("Spark SDK not initialized");

  if (forceSync) {
    try {
      console.log("[Spark] Force syncing wallet...");
      await withTimeout(_sdkInstance.syncWallet({}), 10000, "Force sync");
      console.log("[Spark] Sync complete");
    } catch (e) {
      console.warn("[Spark] Force sync failed/timed out:", e);
    }
  }

  await refreshBalanceInternal();
  return _walletBalance ?? null;
}

/**
 * Send payment to invoice, LNURL, or Lightning address
 */
export async function sendSparkPayment(
  destination: string,
  amountSats?: number,
  comment?: string,
): Promise<{ preimage: string }> {
  if (!_sdkInstance) throw new Error("Spark SDK not initialized");

  try {
    _sparkLoading = true;
    notifyListeners();

    const parsedInput = await _sdkInstance.parse(destination);

    // Handle Lightning address / LNURL
    if (
      parsedInput.type === "lightningAddress" ||
      parsedInput.type === "lnurlPay"
    ) {
      if (!amountSats)
        throw new Error("Amount is required for Lightning address payments");

      const payRequest = (parsedInput as any).payRequest;
      const prepareResponse = await _sdkInstance.prepareLnurlPay({
        payRequest,
        amountSats,
      });
      const lnurlPayRequest: any = { prepareResponse };
      if (comment) lnurlPayRequest.comment = comment;

      const payment = await withTimeout(
        _sdkInstance.lnurlPay(lnurlPayRequest),
        20000,
        "LNURL payment",
      );

      await refreshBalanceInternal();
      return { preimage: (payment as any)?.preimage || "" };
    }

    // Handle BOLT11 invoice
    const prepareRequest: any = { paymentRequest: destination };
    if (amountSats) prepareRequest.amountSat = amountSats;

    const prepareResponse =
      await _sdkInstance.prepareSendPayment(prepareRequest);
    const payment = await withTimeout(
      _sdkInstance.sendPayment({ prepareResponse }),
      20000,
      "Invoice payment",
    );

    await refreshBalanceInternal();
    return { preimage: (payment as any)?.preimage || "" };
  } catch (error) {
    console.error("[Spark] Payment failed:", error);
    throw error;
  } finally {
    _sparkLoading = false;
    notifyListeners();
  }
}

/**
 * Create invoice to receive payment
 */
export async function createSparkInvoice(
  amountSats: number,
  description?: string,
): Promise<{ invoice: string; paymentHash?: string }> {
  if (!_sdkInstance) throw new Error("Spark SDK not initialized");

  try {
    _sparkLoading = true;
    notifyListeners();

    const request = {
      paymentMethod: {
        type: "bolt11Invoice",
        amountSats,
        description: description || "Words With Zaps payment",
      },
    };

    const response = await withTimeout(
      _sdkInstance.receivePayment(request),
      20000,
      "Create invoice",
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = response as any;
    const invoice = resp?.paymentRequest || resp?.invoice || resp?.bolt11;
    if (!invoice) {
      throw new Error("SDK did not return an invoice");
    }

    return {
      invoice,
      paymentHash: resp?.paymentHash,
    };
  } catch (error) {
    console.error("[Spark] Failed to create invoice:", error);
    throw error;
  } finally {
    _sparkLoading = false;
    notifyListeners();
  }
}

/**
 * Get Lightning address for this wallet
 */
export function getSparkLightningAddress(): string | null {
  return _lightningAddress;
}

/**
 * Fetch lightning address from SDK (force refresh)
 * Returns the address or null if not registered
 */
export async function refreshSparkLightningAddress(): Promise<string | null> {
  if (!_sdkInstance) return null;

  try {
    const addr = await _sdkInstance.getLightningAddress();
    const address = extractLightningAddressString(addr);
    _lightningAddress = address;
    notifyListeners();
    return address;
  } catch (error) {
    console.debug("[Spark] No lightning address available:", error);
    _lightningAddress = null;
    notifyListeners();
    return null;
  }
}

/**
 * Check if a @breez.tips username is available
 */
export async function checkLightningAddressAvailable(
  username: string,
): Promise<boolean> {
  if (!_sdkInstance) throw new Error("Spark SDK not initialized");

  try {
    return await _sdkInstance.checkLightningAddressAvailable({ username });
  } catch (error) {
    console.error(
      "[Spark] Failed to check lightning address availability:",
      error,
    );
    throw error;
  }
}

/**
 * Register a @breez.tips lightning address
 */
export async function registerLightningAddress(
  username: string,
  description?: string,
): Promise<string> {
  if (!_sdkInstance) throw new Error("Spark SDK not initialized");

  try {
    _sparkLoading = true;
    notifyListeners();

    const result = await _sdkInstance.registerLightningAddress({
      username,
      description: description || "Words With Zaps wallet",
    });

    const address = extractLightningAddressString(result);
    if (address) {
      _lightningAddress = address;
      notifyListeners();
    }

    return address || `${username}@breez.tips`;
  } catch (error) {
    console.error("[Spark] Failed to register lightning address:", error);
    throw error;
  } finally {
    _sparkLoading = false;
    notifyListeners();
  }
}

/**
 * Delete the registered @breez.tips lightning address
 */
export async function deleteLightningAddress(): Promise<void> {
  if (!_sdkInstance) throw new Error("Spark SDK not initialized");

  try {
    _sparkLoading = true;
    notifyListeners();

    await _sdkInstance.deleteLightningAddress();
    _lightningAddress = null;
    notifyListeners();
    console.log("[Spark] Lightning address deleted");
  } catch (error) {
    console.error("[Spark] Failed to delete lightning address:", error);
    throw error;
  } finally {
    _sparkLoading = false;
    notifyListeners();
  }
}

/**
 * List recent payments
 */
export async function listSparkPayments(
  options: { limit?: number; offset?: number } = {},
): Promise<SparkPayment[]> {
  if (!_sdkInstance) throw new Error("Spark SDK not initialized");

  try {
    const response: any = await withTimeout(
      _sdkInstance.listPayments({
        limit: options.limit || 20,
        offset: options.offset || 0,
      }),
      10000,
      "listPayments",
    );

    const payments = (response?.payments || []).map(mapPayment);
    return payments;
  } catch (error) {
    console.error("[Spark] Failed to list payments:", error);
    return _recentPayments; // Fall back to cached recent payments
  }
}

/**
 * Check if mnemonic exists for pubkey
 */
export function hasSparkMnemonic(pubkey: string): boolean {
  return hasMnemonic(pubkey);
}

/**
 * Delete mnemonic for pubkey
 */
export function deleteSparkMnemonic(pubkey: string): void {
  deleteMnemonic(pubkey);
}

export default {
  initializeSdk,
  createAndConnectWallet,
  connectWallet,
  importAndConnectWallet,
  disconnectWallet,
  isSparkInitialized,
  getSparkBalance,
  sendSparkPayment,
  createSparkInvoice,
  getSparkLightningAddress,
  checkLightningAddressAvailable,
  registerLightningAddress,
  deleteLightningAddress,
  listSparkPayments,
  hasSparkMnemonic,
  deleteSparkMnemonic,
  getSparkState,
  subscribeToSparkState,
  onSparkEvent,
};
