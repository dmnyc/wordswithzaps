import { createEvent, publishEvent, fetchEvents, getCurrentUser } from "./client";
import { GAMESTR_KIND, GAMESTR_D_TAG } from "../types/nostr";
import type { GamestrStats } from "../types/gamestr";
import { EMPTY_GAMESTR_STATS } from "../types/gamestr";

const CACHE_KEY = "wwz_leaderboard_stats";
const PUBLISHED_GAMES_KEY = "wwz_gamestr_published_games";

/**
 * Fetch the current player's gamestr stats from relays.
 * Returns EMPTY_GAMESTR_STATS if no event found.
 */
export async function fetchMyGamestrStats(): Promise<GamestrStats> {
  const user = getCurrentUser();
  if (!user?.pubkey) return { ...EMPTY_GAMESTR_STATS };

  // Check local cache first
  const cached = loadCachedStats();
  if (cached) return cached;

  const events = await fetchEvents({
    kinds: [GAMESTR_KIND as number],
    authors: [user.pubkey],
    "#d": [GAMESTR_D_TAG],
    limit: 1,
  });

  if (events.length === 0) return { ...EMPTY_GAMESTR_STATS };

  const latest = events.sort(
    (a, b) => (b.created_at || 0) - (a.created_at || 0),
  )[0];

  try {
    const stats = JSON.parse(latest.content) as Partial<GamestrStats>;
    const merged = { ...EMPTY_GAMESTR_STATS, ...stats };
    saveCachedStats(merged);
    return merged;
  } catch {
    return { ...EMPTY_GAMESTR_STATS };
  }
}

/**
 * Publish updated gamestr stats to relays.
 */
export async function publishGamestrStats(stats: GamestrStats): Promise<void> {
  const event = createEvent(GAMESTR_KIND, JSON.stringify(stats), [
    ["d", GAMESTR_D_TAG],
  ]);
  await publishEvent(event);
  saveCachedStats(stats);
}

/**
 * Update stats after a completed game and publish.
 * Returns silently if the game was already published.
 */
export async function updateGamestrAfterGame(
  gameId: string,
  outcome: "win" | "loss" | "tie",
  gameScore: number,
  bestWord: string,
  bestWordScore: number,
): Promise<void> {
  if (isGamePublished(gameId)) return;

  const current = await fetchMyGamestrStats();

  const updated: GamestrStats = {
    wins: current.wins + (outcome === "win" ? 1 : 0),
    losses: current.losses + (outcome === "loss" ? 1 : 0),
    ties: current.ties + (outcome === "tie" ? 1 : 0),
    highScore: Math.max(current.highScore, gameScore),
    totalGames: current.totalGames + 1,
    highestWord:
      bestWordScore > current.highestWordScore ? bestWord : current.highestWord,
    highestWordScore: Math.max(current.highestWordScore, bestWordScore),
  };

  await publishGamestrStats(updated);
  markGamePublished(gameId);
}

// --- localStorage cache helpers ---

function loadCachedStats(): GamestrStats | null {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as GamestrStats;
  } catch {
    return null;
  }
}

function saveCachedStats(stats: GamestrStats): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(stats));
  } catch {
    // Ignore storage errors
  }
}

export function clearGamestrCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(PUBLISHED_GAMES_KEY);
  } catch {
    // Ignore
  }
}

// --- Double-publish prevention ---

function getPublishedGames(): string[] {
  try {
    const stored = localStorage.getItem(PUBLISHED_GAMES_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function isGamePublished(gameId: string): boolean {
  return getPublishedGames().includes(gameId);
}

function markGamePublished(gameId: string): void {
  try {
    const games = getPublishedGames();
    if (!games.includes(gameId)) {
      games.push(gameId);
      localStorage.setItem(PUBLISHED_GAMES_KEY, JSON.stringify(games));
    }
  } catch {
    // Ignore storage errors
  }
}
