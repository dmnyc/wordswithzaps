import NDK, {
  NDKEvent,
  NDKFilter,
  NDKUser,
  NDKNip07Signer,
} from "@nostr-dev-kit/ndk";
import { DEFAULT_RELAYS } from "../types/nostr";

let ndkInstance: NDK | null = null;
let currentUser: NDKUser | null = null;

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
  const relays = options.relays || DEFAULT_RELAYS;

  ndkInstance = new NDK({
    explicitRelayUrls: relays,
  });

  if (options.autoConnect !== false) {
    await ndkInstance.connect();
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
 * Connect to NIP-07 browser extension (Alby, nos2x, etc.)
 */
export async function connectWithNip07(): Promise<NDKUser> {
  const ndk = getNDK();

  if (typeof window === "undefined" || !window.nostr) {
    throw new Error("No NIP-07 extension found. Please install Alby or nos2x.");
  }

  const signer = new NDKNip07Signer();
  ndk.signer = signer;

  const user = await signer.user();
  await user.fetchProfile();

  currentUser = user;
  return user;
}

/**
 * Get the currently logged in user
 */
export function getCurrentUser(): NDKUser | null {
  return currentUser;
}

/**
 * Check if user is connected
 */
export function isConnected(): boolean {
  return currentUser !== null && ndkInstance !== null;
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
 * Disconnect from relays
 */
export function disconnect(): void {
  if (ndkInstance) {
    // NDK doesn't have a direct disconnect, but we can clear our references
    currentUser = null;
    ndkInstance.signer = undefined;
  }
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
export async function fetchEvents(filter: NDKFilter): Promise<NDKEvent[]> {
  const ndk = getNDK();
  const events = await ndk.fetchEvents(filter);
  return Array.from(events);
}

/**
 * Publish an event to relays
 */
export async function publishEvent(event: NDKEvent): Promise<void> {
  const ndk = getNDK();
  event.ndk = ndk;
  await event.sign();
  await event.publish();
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
