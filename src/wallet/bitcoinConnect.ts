/**
 * Bitcoin Connect External Wallet Module
 *
 * Manages Bitcoin Connect wallet connections as an external fallback option.
 * When enabled and no embedded wallet is active, payments use Bitcoin Connect modal.
 *
 * For NWC-backed connectors (Primal, Alby Hub, generic NWC, Coinos, LNbits-NWC, ...)
 * the underlying instance is a `NostrWebLNProvider` from `@getalby/sdk`, which
 * exposes richer NIP-47 methods (`listTransactions`, `makeInvoice`). We feature-
 * detect at runtime and gracefully degrade for non-NWC connectors (LNC, raw
 * extension, etc.) which don't implement these.
 */

import type {
  BitcoinConnectInfo,
  Transaction as WwzTransaction,
} from "../types/wallet";

const STORAGE_KEY = "wordswithzaps_bitcoin_connect_enabled";

// Transaction shape returned by NostrWebLNProvider.listTransactions().
// Note: the @getalby/sdk WebLN wrapper internally converts NIP-47's msats
// to sats before returning (see mapNip47TransactionToTransaction in
// @getalby/sdk's webln.js). All other fields are passed through from
// the underlying Nip47Transaction.
interface WebLNTransactionLike {
  type: "incoming" | "outgoing";
  state?: "settled" | "pending" | "failed" | "accepted";
  invoice?: string;
  description?: string;
  description_hash?: string;
  preimage?: string;
  payment_hash?: string;
  amount: number; // sats (already converted by the WebLN wrapper)
  fees_paid?: number; // sats
  settled_at?: number;
  created_at: number;
  expires_at?: number;
}

// WebLN makeInvoice request: takes amount in SATS (the wrapper converts
// to msats internally before forwarding to NIP-47).
interface MakeInvoiceArgsLike {
  amount: number; // sats
  defaultMemo?: string;
}

// WebLN makeInvoice response: just the BOLT11 invoice. No amount/hash
// fields (those live on the NIP-47 native response, which the wrapper
// hides).
interface MakeInvoiceResponseLike {
  paymentRequest: string;
}

interface ListTransactionsArgsLike {
  from?: number;
  until?: number;
  limit?: number;
  offset?: number;
  unpaid?: boolean;
  type?: "incoming" | "outgoing";
}

interface ListTransactionsResponseLike {
  transactions: WebLNTransactionLike[];
  total_count?: number;
}

// Subset of NIP-47 GetInfoResponse we care about (the WebLN wrapper drops
// `lud16` and `metadata`, so we read it from the underlying NWCClient).
interface Nip47GetInfoLike {
  alias?: string;
  pubkey?: string;
  methods?: string[];
  lud16?: string;
}

// Subset of @getalby/sdk's NWCClient surface we touch.
interface NWCClientLike {
  lud16?: string;
  getInfo?: () => Promise<Nip47GetInfoLike>;
}

// Extended WebLN provider type. The base methods are required; the rich
// NIP-47 methods are optional (only present on NWC-backed providers).
interface WebLNProvider {
  enable(): Promise<void>;
  getInfo?(): Promise<{
    node?: { alias?: string; pubkey?: string };
    methods?: string[];
  }>;
  getBalance?(): Promise<{ balance: number; currency?: string }>;
  sendPayment(paymentRequest: string): Promise<{ preimage: string }>;
  // NIP-47 rich methods — present on NostrWebLNProvider (NWC connectors)
  makeInvoice?(
    args: MakeInvoiceArgsLike | number | string,
  ): Promise<MakeInvoiceResponseLike>;
  listTransactions?(
    args: ListTransactionsArgsLike,
  ): Promise<ListTransactionsResponseLike>;
  // Underlying NWCClient — only present on NostrWebLNProvider.
  client?: NWCClientLike;
}

export interface BitcoinConnectCapabilities {
  /** True if the connected wallet supports NIP-47 list_transactions */
  history: boolean;
  /** True if the connected wallet supports NIP-47 make_invoice (top up) */
  receive: boolean;
}

// State
let _enabled = false;
let _provider: WebLNProvider | null = null;
let _walletInfo: BitcoinConnectInfo = { connected: false };
let _balance: number | null = null;
let _balanceLoading = false;
let _capabilities: BitcoinConnectCapabilities = {
  history: false,
  receive: false,
};
// Lightning address (lud16) reported by the NWC wallet's get_info response,
// when the wallet provides one. Used to surface a Lightning Address QR in
// the Top Up UI for parity with Spark.
let _lightningAddress: string | null = null;

// State listeners
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

/**
 * Load enabled state from localStorage
 */
function loadEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "true";
  } catch {
    return false;
  }
}

/**
 * Save enabled state to localStorage
 */
function saveEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage errors
  }
}

// Initialize from localStorage
if (typeof window !== "undefined") {
  _enabled = loadEnabled();
}

// --- Public State Accessors ---

export function getBitcoinConnectState() {
  return {
    enabled: _enabled,
    connected: _walletInfo.connected,
    walletInfo: _walletInfo,
    balance: _balance,
    balanceLoading: _balanceLoading,
    capabilities: _capabilities,
    lightningAddress: _lightningAddress,
  };
}

export function getBitcoinConnectCapabilities(): BitcoinConnectCapabilities {
  return _capabilities;
}

export function getBitcoinConnectLightningAddress(): string | null {
  return _lightningAddress;
}

export function subscribeToBitcoinConnectState(
  listener: StateListener,
): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

// --- Provider Management ---

/**
 * Read the wallet's Lightning Address (lud16) from the underlying NWCClient
 * if available. The WebLN wrapper's getInfo() drops this field, so we go
 * straight to the NIP-47 native client when present. Returns null for
 * non-NWC connectors or wallets that don't advertise a Lightning Address.
 */
async function fetchLightningAddress(
  provider: WebLNProvider,
): Promise<string | null> {
  const client = provider.client;
  if (!client) return null;

  // Many NWCClient instances populate lud16 from the connection URL.
  if (typeof client.lud16 === "string" && client.lud16.length > 0) {
    return client.lud16;
  }

  // Fallback: pull it from the NIP-47 get_info response.
  if (typeof client.getInfo === "function") {
    try {
      const info = await client.getInfo();
      if (typeof info?.lud16 === "string" && info.lud16.length > 0) {
        return info.lud16;
      }
    } catch {
      // some wallets fail get_info — silently degrade
    }
  }

  return null;
}

/**
 * Detect rich NWC capabilities by combining duck-typing (presence of methods
 * on the provider object) with the NIP-47 method list returned by getInfo().
 * Some non-NWC providers (e.g. LNC) declare these methods but throw when called,
 * so we trust getInfo().methods over presence-only when available.
 */
async function detectCapabilities(
  provider: WebLNProvider,
): Promise<BitcoinConnectCapabilities> {
  const hasListMethod = typeof provider.listTransactions === "function";
  const hasMakeMethod = typeof provider.makeInvoice === "function";

  // Try getInfo() to get the authoritative method list. Capability names per
  // NIP-47 spec: "list_transactions", "make_invoice".
  let methods: string[] = [];
  try {
    if (typeof provider.getInfo === "function") {
      const info = await provider.getInfo();
      if (Array.isArray(info?.methods)) {
        methods = info.methods;
      }
    }
  } catch {
    // getInfo can throw on some providers — fall back to presence check
  }

  // If getInfo gave us a methods array, use it as the authority. Otherwise
  // fall back to presence detection.
  const trustMethodList = methods.length > 0;
  return {
    history: trustMethodList
      ? methods.includes("list_transactions") ||
        methods.includes("listTransactions")
      : hasListMethod,
    receive: trustMethodList
      ? methods.includes("make_invoice") ||
        methods.includes("makeInvoice")
      : hasMakeMethod,
  };
}

/**
 * Set the WebLN provider reference (called when connected via Bitcoin Connect modal)
 */
export function setBitcoinConnectProvider(
  provider: WebLNProvider | null,
): void {
  _provider = provider;

  if (provider) {
    _walletInfo = { ..._walletInfo, connected: true };
    notifyListeners();

    // Fetch info, balance, capabilities, and lightning address in parallel
    fetchBitcoinConnectInfo();
    fetchBitcoinConnectBalance();
    detectCapabilities(provider)
      .then((caps) => {
        _capabilities = caps;
        notifyListeners();
      })
      .catch(() => {
        _capabilities = { history: false, receive: false };
        notifyListeners();
      });
    fetchLightningAddress(provider)
      .then((lud16) => {
        _lightningAddress = lud16;
        notifyListeners();
      })
      .catch(() => {
        _lightningAddress = null;
        notifyListeners();
      });
  } else {
    _walletInfo = { connected: false };
    _balance = null;
    _capabilities = { history: false, receive: false };
    _lightningAddress = null;
    notifyListeners();
  }
}

/**
 * Get the current WebLN provider
 */
export function getBitcoinConnectProvider(): WebLNProvider | null {
  return _provider;
}

/**
 * Fetch wallet info from the connected Bitcoin Connect wallet
 */
export async function fetchBitcoinConnectInfo(): Promise<void> {
  if (!_provider) return;

  try {
    if (typeof _provider.getInfo === "function") {
      const info = await _provider.getInfo();
      _walletInfo = {
        alias: info.node?.alias,
        pubkey: info.node?.pubkey,
        connected: true,
      };
      notifyListeners();
    }
  } catch (e) {
    console.warn("[BitcoinConnect] Failed to fetch wallet info:", e);
  }
}

/**
 * Fetch balance from the connected Bitcoin Connect wallet
 */
export async function fetchBitcoinConnectBalance(): Promise<number | null> {
  if (!_provider) {
    _balance = null;
    notifyListeners();
    return null;
  }

  _balanceLoading = true;
  notifyListeners();

  try {
    if (typeof _provider.getBalance === "function") {
      const response = await _provider.getBalance();
      _balance = response.balance;
      notifyListeners();
      return _balance;
    }
    _balance = null;
    notifyListeners();
    return null;
  } catch (e) {
    console.warn("[BitcoinConnect] Failed to fetch balance:", e);
    _balance = null;
    notifyListeners();
    return null;
  } finally {
    _balanceLoading = false;
    notifyListeners();
  }
}

// --- Enable/Disable ---

/**
 * Enable Bitcoin Connect as external wallet option
 */
export function enableBitcoinConnect(): void {
  _enabled = true;
  saveEnabled(true);
  notifyListeners();
}

/**
 * Connect to Bitcoin Connect wallet (opens modal)
 */
export async function connectBitcoinConnect(): Promise<void> {
  try {
    const { init, requestProvider } = await import("@getalby/bitcoin-connect");

    // Initialize (safe to call multiple times)
    init({
      appName: "Words With Zaps",
    });

    // Enable if not already
    if (!_enabled) {
      _enabled = true;
      saveEnabled(true);
    }

    // Request provider - this opens the Bitcoin Connect modal
    const provider = await requestProvider();
    setBitcoinConnectProvider(provider);
  } catch (error) {
    console.error("[BitcoinConnect] Connection failed:", error);
    throw error;
  }
}

/**
 * Disable Bitcoin Connect and clear all state
 */
export async function disableBitcoinConnect(): Promise<void> {
  _enabled = false;
  saveEnabled(false);
  _provider = null;
  _walletInfo = { connected: false };
  _balance = null;
  _capabilities = { history: false, receive: false };
  _lightningAddress = null;
  notifyListeners();

  // Disconnect any active BC session
  try {
    const { disconnect } = await import("@getalby/bitcoin-connect");
    disconnect();
  } catch {
    // Ignore disconnect errors
  }
}

/**
 * Check if Bitcoin Connect is enabled
 */
export function isBitcoinConnectEnabled(): boolean {
  return _enabled;
}

/**
 * Check if Bitcoin Connect wallet is currently connected
 */
export function isBitcoinConnectConnected(): boolean {
  return _walletInfo.connected;
}

/**
 * Get current Bitcoin Connect balance
 */
export function getBitcoinConnectBalance(): number | null {
  return _balance;
}

/**
 * Create a BOLT11 invoice on the connected NWC wallet.
 * Used for "top up" / receive flow. Throws if the connected wallet doesn't
 * support `make_invoice` (e.g. LNC, raw extensions) — callers should
 * gate the UI on `getBitcoinConnectCapabilities().receive`.
 *
 * The WebLN wrapper takes the amount in SATS and handles msat conversion
 * internally; it returns only `{ paymentRequest }` (no payment hash).
 */
export async function makeBitcoinConnectInvoice(
  amountSats: number,
  description?: string,
): Promise<{ invoice: string; paymentHash?: string }> {
  if (!_provider) {
    throw new Error("Bitcoin Connect wallet is not connected");
  }
  if (typeof _provider.makeInvoice !== "function") {
    throw new Error("This wallet does not support receiving");
  }

  const result = await _provider.makeInvoice({
    amount: amountSats,
    defaultMemo: description,
  });

  if (!result?.paymentRequest) {
    throw new Error("Wallet returned no invoice");
  }

  return { invoice: result.paymentRequest };
}

/**
 * Fetch transaction history from the connected NWC wallet.
 * Throws if the connected wallet doesn't support `list_transactions`.
 * Maps the WebLN-wrapped NIP-47 transaction to WWZ's Transaction shape.
 *
 * Note: @getalby/sdk's NostrWebLNProvider.listTransactions() already
 * converts msats -> sats before returning, so we use `amount` and
 * `fees_paid` directly here without dividing.
 */
export async function listBitcoinConnectTransactions(options: {
  limit?: number;
  offset?: number;
} = {}): Promise<{ transactions: WwzTransaction[]; hasMore: boolean }> {
  if (!_provider) {
    throw new Error("Bitcoin Connect wallet is not connected");
  }
  if (typeof _provider.listTransactions !== "function") {
    throw new Error("This wallet does not support transaction history");
  }

  const limit = options.limit ?? 30;
  const offset = options.offset ?? 0;

  const response = await _provider.listTransactions({ limit, offset });
  const list = response.transactions || [];

  const transactions: WwzTransaction[] = list.map((t) => {
    const status: WwzTransaction["status"] =
      t.state === "settled"
        ? "succeeded"
        : t.state === "failed"
          ? "failed"
          : "pending";
    const timestamp = t.settled_at || t.created_at;
    const id = t.payment_hash || t.invoice || `${t.created_at}-${t.amount}`;

    return {
      id,
      type: t.type,
      amountSats: t.amount || 0,
      feesSats: typeof t.fees_paid === "number" ? t.fees_paid : undefined,
      description: t.description,
      timestamp,
      status,
    };
  });

  // total_count may not be present on all wallets; estimate hasMore from
  // page size when missing.
  const totalCount = response.total_count;
  const hasMore =
    typeof totalCount === "number"
      ? offset + list.length < totalCount
      : list.length === limit;

  return { transactions, hasMore };
}

/**
 * Pay an invoice using Bitcoin Connect
 * This triggers the Bitcoin Connect modal if not already connected
 */
export async function payWithBitcoinConnect(
  invoice: string,
): Promise<{ preimage: string }> {
  if (!_enabled) {
    throw new Error("Bitcoin Connect is not enabled");
  }

  try {
    // Dynamic import to avoid loading BC unless needed
    const { requestProvider } = await import("@getalby/bitcoin-connect");

    // Get or connect provider
    const provider = await requestProvider();
    setBitcoinConnectProvider(provider);

    // Pay the invoice
    const result = await provider.sendPayment(invoice);

    // Refresh balance after payment
    fetchBitcoinConnectBalance();

    return { preimage: result.preimage };
  } catch (error) {
    console.error("[BitcoinConnect] Payment failed:", error);
    throw error;
  }
}

/**
 * Initialize Bitcoin Connect with configuration
 * Call this early in app initialization
 */
export async function initBitcoinConnect(): Promise<void> {
  if (!_enabled) return;

  try {
    const { init, onConnected, onDisconnected } =
      await import("@getalby/bitcoin-connect");

    // Initialize with app name
    init({
      appName: "Words With Zaps",
    });

    // Set up connection listeners
    onConnected((provider) => {
      console.log("[BitcoinConnect] Wallet connected");
      setBitcoinConnectProvider(provider);
    });

    onDisconnected(() => {
      console.log("[BitcoinConnect] Wallet disconnected");
      setBitcoinConnectProvider(null);
    });
  } catch (error) {
    console.warn("[BitcoinConnect] Failed to initialize:", error);
  }
}

export default {
  getBitcoinConnectState,
  getBitcoinConnectCapabilities,
  subscribeToBitcoinConnectState,
  setBitcoinConnectProvider,
  getBitcoinConnectProvider,
  fetchBitcoinConnectInfo,
  fetchBitcoinConnectBalance,
  enableBitcoinConnect,
  disableBitcoinConnect,
  isBitcoinConnectEnabled,
  isBitcoinConnectConnected,
  getBitcoinConnectBalance,
  payWithBitcoinConnect,
  makeBitcoinConnectInvoice,
  listBitcoinConnectTransactions,
  initBitcoinConnect,
};
