import { createEvent, publishEvent, getCurrentUser } from "./client";
import { GAMESTR_KIND, GAMESTR_GAME_ID } from "../types/nostr";

const PUBLISHED_GAMES_KEY = "wwz_gamestr_published_games";

/**
 * Publish a kind 30762 score event to the gamestr leaderboard.
 * Each completed game publishes a separate score event.
 * The `d` tag makes it addressable per game/player combo.
 */
export async function updateGamestrAfterGame(
  gameId: string,
  outcome: "win" | "loss" | "tie",
  gameScore: number,
  bestWord: string,
  bestWordScore: number,
): Promise<void> {
  if (isGamePublished(gameId)) return;

  const user = getCurrentUser();
  if (!user?.pubkey) return;

  const content = outcome === "win"
    ? `Won with ${gameScore} points! Best word: ${bestWord.toUpperCase()} (${bestWordScore} pts)`
    : outcome === "tie"
      ? `Tied at ${gameScore} points! Best word: ${bestWord.toUpperCase()} (${bestWordScore} pts)`
      : `Scored ${gameScore} points. Best word: ${bestWord.toUpperCase()} (${bestWordScore} pts)`;

  const tags: string[][] = [
    ["d", `${GAMESTR_GAME_ID}:${user.pubkey}:${gameId}`],
    ["game", GAMESTR_GAME_ID],
    ["matchid", gameId],
    ["score", String(gameScore)],
    ["score:highestword", String(bestWordScore)],
    ["highestword", bestWord.toUpperCase()],
    ["p", user.pubkey],
    ["state", "active"],
    ["mode", "multiplayer"],
    ["t", "puzzle"],
    ["t", "multiplayer"],
    ["alt", `Words With Zaps score: ${gameScore} pts (best word: ${bestWord.toUpperCase()} for ${bestWordScore} pts)`],
  ];

  const event = createEvent(GAMESTR_KIND, content, tags);
  await publishEvent(event);
  markGamePublished(gameId);
}

export function clearGamestrCache(): void {
  try {
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

export function isGamePublished(gameId: string): boolean {
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
