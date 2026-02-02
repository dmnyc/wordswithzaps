export const BOARD_SIZE = 13;
export const RACK_SIZE = 7;
export const BINGO_BONUS = 42;
export const ZAP_BONUS_POINTS = 21;
export const CENTER_POSITION = { x: 6, y: 6 };

// Letter point values (Words With Zaps)
export const LETTER_VALUES: Record<string, number> = {
  A: 1,
  B: 4,
  C: 4,
  D: 2,
  E: 1,
  F: 5,
  G: 3,
  H: 4,
  I: 1,
  J: 8,
  K: 7,
  L: 2,
  M: 4,
  N: 2,
  O: 1,
  P: 4,
  Q: 10,
  R: 2,
  S: 1,
  T: 1,
  U: 2,
  V: 5,
  W: 5,
  X: 9,
  Y: 4,
  Z: 11,
  BLANK: 0,
};

// Tile distribution (Words With Zaps - 98 tiles total)
export const TILE_DISTRIBUTION: Record<string, number> = {
  A: 10,
  B: 2,
  C: 2,
  D: 3,
  E: 12,
  F: 2,
  G: 2,
  H: 2,
  I: 9,
  J: 1,
  K: 1,
  L: 4,
  M: 2,
  N: 6,
  O: 8,
  P: 2,
  Q: 1,
  R: 5,
  S: 4,
  T: 6,
  U: 5,
  V: 2,
  W: 2,
  X: 1,
  Y: 2,
  Z: 1,
  BLANK: 2,
};

// Board multiplier types
export type MultiplierType = "DL" | "QL" | "DW" | "ZAP" | null;

// Zap bonus positions (+21 per word, only on newly placed tiles)
const ZAP_BONUS: [number, number][] = [
  [0, 0],
  [0, 6],
  [0, 12],
  [6, 0],
  [6, 6],
  [6, 12],
  [12, 0],
  [12, 6],
  [12, 12],
];

// Double Word Score positions
const DOUBLE_WORD: [number, number][] = [
  [2, 2],
  [2, 10],
  [10, 2],
  [10, 10],
  [4, 4],
  [4, 8],
  [8, 4],
  [8, 8],
];

// Quadruple Letter Score positions
const QUAD_LETTER: [number, number][] = [
  [4, 2],
  [8, 2],
  [2, 4],
  [10, 4],
  [2, 8],
  [10, 8],
  [4, 10],
  [8, 10],
];

// Double Letter Score positions
const DOUBLE_LETTER: [number, number][] = [
  [0, 3],
  [0, 9],
  [3, 0],
  [9, 0],
  [3, 12],
  [9, 12],
  [12, 3],
  [12, 9],
  [6, 3],
  [6, 9],
  [3, 6],
  [9, 6],
];

// Build a lookup map for board multipliers
function buildMultiplierMap(): Map<string, MultiplierType> {
  const map = new Map<string, MultiplierType>();

  for (const [x, y] of ZAP_BONUS) {
    map.set(`${x},${y}`, "ZAP");
  }
  for (const [x, y] of DOUBLE_WORD) {
    map.set(`${x},${y}`, "DW");
  }
  for (const [x, y] of QUAD_LETTER) {
    map.set(`${x},${y}`, "QL");
  }
  for (const [x, y] of DOUBLE_LETTER) {
    map.set(`${x},${y}`, "DL");
  }

  // Center zap (required for first move)
  map.set(`${CENTER_POSITION.x},${CENTER_POSITION.y}`, "ZAP");

  return map;
}

export const MULTIPLIER_MAP = buildMultiplierMap();

export function getMultiplier(x: number, y: number): MultiplierType {
  return MULTIPLIER_MAP.get(`${x},${y}`) || null;
}

// Generate a full tile bag
export function createTileBag(): string[] {
  const bag: string[] = [];
  for (const [letter, count] of Object.entries(TILE_DISTRIBUTION)) {
    for (let i = 0; i < count; i++) {
      bag.push(letter);
    }
  }
  return bag;
}

// Fisher-Yates shuffle
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
