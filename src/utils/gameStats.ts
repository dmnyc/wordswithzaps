import type { MoveHistory } from "../types/game";

export interface GameEndStats {
  highestWord: string;
  highestWordScore: number;
  totalWordsPlayed: number;
  totalMoves: number;
}

/**
 * Compute end-of-game stats for a player from the scoring history.
 */
export function computeGameEndStats(
  history: MoveHistory[],
  playerPubkey: string,
): GameEndStats {
  let highestWord = "";
  let highestWordScore = 0;
  let totalWordsPlayed = 0;
  let totalMoves = 0;

  for (const entry of history) {
    if (entry.player !== playerPubkey) continue;
    totalMoves++;

    // Skip passes and exchanges
    if (entry.coords.length === 0) continue;

    totalWordsPlayed++;
    if (entry.score > highestWordScore) {
      highestWordScore = entry.score;
      // Take the first word if multiple were formed
      highestWord = entry.word.includes(",")
        ? entry.word.split(",")[0].trim()
        : entry.word;
    }
  }

  return { highestWord, highestWordScore, totalWordsPlayed, totalMoves };
}
