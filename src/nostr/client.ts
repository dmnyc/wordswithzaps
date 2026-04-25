import NDK, {
  NDKEvent,
  NDKFilter,
  NDKRelay,
  NDKRelaySet,
  NDKRelayAuthPolicies,
  NDKUser,
  NDKNip07Signer,
  NDKPrivateKeySigner,
  type NostrEvent,
} from "@nostr-dev-kit/ndk";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import {
  BunkerSigner,
  createNostrConnectURI,
  parseBunkerInput,
  type BunkerPointer,
} from "nostr-tools/nip46";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { DEFAULT_RELAYS, RELAY_LIST_KIND } from "../types/nostr";

// Timeout configuration
const NIP07_SIGNER_TIMEOUT = 30000; // 30 seconds for NIP-07 signer operations

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

let ndkInstance: NDK | null = null;
let currentUser: NDKUser | null = null;

// Cache for user relay lists
let userRelayCache: Map<string, string[]> = new Map();

function normalizeRelayUrl(relay: string): string {
  return relay.trim().toLowerCase().replace(/\/+$/, "");
}

export function mergeRelayUrls(
  ...relayGroups: Array<string[] | undefined>
): string[] {
  const relaySet = new Set<string>();

  for (const relays of relayGroups) {
    if (!relays) continue;

    for (const relay of relays) {
      const normalized = normalizeRelayUrl(relay);
      if (normalized.startsWith("wss://") || normalized.startsWith("ws://")) {
        relaySet.add(normalized);
      }
    }
  }

  return Array.from(relaySet);
}

export interface NostrClientOptions {
  relays?: string[];
  autoConnect?: boolean;
}

/**
 * Initialize NDK with optional custom relays
 */
export async function initializeNDK(
  options: NostrClientOptions = {},
): Promise<NDK> {
  // Return existing instance if already initialized
  if (ndkInstance) {
    return ndkInstance;
  }

  const relays = options.relays || DEFAULT_RELAYS;

  ndkInstance = new NDK({
    explicitRelayUrls: relays,
  });

  if (options.autoConnect !== false) {
    // Connect in background - don't block on relay connections
    // Signers work independently of relay connections
    ndkInstance.connect().catch((err) => {
      console.warn("[NDK] Background relay connection failed:", err);
    });
  }

  return ndkInstance;
}

/**
 * Get the current NDK instance (must be initialized first)
 */
export function getNDK(): NDK {
  if (!ndkInstance) {
    throw new Error("NDK not initialized. Call initializeNDK() first.");
  }
  return ndkInstance;
}

/**
 * Ensure NDK is initialized and has at least one connected relay.
 * Safe to call from anywhere — initializes NDK if needed, waits for
 * first relay connection with a timeout so callers don't hang.
 */
export async function ensureNDK(): Promise<NDK> {
  const ndk = ndkInstance ?? (await initializeNDK());

  // Check if any pool relay is already connected
  for (const relay of ndk.pool.relays.values()) {
    if (relay.status === 1) return ndk;
  }

  // Wait for the first relay to connect (5s timeout)
  await new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    for (const relay of ndk.pool.relays.values()) {
      relay.on("connect", done);
    }
    setTimeout(done, 5000);
  });

  return ndk;
}

/**
 * Connect to NIP-07 browser extension (Alby, nos2x, etc.)
 */
export async function connectWithNip07(): Promise<NDKUser> {
  const ndk = getNDK();

  if (typeof window === "undefined" || !window.nostr) {
    throw new Error("No NIP-07 extension found. Please install Alby or nos2x.");
  }

  const signer = new NDKNip07Signer();
  ndk.signer = signer;

  // Enable NIP-42 relay authentication so paid/private relays
  // (e.g. inbox.nostr.wine) automatically sign AUTH challenges
  ndk.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({ ndk });

  // Add timeout to signer.user() which calls out to NIP-07 extension
  const user = await withTimeout(
    signer.user(),
    NIP07_SIGNER_TIMEOUT,
    "NIP-07 signer connection",
  );

  // Fetch profile with timeout (non-critical, can fail gracefully)
  try {
    await withTimeout(user.fetchProfile(), 10000, "Profile fetch");
  } catch (err) {
    console.warn("Failed to fetch profile:", err);
    // Continue without profile - not critical for login
  }

  currentUser = user;

  // Load user's NIP-65 relays in background
  loadUserRelays(user.pubkey).catch((err) =>
    console.warn("Failed to load user relays:", err),
  );

  return user;
}

/**
 * Generate a new Nostr keypair
 */
export function generateKeypair(): {
  secretKeyHex: string;
  pubkey: string;
  nsec: string;
  npub: string;
} {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  const secretKeyHex = Array.from(secretKey)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    secretKeyHex,
    pubkey,
    nsec: nip19.nsecEncode(secretKey),
    npub: nip19.npubEncode(pubkey),
  };
}

/**
 * Connect with a private key (hex format)
 */
export async function connectWithPrivateKey(
  privateKeyHex: string,
): Promise<NDKUser> {
  const ndk = getNDK();

  const signer = new NDKPrivateKeySigner(privateKeyHex);
  ndk.signer = signer;
  ndk.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({ ndk });

  const user = await signer.user();

  // Fetch profile with timeout (non-critical, can fail gracefully)
  try {
    await withTimeout(user.fetchProfile(), 10000, "Profile fetch");
  } catch (err) {
    console.warn("Failed to fetch profile:", err);
  }

  currentUser = user;

  // Load user's NIP-65 relays in background
  loadUserRelays(user.pubkey).catch((err) =>
    console.warn("Failed to load user relays:", err),
  );

  return user;
}

/**
 * Stage signal for NIP-46 connect progress, surfaced to the UI.
 * - parsing: validating the bunker URL
 * - connecting: opening the NIP-46 subscription on bunker relays
 * - awaiting-approval: connect RPC sent, waiting for the signer to respond
 * - auth-url: signer returned an auth_url challenge that the user must open
 * - finalizing: pubkey received, fetching profile / wiring NDK
 */
export type Nip46Stage =
  | "parsing"
  | "connecting"
  | "awaiting-approval"
  | "auth-url"
  | "finalizing";

export interface ConnectWithBunkerOptions {
  onStage?: (stage: Nip46Stage, payload?: { authUrl?: string }) => void;
}

/**
 * Connect with NIP-46 bunker URI using nostr-tools' BunkerSigner.
 *
 * Replaces the previous NDKNip46Signer path, which had no internal timeout
 * and no granularity around where in the handshake it was hanging. We now:
 *  - parse + validate the URI up front (fail fast on missing relays)
 *  - send connect() with a 30s budget (signer push notifications wake apps)
 *  - send get_public_key() with a separate 10s budget
 *  - bridge nostr-tools' signer into NDK via the existing BunkerSignerWrapper
 *  - report stage transitions so the UI can show actionable progress
 */
export async function connectWithBunker(
  bunkerUri: string,
  localSignerKey?: string,
  options: ConnectWithBunkerOptions = {},
): Promise<{ user: NDKUser; localKey: string }> {
  const { onStage } = options;
  const ndk = getNDK();

  onStage?.("parsing");
  const bp = await parseBunkerInput(bunkerUri);
  if (!bp) {
    throw new Error("Invalid bunker URL. Generate a new one in your signer.");
  }
  if (bp.relays.length === 0) {
    throw new Error(
      "Bunker URL is missing relay info. Generate a new one in your signer.",
    );
  }

  const secretKey = localSignerKey
    ? hexToBytes(localSignerKey)
    : generateSecretKey();

  onStage?.("connecting");
  const signer = BunkerSigner.fromBunker(secretKey, bp, {
    onauth: (authUrl: string) => {
      onStage?.("auth-url", { authUrl });
    },
  });

  try {
    onStage?.("awaiting-approval");
    await withTimeout(signer.connect(), 30000, "Signer approval");
    const userPubkey = await withTimeout(
      signer.getPublicKey(),
      10000,
      "Signer pubkey",
    );

    onStage?.("finalizing");
    ndk.signer = new BunkerSignerWrapper(signer, userPubkey, ndk);
    ndk.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({ ndk });

    const user = ndk.getUser({ pubkey: userPubkey });
    try {
      await withTimeout(user.fetchProfile(), 10000, "Profile fetch");
    } catch (err) {
      console.warn("Failed to fetch profile:", err);
    }

    currentUser = user;

    loadUserRelays(user.pubkey).catch((err) =>
      console.warn("Failed to load user relays:", err),
    );

    return { user, localKey: bytesToHex(secretKey) };
  } catch (err) {
    // Close the underlying subscription so we don't leak a long-lived
    // listener on a failed handshake.
    try {
      await signer.close();
    } catch {
      // ignore
    }
    throw err;
  }
}

// Store for active nostrconnect session
let activeNostrConnectSession: {
  uri: string;
  secretKey: Uint8Array;
  secret: string;
} | null = null;

/**
 * Generate a nostrconnect:// URI for remote signer to scan
 * Returns the URI and local signer key for later use
 */
export function generateNostrConnectURI(): {
  uri: string;
  localKeyHex: string;
  secret: string;
} {
  // Generate a local keypair for this connection
  const secretKey = generateSecretKey();
  const clientPubkey = getPublicKey(secretKey);
  const secret = bytesToHex(generateSecretKey()).substring(0, 16);

  // Use specific relays for nostrconnect - primal first for Primal app compatibility
  const nostrConnectRelays = [
    "wss://relay.primal.net",
    "wss://relay.damus.io",
    "wss://nos.lol",
  ];

  const uri = createNostrConnectURI({
    clientPubkey,
    relays: nostrConnectRelays,
    secret,
    name: "Words With Zaps",
    url:
      typeof window !== "undefined"
        ? window.location.origin
        : "https://wordswithzaps.top",
  });

  // Store session for later use
  activeNostrConnectSession = { uri, secretKey, secret };

  return {
    uri,
    localKeyHex: bytesToHex(secretKey),
    secret,
  };
}

/**
 * Wait for a nostrconnect response from remote signer using nostr-tools BunkerSigner
 */
export async function waitForNostrConnect(
  _localKeyHex: string,
  _expectedSecret: string,
  timeoutMs: number = 120000,
): Promise<{
  user: NDKUser;
  remotePubkey: string;
  bunkerPointer: BunkerPointer;
}> {
  const ndk = getNDK();

  if (!activeNostrConnectSession) {
    throw new Error("No active nostrconnect session");
  }

  const { uri, secretKey } = activeNostrConnectSession;

  // Use nostr-tools BunkerSigner.fromURI which properly handles the nostrconnect flow
  const bunkerSigner = await BunkerSigner.fromURI(
    secretKey,
    uri,
    {},
    timeoutMs,
  );

  // Get the user's public key from the remote signer
  const userPubkey = await bunkerSigner.getPublicKey();
  const remotePubkey = bunkerSigner.bp.pubkey;

  // Create a custom NDK signer that wraps the BunkerSigner
  ndk.signer = new BunkerSignerWrapper(bunkerSigner, userPubkey, ndk);
  ndk.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({ ndk });

  // Get the user
  const user = ndk.getUser({ pubkey: userPubkey });
  await user.fetchProfile();

  currentUser = user;

  // Load user's NIP-65 relays in background
  loadUserRelays(user.pubkey).catch((err) =>
    console.warn("Failed to load user relays:", err),
  );

  // Clear the session
  activeNostrConnectSession = null;

  return { user, remotePubkey, bunkerPointer: bunkerSigner.bp };
}

/**
 * Custom NDK signer that wraps a nostr-tools BunkerSigner
 */
class BunkerSignerWrapper {
  private bunkerSigner: BunkerSigner;
  private ndkInstance: NDK;
  private _pubkey: string;
  private _user: NDKUser | null = null;

  constructor(bunkerSigner: BunkerSigner, userPubkey: string, ndk: NDK) {
    this.bunkerSigner = bunkerSigner;
    this._pubkey = userPubkey;
    this.ndkInstance = ndk;
    // Initialize _user immediately
    this._user = ndk.getUser({ pubkey: userPubkey });
  }

  // Required by NDKSigner interface - getter
  get pubkey(): string {
    return this._pubkey;
  }

  // Required by NDKSigner interface - getter
  get userSync(): NDKUser {
    if (!this._user) {
      this._user = this.ndkInstance.getUser({ pubkey: this._pubkey });
    }
    return this._user;
  }

  // Required by NDKSigner interface
  toPayload(): string {
    return JSON.stringify({
      type: "nip46-bunker",
      pubkey: this._pubkey,
      bunkerPubkey: this.bunkerSigner.bp.pubkey,
      relays: this.bunkerSigner.bp.relays,
    });
  }

  async blockUntilReady(): Promise<NDKUser> {
    if (!this._user) {
      this._user = this.ndkInstance.getUser({ pubkey: this._pubkey });
    }
    return this._user;
  }

  async user(): Promise<NDKUser> {
    if (!this._user) {
      this._user = this.ndkInstance.getUser({ pubkey: this._pubkey });
    }
    return this._user;
  }

  async sign(event: NostrEvent): Promise<string> {
    const eventTemplate = {
      kind: event.kind!,
      content: event.content!,
      tags: event.tags! as string[][],
      created_at: event.created_at!,
    };
    const signed = await this.bunkerSigner.signEvent(eventTemplate);
    return signed.sig;
  }

  async encrypt(
    recipient: NDKUser,
    value: string,
    scheme: "nip44" | "nip04" = "nip44",
  ): Promise<string> {
    if (scheme === "nip04") {
      return this.bunkerSigner.nip04Encrypt(recipient.pubkey, value);
    }
    return this.bunkerSigner.nip44Encrypt(recipient.pubkey, value);
  }

  async decrypt(
    sender: NDKUser,
    value: string,
    scheme: "nip44" | "nip04" = "nip44",
  ): Promise<string> {
    if (scheme === "nip04") {
      return this.bunkerSigner.nip04Decrypt(sender.pubkey, value);
    }
    return this.bunkerSigner.nip44Decrypt(sender.pubkey, value);
  }
}

/**
 * Get the currently logged in user
 */
export function getCurrentUser(): NDKUser | null {
  return currentUser;
}

/**
 * Set the current user (for fast session restore)
 */
export function setCurrentUser(user: NDKUser | null): void {
  currentUser = user;
}

/**
 * Check if user is connected
 */
export function isConnected(): boolean {
  return currentUser !== null && ndkInstance !== null;
}

/**
 * Fetch user's relay list from Nostr (NIP-65 kind:10002)
 * Returns write relays that the user publishes to
 */
export async function fetchUserRelayList(pubkey: string): Promise<string[]> {
  // Check cache first
  const cached = userRelayCache.get(pubkey);
  if (cached) {
    return cached;
  }

  try {
    // Query relay metadata on an explicit relay set so cold starts don't only
    // search the handful of relays that happened to connect first.
    const events = await fetchEvents(
      {
        kinds: [RELAY_LIST_KIND],
        authors: [pubkey],
        limit: 5,
      },
      {
        relayUrls: mergeRelayUrls(getRelayUrls(), DEFAULT_RELAYS),
        timeoutMs: 8000,
      },
    );

    if (events.length === 0) {
      return [];
    }

    const event = events.sort(
      (a, b) => (b.created_at || 0) - (a.created_at || 0),
    )[0];
    const writeRelays: string[] = [];

    // Parse relay tags - "r" tags with optional read/write marker
    // No marker = both read and write
    // "read" = read only
    // "write" = write only
    event.tags.forEach((tag) => {
      if (tag[0] === "r") {
        const relay = tag[1];
        const permission = tag[2];

        // Include if no permission specified (both) or if explicitly "write"
        if (!permission || permission === "write") {
          writeRelays.push(relay);
        }
      }
    });

    // Cache the result
    if (writeRelays.length > 0) {
      userRelayCache.set(pubkey, writeRelays);
    }

    return writeRelays;
  } catch (error) {
    console.error("Failed to fetch relay list from Nostr:", error);
    return [];
  }
}

/**
 * Get expanded relay list combining user relays with defaults
 * Prioritizes user relays, fills remaining slots with defaults
 */
export function getExpandedRelayList(
  userRelays: string[],
  maxRelays: number = 12,
): string[] {
  const relaySet = new Set<string>();
  const pinnedRelays = [
    "wss://relay.damus.io",
    "wss://relay.primal.net",
    "wss://nos.lol",
  ];

  // Always include core game relays so existing games stay visible
  for (const relay of pinnedRelays) {
    relaySet.add(normalizeRelayUrl(relay));
  }

  // Add user relays next (more likely to have user's data)
  for (const relay of userRelays) {
    if (relaySet.size >= maxRelays) break;
    // Normalize: lowercase, remove trailing slashes
    const normalized = normalizeRelayUrl(relay);
    if (normalized.startsWith("wss://") || normalized.startsWith("ws://")) {
      relaySet.add(normalized);
    }
  }

  // Fill remaining slots with default relays
  for (const relay of DEFAULT_RELAYS) {
    if (relaySet.size >= maxRelays) break;
    relaySet.add(normalizeRelayUrl(relay));
  }

  return Array.from(relaySet);
}

export async function getDiscoveryRelayUrls(pubkeys: string[] = []): Promise<string[]> {
  const uniquePubkeys = Array.from(new Set(pubkeys.filter(Boolean)));
  const relayGroups = await Promise.all(
    uniquePubkeys.map(async (pubkey) => {
      try {
        const userRelays = await fetchUserRelayList(pubkey);
        return getExpandedRelayList(userRelays);
      } catch {
        return [];
      }
    }),
  );

  return mergeRelayUrls(getRelayUrls(), DEFAULT_RELAYS, ...relayGroups);
}

/**
 * Add relays to NDK pool dynamically
 */
export async function addRelaysToPool(relays: string[]): Promise<void> {
  const ndk = getNDK();

  for (const relay of relays) {
    const normalized = normalizeRelayUrl(relay);
    // Check if relay is already in pool
    const existingRelay = ndk.pool.relays.get(normalized);
    if (!existingRelay) {
      try {
        // Add relay to pool
        const ndkRelay = ndk.pool.getRelay(normalized, true);
        if (ndkRelay) {
          await ndkRelay.connect();
        }
      } catch (error) {
        console.warn(`Failed to connect to relay ${normalized}:`, error);
      }
    }
  }
}

/**
 * Load and connect to user's NIP-65 relays after login
 * Call this after successful authentication
 */
export async function loadUserRelays(pubkey: string): Promise<string[]> {
  const userRelays = await fetchUserRelayList(pubkey);

  if (userRelays.length > 0) {
    console.log("Found user relays (NIP-65):", userRelays);
    // Get combined list with defaults
    const expandedRelays = getExpandedRelayList(userRelays);
    console.log("Expanded relays (NIP-65 + defaults):", expandedRelays);
    // Add any new relays to the pool
    await addRelaysToPool(expandedRelays);
    return expandedRelays;
  }

  console.log("No NIP-65 relays found, using defaults");
  return DEFAULT_RELAYS;
}

/**
 * Clear relay cache (call on logout)
 */
export function clearRelayCache(): void {
  userRelayCache.clear();
}

/**
 * Get count of connected relays
 */
export function getConnectedRelayCount(): number {
  if (!ndkInstance) return 0;
  try {
    return ndkInstance.pool.connectedRelays().length;
  } catch {
    return 0;
  }
}

/**
 * Get relay URLs currently in the NDK pool
 */
export function getRelayUrls(): string[] {
  if (!ndkInstance) return [];
  try {
    return Array.from(ndkInstance.pool.relays.keys()).sort();
  } catch {
    return [];
  }
}

/**
 * Get connected relay URLs
 */
export function getConnectedRelayUrls(): string[] {
  if (!ndkInstance) return [];
  try {
    return ndkInstance.pool
      .connectedRelays()
      .map((relay) => relay.url)
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Disconnect from relays
 */
export function disconnect(): void {
  if (ndkInstance) {
    // NDK doesn't have a direct disconnect, but we can clear our references
    currentUser = null;
    ndkInstance.signer = undefined;
  }
  // Clear relay cache on disconnect
  clearRelayCache();
}

/**
 * Fetch a user's profile by pubkey
 */
export async function fetchUserProfile(pubkey: string): Promise<NDKUser> {
  const ndk = getNDK();
  const user = ndk.getUser({ pubkey });
  await user.fetchProfile();
  return user;
}

/**
 * Subscribe to events matching a filter
 */
export function subscribeToEvents(
  filter: NDKFilter,
  onEvent: (event: NDKEvent) => void,
  onEose?: () => void,
): { unsubscribe: () => void } {
  const ndk = getNDK();
  const subscription = ndk.subscribe(filter, { closeOnEose: false });

  subscription.on("event", onEvent);
  if (onEose) {
    subscription.on("eose", onEose);
  }

  return {
    unsubscribe: () => {
      subscription.stop();
    },
  };
}

/**
 * Fetch events matching a filter (one-time query)
 */
const FETCH_EVENTS_TIMEOUT_MS = 6000;

/**
 * Fetch events matching a filter (one-time query)
 * Uses a timeout to avoid hanging if relays never send EOSE.
 *
 * If `relayUrls` is provided, the request is sent to that explicit relay set
 * (with `connectOnSubscribe=true`). Without it, NDK would only consider relays
 * that happen to be connected at subscribe time — during cold start, that can
 * be a small subset that doesn't have the event, causing NDK to emit EOSE
 * early with no results.
 */
export async function fetchEvents(
  filter: NDKFilter,
  options: { relayUrls?: string[]; timeoutMs?: number } = {},
): Promise<NDKEvent[]> {
  const ndk = getNDK();
  const timeoutMs = options.timeoutMs ?? FETCH_EVENTS_TIMEOUT_MS;
  const relaySet =
    options.relayUrls && options.relayUrls.length > 0
      ? NDKRelaySet.fromRelayUrls(options.relayUrls, ndk, true)
      : undefined;

  return new Promise((resolve) => {
    const events = new Map<string, NDKEvent>();
    const subscription = ndk.subscribe(filter, {
      closeOnEose: true,
      ...(relaySet ? { relaySet } : {}),
    });
    let settled = false;

    const finalize = () => {
      if (settled) return;
      settled = true;
      subscription.stop();
      resolve(Array.from(events.values()));
    };

    const timeoutId = setTimeout(() => {
      // Timed out waiting for EOSE — return whatever we have
      finalize();
    }, timeoutMs);

    subscription.on("event", (event: NDKEvent) => {
      const dedupKey =
        typeof event.deduplicationKey === "function"
          ? event.deduplicationKey()
          : event.id;
      const existing = events.get(dedupKey);
      if (!existing || (event.created_at || 0) >= (existing.created_at || 0)) {
        events.set(dedupKey, event);
      }
    });

    subscription.on("eose", () => {
      clearTimeout(timeoutId);
      finalize();
    });
  });
}

/**
 * Publish an event to relays with confirmation and retry.
 * Returns the set of relays that acknowledged the event.
 * Throws if no relay acknowledges after all retry attempts.
 */
export async function publishEvent(
  event: NDKEvent,
  options: {
    maxRetries?: number;
    retryDelayMs?: number;
    additionalRelays?: string[];
  } = {},
): Promise<Set<NDKRelay>> {
  const { maxRetries = 2, retryDelayMs = 1500, additionalRelays } = options;
  const ndk = getNDK();
  event.ndk = ndk;
  await event.sign();

  // Build relay set: pool relays + any additional relays (without modifying global pool)
  let relaySet: NDKRelaySet | undefined;
  if (additionalRelays && additionalRelays.length > 0) {
    // Get current pool relay URLs
    const poolRelayUrls = Array.from(ndk.pool.relays.values()).map(
      (r) => r.url,
    );
    // Combine with additional relays, deduplicating
    const allRelayUrls = [...new Set([...poolRelayUrls, ...additionalRelays])];
    // Create temporary relay set (connects to new relays without adding to pool)
    relaySet = NDKRelaySet.fromRelayUrls(allRelayUrls, ndk, true);
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      console.warn(
        `[publish] retry ${attempt}/${maxRetries} for event ${event.id}`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    try {
      const relays = await event.publish(relaySet);
      if (relays.size > 0) {
        if (attempt > 0) {
          console.log(
            `[publish] succeeded on retry ${attempt} with ${relays.size} relay(s)`,
          );
        }
        return relays;
      }
      lastError = new Error("Event published but no relay acknowledged it");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    `Failed to publish event after ${maxRetries + 1} attempts: ${lastError?.message ?? "unknown error"}`,
  );
}

/**
 * Create a new NDK event
 */
export function createEvent(
  kind: number,
  content: string,
  tags: string[][] = [],
): NDKEvent {
  const ndk = getNDK();
  const event = new NDKEvent(ndk);
  event.kind = kind;
  event.content = content;
  event.tags = tags;
  return event;
}

// Note: Window.nostr type is declared by @nostr-dev-kit/ndk
