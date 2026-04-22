import { fetchEvents, fetchUserRelayList, getNDK } from "./client";
import { NDKRelaySet } from "@nostr-dev-kit/ndk";
import { decryptGameState } from "./encryption";
import type { GameState, GameStatus } from "../types/game";
import { GameEngine } from "../engine/GameEngine";
import { NostrSync } from "./NostrSync";
import {
  DEFAULT_RELAYS,
  GAME_D_TAG_PREFIX,
  GAME_KIND,
  RACK_D_TAG_PREFIX,
} from "../types/nostr";

export interface GameSummary {
  gameId: string;
  opponentPubkey: string;
  players: string[];
  updatedAt: number;
  eventId: string;
  status?: GameStatus;
  turnIndex?: number;
  activePlayer?: string;
  deletedBy?: string;
  creatorPubkey?: string;
  playerOne?: string;
  playerTwo?: string;
  p1Score?: number;
  p2Score?: number;
}

const getTagValues = (tags: string[][], name: string): string[] =>
  tags.filter((tag) => tag[0] === name && tag[1]).map((tag) => tag[1]);

// Cache decrypted game summaries by eventId to avoid redundant NIP-44 decryption
const summaryCache = new Map<string, GameSummary>();

// --- localStorage lobby cache ---
const LOBBY_CACHE_KEY = "wwz_lobby_games";

export function loadCachedGames(pubkey: string): GameSummary[] {
  try {
    const raw = localStorage.getItem(`${LOBBY_CACHE_KEY}_${pubkey}`);
    if (!raw) return [];
    return JSON.parse(raw) as GameSummary[];
  } catch {
    return [];
  }
}

export function saveCachedGames(pubkey: string, games: GameSummary[]): void {
  try {
    localStorage.setItem(`${LOBBY_CACHE_KEY}_${pubkey}`, JSON.stringify(games));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Optimistically update a game in the lobby cache after a move is played.
 * Sets activePlayer to the opponent so the lobby shows "Waiting" immediately.
 */
export function optimisticMovePlayed(
  userPubkey: string,
  gameId: string,
  opponentPubkey: string,
  newScore?: { p1Score: number; p2Score: number },
): void {
  const games = loadCachedGames(userPubkey);
  const game = games.find((g) => g.gameId === gameId);
  if (!game) return;
  game.activePlayer = opponentPubkey;
  game.updatedAt = Math.floor(Date.now() / 1000);
  if (game.turnIndex != null) game.turnIndex += 1;
  if (newScore) {
    game.p1Score = newScore.p1Score;
    game.p2Score = newScore.p2Score;
  }
  saveCachedGames(userPubkey, games);
}

const TERMINAL_STATUSES: Set<GameStatus> = new Set([
  "completed",
  "abandoned",
  "deleted",
]);

export async function fetchUserGames(
  pubkey: string,
  limit: number = 200,
  cachedGames?: GameSummary[],
): Promise<GameSummary[]> {
  // Step 1: Discover games via #p query
  const events = await fetchEvents({
    kinds: [GAME_KIND],
    "#p": [pubkey],
    limit,
  });

  const map = new Map<string, GameSummary>();

  for (const event of events) {
    const dTag = getTagValues(event.tags, "d")[0];
    if (!dTag) continue;
    if (!dTag.startsWith(GAME_D_TAG_PREFIX)) continue;
    if (dTag.startsWith(RACK_D_TAG_PREFIX)) continue;

    const gameId = dTag.slice(GAME_D_TAG_PREFIX.length);
    const players = getTagValues(event.tags, "p");
    const opponent = players.find((p) => p !== pubkey) || "";
    const updatedAt = event.created_at || 0;

    const existing = map.get(gameId);
    if (!existing || updatedAt > existing.updatedAt) {
      map.set(gameId, {
        gameId,
        opponentPubkey: opponent,
        players,
        updatedAt,
        eventId: event.id,
      });
    }
  }

  // Build index of cached terminal games for skip optimization
  const terminalCache = new Map<string, GameSummary>();
  if (cachedGames) {
    for (const cg of cachedGames) {
      if (cg.status && TERMINAL_STATUSES.has(cg.status)) {
        terminalCache.set(cg.gameId, cg);
      }
    }
  }

  // Step 2: Fetch by #d tag to get the true latest event.
  // The #p query can miss events due to relay indexing quirks on addressable events.
  // Skip terminal games whose cached state is already up-to-date, and batch
  // the remaining active games into fewer relay queries.
  const eventById = new Map(events.map((e) => [e.id, e]));

  const gamesToQuery: GameSummary[] = [];
  for (const summary of map.values()) {
    const cached = terminalCache.get(summary.gameId);
    if (cached && cached.updatedAt >= summary.updatedAt) {
      // Terminal game with no newer event — reuse cached data entirely
      Object.assign(summary, cached);
    } else {
      gamesToQuery.push(summary);
    }
  }

  // Batch #d queries for active/non-cached games (parallel)
  const D_TAG_BATCH_SIZE = 20;
  const batches: GameSummary[][] = [];
  for (let i = 0; i < gamesToQuery.length; i += D_TAG_BATCH_SIZE) {
    batches.push(gamesToQuery.slice(i, i + D_TAG_BATCH_SIZE));
  }

  await Promise.all(
    batches.map(async (batch) => {
      const dTags = batch.map(
        (s) => `${GAME_D_TAG_PREFIX}${s.gameId}`,
      );
      try {
        const gameEvents = await fetchEvents({
          kinds: [GAME_KIND],
          "#d": dTags,
          limit: batch.length * 5,
        });
        for (const event of gameEvents) {
          const dTag = getTagValues(event.tags, "d")[0];
          if (!dTag) continue;
          const gameId = dTag.slice(GAME_D_TAG_PREFIX.length);
          const summary = map.get(gameId);
          if (!summary) continue;
          const updatedAt = event.created_at || 0;
          if (updatedAt > summary.updatedAt) {
            const players = getTagValues(event.tags, "p");
            const opponent = players.find((p) => p !== pubkey) || "";
            summary.opponentPubkey = opponent || summary.opponentPubkey;
            summary.players = players.length > 0 ? players : summary.players;
            summary.updatedAt = updatedAt;
            summary.eventId = event.id;
          }
          eventById.set(event.id, event);
        }
      } catch {
        // Fall back to #p results if batch #d fetch fails
      }
    }),
  );

  const summaries = Array.from(map.values()).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  // Seed in-memory summaryCache from localStorage cache to avoid redundant
  // NIP-44 decryption after page reload
  if (cachedGames) {
    for (const cg of cachedGames) {
      if (cg.eventId && cg.status && !summaryCache.has(cg.eventId)) {
        summaryCache.set(cg.eventId, cg);
      }
    }
  }

  // Step 3: Decrypt latest state to get status + turn info (parallel)
  // Use cache to skip decryption for events we've already processed
  await Promise.all(
    summaries.map(async (summary) => {
      const cached = summaryCache.get(summary.eventId);
      if (cached) {
        summary.status = cached.status;
        summary.deletedBy = cached.deletedBy;
        summary.creatorPubkey = cached.creatorPubkey;
        summary.playerOne = cached.playerOne;
        summary.playerTwo = cached.playerTwo;
        summary.turnIndex = cached.turnIndex;
        summary.activePlayer = cached.activePlayer;
        summary.p1Score = cached.p1Score;
        summary.p2Score = cached.p2Score;
        // Also reconcile opponentPubkey from cached authoritative data
        if (cached.opponentPubkey) {
          summary.opponentPubkey = cached.opponentPubkey;
        }
        return;
      }

      const event = eventById.get(summary.eventId);
      if (!event || !summary.opponentPubkey) return;
      try {
        const decryptKey =
          event.pubkey === pubkey ? summary.opponentPubkey : event.pubkey;
        const state = await decryptGameState<GameState>(
          decryptKey,
          event.content,
        );
        summary.status = state.meta.status;
        summary.deletedBy = state.meta.deletedBy;
        summary.creatorPubkey = state.meta.playerOne;
        summary.playerOne = state.meta.playerOne;
        summary.playerTwo = state.meta.playerTwo;
        summary.turnIndex = state.turn.index;
        summary.activePlayer = state.turn.activePlayer;
        summary.p1Score = state.scoring.p1Score;
        summary.p2Score = state.scoring.p2Score;

        // Reconcile opponentPubkey with the authoritative decrypted state.
        // The p-tags used in Steps 1/2 can be stale due to relay caching or
        // NDK deduplication on addressable events; the encrypted playerOne/
        // playerTwo fields are the ground truth.
        if (state.meta.playerOne === pubkey) {
          summary.opponentPubkey = state.meta.playerTwo;
        } else if (state.meta.playerTwo === pubkey) {
          summary.opponentPubkey = state.meta.playerOne;
        }

        summaryCache.set(summary.eventId, { ...summary });
      } catch {
        // Skip if decryption fails
      }
    }),
  );

  return summaries;
}

export async function deleteGameFromLobby(
  gameId: string,
  userPubkey: string,
): Promise<void> {
  const dTag = `${GAME_D_TAG_PREFIX}${gameId}`;
  const events = await fetchEvents({
    kinds: [GAME_KIND],
    "#d": [dTag],
    limit: 20,
  });

  if (events.length === 0) {
    throw new Error("Game not found on relays");
  }

  const sorted = events.sort(
    (a, b) => (b.created_at || 0) - (a.created_at || 0),
  );

  let lastError: Error | null = null;

  for (const event of sorted) {
    const players = getTagValues(event.tags, "p");
    if (players.length === 0 || !players.includes(userPubkey)) {
      continue;
    }
    const opponent = players.find((p) => p !== userPubkey) || "";
    if (!opponent) continue;

    try {
      const decryptKey = event.pubkey === userPubkey ? opponent : event.pubkey;
      const state = await decryptGameState<GameState>(
        decryptKey,
        event.content,
      );

      if (state.meta.playerOne !== userPubkey) {
        throw new Error("Only the game creator can delete this game");
      }

      const newState = GameEngine.deleteGame(state, userPubkey);
      const sync = new NostrSync(gameId, opponent);
      await sync.publishGameState(newState, event.id);
      await sync.publishDeletionForGame(
        `Deleted Words With Zaps game ${gameId}`,
      );
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw (
    lastError || new Error("Unable to delete game. No decryptable state found.")
  );
}

export async function fetchGamePlayers(gameId: string): Promise<{
  players: string[];
  updatedAt: number;
  eventId: string;
} | null> {
  const dTag = `${GAME_D_TAG_PREFIX}${gameId}`;
  const filter = {
    kinds: [GAME_KIND],
    "#d": [dTag],
    limit: 10,
  };

  // Force the request to the full default relay set with connect-on-subscribe.
  // Without an explicit relay set, NDK only counts relays already connected at
  // subscribe time when deciding when to emit EOSE — during cold start that
  // can be a small subset that doesn't have the event, causing an early empty
  // result. Pinning the relays makes NDK wait for them.
  let events = await fetchEvents(filter, {
    relayUrls: DEFAULT_RELAYS,
    timeoutMs: 8000,
  });

  // One retry after a short delay handles transient relay slowness and lets
  // any in-flight relay connections complete.
  if (events.length === 0) {
    await new Promise((r) => setTimeout(r, 2000));
    events = await fetchEvents(filter, {
      relayUrls: DEFAULT_RELAYS,
      timeoutMs: 8000,
    });
  }

  if (events.length === 0) return null;

  const sorted = events.sort(
    (a, b) => (b.created_at || 0) - (a.created_at || 0),
  );
  const latest = sorted[0];
  const players = getTagValues(latest.tags, "p");

  return {
    players,
    updatedAt: latest.created_at || 0,
    eventId: latest.id,
  };
}

/**
 * Rebroadcast a game event to all connected relays plus opponent's NIP-65 relays
 * Useful when opponents can't find the game event on their relays
 */
export async function rebroadcastGame(gameId: string): Promise<number> {
  const dTag = `${GAME_D_TAG_PREFIX}${gameId}`;
  const events = await fetchEvents({
    kinds: [GAME_KIND],
    "#d": [dTag],
    limit: 10,
  });

  if (events.length === 0) {
    throw new Error("Game event not found");
  }

  // Get the latest event
  const sorted = events.sort(
    (a, b) => (b.created_at || 0) - (a.created_at || 0),
  );
  const latest = sorted[0];

  // Get players from the event and fetch their NIP-65 relays
  const players = getTagValues(latest.tags, "p");
  const playerRelays: string[] = [];

  for (const pubkey of players) {
    try {
      const relays = await fetchUserRelayList(pubkey);
      playerRelays.push(...relays);
    } catch (err) {
      console.warn(`[rebroadcast] Failed to fetch relays for ${pubkey}:`, err);
    }
  }

  // Build relay set: pool relays + player relays (without modifying global pool)
  const ndk = getNDK();
  const poolRelayUrls = Array.from(ndk.pool.relays.values()).map((r) => r.url);
  const allRelayUrls = [...new Set([...poolRelayUrls, ...playerRelays])];

  // Create temporary relay set for this publish only
  const relaySet = NDKRelaySet.fromRelayUrls(allRelayUrls, ndk, true);
  console.log(
    `[rebroadcast] Publishing to ${allRelayUrls.length} relays (${playerRelays.length} from players)`,
  );

  // Rebroadcast to combined relay set
  const relays = await latest.publish(relaySet);

  return relays.size;
}
