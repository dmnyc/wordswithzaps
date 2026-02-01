import { nip19 } from "nostr-tools";
import type { NostrProfile } from "../types/nostr";
import { fetchEvents } from "./client";

const PROFILE_KIND = 0;
const PROFILE_FETCH_LIMIT = 1000;
const PROFILE_CACHE_TTL_MS = 60_000;
const PRIMAL_CACHE_ENDPOINTS = ["wss://cache2.primal.net/v1"];

let cachedProfiles: NostrProfile[] | null = null;
let cachedAt = 0;
let cachePromise: Promise<NostrProfile[]> | null = null;

// Primal cache WebSocket connection
let primalWs: WebSocket | null = null;
let primalConnected = false;
let primalConnecting = false;
const primalPendingRequests = new Map<
  string,
  {
    resolve: (value: any[]) => void;
    reject: (reason?: any) => void;
    timeout: ReturnType<typeof setTimeout>;
    results: any[];
  }
>();

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const parseProfile = (pubkey: string, content: string): NostrProfile | null => {
  try {
    const metadata = JSON.parse(content) as Record<string, unknown>;
    const displayName =
      stringOrUndefined(metadata["display_name"]) ||
      stringOrUndefined(metadata["displayName"]);

    return {
      pubkey,
      name: stringOrUndefined(metadata["name"]),
      displayName,
      picture: stringOrUndefined(metadata["picture"]),
      nip05: stringOrUndefined(metadata["nip05"]),
      lud16: stringOrUndefined(metadata["lud16"]),
      lud06: stringOrUndefined(metadata["lud06"]),
    };
  } catch {
    return null;
  }
};

async function connectToPrimal(): Promise<boolean> {
  if (primalConnected) {
    return true;
  }

  if (primalConnecting) {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (primalConnected || !primalConnecting) {
          clearInterval(checkInterval);
          resolve(primalConnected);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(false);
      }, 5000);
    });
  }

  primalConnecting = true;

  const endpoint = PRIMAL_CACHE_ENDPOINTS[0];
  try {
    return await new Promise((resolve, reject) => {
      primalWs = new WebSocket(endpoint);

      const connectionTimeout = setTimeout(() => {
        if (!primalConnected) {
          primalWs?.close();
          reject(new Error("Primal cache connection timeout"));
        }
      }, 5000);

      primalWs.onopen = () => {
        clearTimeout(connectionTimeout);
        primalConnected = true;
        primalConnecting = false;
        resolve(true);
      };

      primalWs.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const [type, requestId, payload] = message;

          if (type === "EVENT" && primalPendingRequests.has(requestId)) {
            const request = primalPendingRequests.get(requestId)!;
            if (payload && payload.kind === PROFILE_KIND) {
              request.results.push(payload);
            }
          }

          if (type === "EOSE" && primalPendingRequests.has(requestId)) {
            const request = primalPendingRequests.get(requestId)!;
            clearTimeout(request.timeout);
            request.resolve(request.results);
            primalPendingRequests.delete(requestId);
          }

          if (type === "NOTICE" && primalPendingRequests.has(requestId)) {
            const request = primalPendingRequests.get(requestId)!;
            clearTimeout(request.timeout);
            request.reject(new Error(`Primal cache error: ${payload}`));
            primalPendingRequests.delete(requestId);
          }
        } catch {
          // Ignore parse errors; we'll fall back to relay search
        }
      };

      primalWs.onerror = (error) => {
        clearTimeout(connectionTimeout);
        primalConnected = false;
        primalConnecting = false;
        reject(error);
      };

      primalWs.onclose = () => {
        primalConnected = false;
        primalConnecting = false;
      };
    });
  } catch {
    primalConnecting = false;
    return false;
  }
}

async function searchPrimalCache(query: string, limit: number): Promise<any[]> {
  const connected = await connectToPrimal();
  if (!connected || !primalWs) {
    throw new Error("Failed to connect to Primal cache");
  }

  const requestId = `primal_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 9)}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      primalPendingRequests.delete(requestId);
      reject(new Error("Primal search timeout"));
    }, 5000);

    primalPendingRequests.set(requestId, {
      resolve,
      reject,
      timeout,
      results: [],
    });

    const searchQuery = [
      "REQ",
      requestId,
      {
        cache: [
          "user_search",
          {
            query,
            limit,
          },
        ],
      },
    ];

    primalWs!.send(JSON.stringify(searchQuery));
  });
}

export function normalizePubkey(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const lowerTrimmed = trimmed.toLowerCase();
  const withoutPrefix = lowerTrimmed.startsWith("nostr:")
    ? trimmed.slice("nostr:".length)
    : trimmed;
  const normalized = withoutPrefix.toLowerCase();

  if (normalized.startsWith("npub1") || normalized.startsWith("nprofile1")) {
    try {
      const decoded = nip19.decode(normalized);
      if (decoded.type === "npub") {
        return decoded.data;
      }
      if (decoded.type === "nprofile") {
        return decoded.data.pubkey;
      }
      return null;
    } catch {
      return null;
    }
  }

  if (/^[a-f0-9]{64}$/i.test(withoutPrefix)) {
    return withoutPrefix.toLowerCase();
  }

  return null;
}

export async function fetchProfile(
  pubkey: string,
): Promise<NostrProfile | null> {
  const events = await fetchEvents({
    kinds: [PROFILE_KIND],
    authors: [pubkey],
    limit: 5,
  });

  if (events.length === 0) return null;

  const sorted = events.sort(
    (a, b) => (b.created_at || 0) - (a.created_at || 0),
  );
  const latest = sorted[0];
  return parseProfile(pubkey, latest.content);
}

async function fetchProfileIndex(): Promise<NostrProfile[]> {
  const now = Date.now();
  if (cachedProfiles && now - cachedAt < PROFILE_CACHE_TTL_MS) {
    return cachedProfiles;
  }

  if (cachePromise) {
    return cachePromise;
  }

  cachePromise = (async () => {
    const events = await fetchEvents({
      kinds: [PROFILE_KIND],
      limit: PROFILE_FETCH_LIMIT,
    });

    const map = new Map<string, { createdAt: number; profile: NostrProfile }>();

    for (const event of events) {
      const profile = parseProfile(event.pubkey, event.content);
      if (!profile) continue;
      const createdAt = event.created_at || 0;
      const existing = map.get(event.pubkey);
      if (!existing || createdAt > existing.createdAt) {
        map.set(event.pubkey, { createdAt, profile });
      }
    }

    const profiles = Array.from(map.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((entry) => entry.profile);

    cachedProfiles = profiles;
    cachedAt = Date.now();
    return profiles;
  })();

  try {
    return await cachePromise;
  } finally {
    cachePromise = null;
  }
}

// Search profiles by query string (name, display_name, nip05)
export async function searchProfiles(
  query: string,
  limit: number = 20,
): Promise<NostrProfile[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const directPubkey = normalizePubkey(trimmed);
  if (directPubkey) {
    const profile = await fetchProfile(directPubkey);
    return profile ? [profile] : [];
  }

  try {
    const primalResults = await searchPrimalCache(trimmed, limit);
    if (primalResults && primalResults.length > 0) {
      const profiles: NostrProfile[] = [];
      for (const event of primalResults) {
        const profile = parseProfile(event.pubkey, event.content);
        if (!profile) continue;
        if (profile.nip05 && profile.nip05.includes("mostr.pub")) {
          continue;
        }
        profiles.push(profile);
      }
      if (profiles.length > 0) {
        return profiles;
      }
    }
  } catch {
    // Fall back to relay search
  }

  const profiles = await fetchProfileIndex();
  const queryLower = trimmed.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(Boolean);

  const matches: NostrProfile[] = [];

  for (const profile of profiles) {
    const name = (profile.name || "").toLowerCase();
    const displayName = (profile.displayName || "").toLowerCase();
    const nip05 = (profile.nip05 || "").toLowerCase();

    const hasDirectMatch =
      name.includes(queryLower) ||
      displayName.includes(queryLower) ||
      nip05.includes(queryLower);

    const nameWords = name.split(/\s+/);
    const displayWords = displayName.split(/\s+/);

    const hasWordMatch =
      queryWords.length > 0 &&
      queryWords.every(
        (word) =>
          nip05.includes(word) ||
          nameWords.some((nWord) => nWord.includes(word)) ||
          displayWords.some((dWord) => dWord.includes(word)),
      );

    const hasStartMatch =
      queryWords.length > 0 &&
      queryWords.every(
        (word) =>
          nameWords.some((nWord) => nWord.startsWith(word)) ||
          displayWords.some((dWord) => dWord.startsWith(word)),
      );

    if (hasDirectMatch || hasWordMatch || hasStartMatch) {
      matches.push(profile);
    }

    if (matches.length >= limit) break;
  }

  return matches;
}
