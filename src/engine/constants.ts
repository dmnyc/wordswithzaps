export const BOARD_SIZE = 15;
export const RACK_SIZE = 7;
export const BINGO_BONUS = 50;
export const CENTER_POSITION = { x: 7, y: 7 };

// Letter point values (standard Scrabble)
export const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4,
  I: 1, J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3,
  Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8,
  Y: 4, Z: 10, BLANK: 0,
};

// Tile distribution (standard Scrabble - 100 tiles total)
export const TILE_DISTRIBUTION: Record<string, number> = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2,
  I: 9, J: 1, K: 1, L: 4, M: 2, N: 6, O: 8, P: 2,
  Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1,
  Y: 2, Z: 1, BLANK: 2,
};

// Board multiplier types
export type MultiplierType = 'DL' | 'TL' | 'DW' | 'TW' | 'STAR' | null;

// Triple Word Score positions
const TRIPLE_WORD: [number, number][] = [
  [0, 0], [0, 7], [0, 14],
  [7, 0], [7, 14],
  [14, 0], [14, 7], [14, 14],
];

// Double Word Score positions
const DOUBLE_WORD: [number, number][] = [
  [1, 1], [1, 13],
  [2, 2], [2, 12],
  [3, 3], [3, 11],
  [4, 4], [4, 10],
  [10, 4], [10, 10],
  [11, 3], [11, 11],
  [12, 2], [12, 12],
  [13, 1], [13, 13],
];

// Triple Letter Score positions
const TRIPLE_LETTER: [number, number][] = [
  [1, 5], [1, 9],
  [5, 1], [5, 5], [5, 9], [5, 13],
  [9, 1], [9, 5], [9, 9], [9, 13],
  [13, 5], [13, 9],
];

// Double Letter Score positions
const DOUBLE_LETTER: [number, number][] = [
  [0, 3], [0, 11],
  [2, 6], [2, 8],
  [3, 0], [3, 7], [3, 14],
  [6, 2], [6, 6], [6, 8], [6, 12],
  [7, 3], [7, 11],
  [8, 2], [8, 6], [8, 8], [8, 12],
  [11, 0], [11, 7], [11, 14],
  [12, 6], [12, 8],
  [14, 3], [14, 11],
];

// Build a lookup map for board multipliers
function buildMultiplierMap(): Map<string, MultiplierType> {
  const map = new Map<string, MultiplierType>();

  for (const [x, y] of TRIPLE_WORD) {
    map.set(`${x},${y}`, 'TW');
  }
  for (const [x, y] of DOUBLE_WORD) {
    map.set(`${x},${y}`, 'DW');
  }
  for (const [x, y] of TRIPLE_LETTER) {
    map.set(`${x},${y}`, 'TL');
  }
  for (const [x, y] of DOUBLE_LETTER) {
    map.set(`${x},${y}`, 'DL');
  }

  // Center star (counts as double word on first move)
  map.set(`${CENTER_POSITION.x},${CENTER_POSITION.y}`, 'STAR');

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
