export type AchievementType =
  | "bingo"
  | "triple-word"
  | "double-word"
  | "high-score";

export interface Achievement {
  type: AchievementType;
  word: string;
  score: number;
  message: string;
}

// Triple Word squares on the board
const TW_SQUARES = new Set([
  "0,0",
  "0,7",
  "0,14",
  "7,0",
  "7,14",
  "14,0",
  "14,7",
  "14,14",
]);

// Double Word squares on the board (including center star)
const DW_SQUARES = new Set([
  "1,1",
  "2,2",
  "3,3",
  "4,4",
  "10,10",
  "11,11",
  "12,12",
  "13,13",
  "1,13",
  "2,12",
  "3,11",
  "4,10",
  "10,4",
  "11,3",
  "12,2",
  "13,1",
  "7,7", // center star
]);

/**
 * Detect if a move qualifies as an achievement.
 * Priority order: Bingo > Triple Word > High Score (40+) > Double Word (25+)
 */
export function detectAchievement(
  word: string,
  score: number,
  coords: string[],
): Achievement | null {
  // Skip passes and exchanges
  if (word.startsWith("(")) {
    return null;
  }

  // Check bingo first (highest priority) - all 7 tiles used
  if (coords.length === 7) {
    return {
      type: "bingo",
      word,
      score,
      message: "BINGO! All 7 tiles played!",
    };
  }

  // Check for triple word - any placed tile on a TW square
  const hitsTW = coords.some((c) => TW_SQUARES.has(c));
  if (hitsTW) {
    return {
      type: "triple-word",
      word,
      score,
      message: "Triple Word Score!",
    };
  }

  // Check for high score (40+ points)
  if (score >= 40) {
    return {
      type: "high-score",
      word,
      score,
      message: `Amazing ${score} points!`,
    };
  }

  // Check for double word (25+ points required to be noteworthy)
  const hitsDW = coords.some((c) => DW_SQUARES.has(c));
  if (hitsDW && score >= 25) {
    return {
      type: "double-word",
      word,
      score,
      message: "Double Word Score!",
    };
  }

  return null;
}
