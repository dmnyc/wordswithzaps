import { describe, it, expect, beforeEach } from "vitest";
import {
  isValidPosition,
  getLetterAt,
  isBoardEmpty,
  getMoveDirection,
  areTilesContinuous,
  connectsToExisting,
  extractWord,
  findAllWords,
  calculateWordScore,
  validateMove,
  applyPlacements,
} from "../../src/engine/Board";
import { getDictionary, resetDictionary } from "../../src/engine/Dictionary";
import type { TilePlacement } from "../../src/types/game";

describe("Board", () => {
  beforeEach(() => {
    resetDictionary();
    const dict = getDictionary();
    dict.loadWords([
      "CAT",
      "CATS",
      "DOG",
      "DOGS",
      "AT",
      "AS",
      "DO",
      "GO",
      "TO",
      "IT",
      "IS",
      "HAT",
      "SAT",
      "BAT",
    ]);
  });

  describe("isValidPosition", () => {
    it("should return true for valid positions", () => {
      expect(isValidPosition(0, 0)).toBe(true);
      expect(isValidPosition(7, 7)).toBe(true);
      expect(isValidPosition(14, 14)).toBe(true);
    });

    it("should return false for invalid positions", () => {
      expect(isValidPosition(-1, 0)).toBe(false);
      expect(isValidPosition(0, -1)).toBe(false);
      expect(isValidPosition(15, 0)).toBe(false);
      expect(isValidPosition(0, 15)).toBe(false);
    });
  });

  describe("getLetterAt", () => {
    it("should return letter if present", () => {
      const board = { "7,7": "A", "7,8": "T" };
      expect(getLetterAt(board, 7, 7)).toBe("A");
      expect(getLetterAt(board, 7, 8)).toBe("T");
    });

    it("should return null if empty", () => {
      const board = { "7,7": "A" };
      expect(getLetterAt(board, 0, 0)).toBeNull();
    });
  });

  describe("isBoardEmpty", () => {
    it("should return true for empty board", () => {
      expect(isBoardEmpty({})).toBe(true);
    });

    it("should return false for non-empty board", () => {
      expect(isBoardEmpty({ "7,7": "A" })).toBe(false);
    });
  });

  describe("getMoveDirection", () => {
    it("should return null for empty placements", () => {
      expect(getMoveDirection([])).toBeNull();
    });

    it("should return null for single tile", () => {
      expect(getMoveDirection([{ letter: "A", x: 7, y: 7 }])).toBeNull();
    });

    it("should return horizontal for same row", () => {
      const placements: TilePlacement[] = [
        { letter: "C", x: 7, y: 7 },
        { letter: "A", x: 8, y: 7 },
        { letter: "T", x: 9, y: 7 },
      ];
      expect(getMoveDirection(placements)).toBe("horizontal");
    });

    it("should return vertical for same column", () => {
      const placements: TilePlacement[] = [
        { letter: "C", x: 7, y: 7 },
        { letter: "A", x: 7, y: 8 },
        { letter: "T", x: 7, y: 9 },
      ];
      expect(getMoveDirection(placements)).toBe("vertical");
    });

    it("should return null for diagonal", () => {
      const placements: TilePlacement[] = [
        { letter: "C", x: 7, y: 7 },
        { letter: "A", x: 8, y: 8 },
      ];
      expect(getMoveDirection(placements)).toBeNull();
    });
  });

  describe("areTilesContinuous", () => {
    it("should return true for continuous placements", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "C", x: 7, y: 7 },
        { letter: "A", x: 8, y: 7 },
        { letter: "T", x: 9, y: 7 },
      ];
      expect(areTilesContinuous(board, placements)).toBe(true);
    });

    it("should return true for placements with existing tiles filling gaps", () => {
      const board = { "8,7": "A" };
      const placements: TilePlacement[] = [
        { letter: "C", x: 7, y: 7 },
        { letter: "T", x: 9, y: 7 },
      ];
      expect(areTilesContinuous(board, placements)).toBe(true);
    });

    it("should return false for placements with gaps", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "C", x: 7, y: 7 },
        { letter: "T", x: 9, y: 7 }, // Gap at 8,7
      ];
      expect(areTilesContinuous(board, placements)).toBe(false);
    });
  });

  describe("connectsToExisting", () => {
    it("should return true for first move covering center", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "C", x: 6, y: 7 },
        { letter: "A", x: 7, y: 7 },
        { letter: "T", x: 8, y: 7 },
      ];
      expect(connectsToExisting(board, placements)).toBe(true);
    });

    it("should return false for first move not covering center", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "C", x: 0, y: 0 },
        { letter: "A", x: 1, y: 0 },
        { letter: "T", x: 2, y: 0 },
      ];
      expect(connectsToExisting(board, placements)).toBe(false);
    });

    it("should return true for subsequent move adjacent to existing", () => {
      const board = { "7,7": "C", "8,7": "A", "9,7": "T" };
      const placements: TilePlacement[] = [{ letter: "S", x: 10, y: 7 }];
      expect(connectsToExisting(board, placements)).toBe(true);
    });

    it("should return false for isolated move", () => {
      const board = { "7,7": "C", "8,7": "A", "9,7": "T" };
      const placements: TilePlacement[] = [
        { letter: "D", x: 0, y: 0 },
        { letter: "O", x: 1, y: 0 },
        { letter: "G", x: 2, y: 0 },
      ];
      expect(connectsToExisting(board, placements)).toBe(false);
    });
  });

  describe("extractWord", () => {
    it("should extract horizontal word", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "C", x: 7, y: 7 },
        { letter: "A", x: 8, y: 7 },
        { letter: "T", x: 9, y: 7 },
      ];
      const word = extractWord(board, placements, 7, 7, "horizontal");
      expect(word?.word).toBe("CAT");
      expect(word?.coords).toEqual(["7,7", "8,7", "9,7"]);
    });

    it("should extract vertical word", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "C", x: 7, y: 7 },
        { letter: "A", x: 7, y: 8 },
        { letter: "T", x: 7, y: 9 },
      ];
      const word = extractWord(board, placements, 7, 7, "vertical");
      expect(word?.word).toBe("CAT");
    });

    it("should include existing board tiles", () => {
      const board = { "7,7": "C", "8,7": "A", "9,7": "T" };
      const placements: TilePlacement[] = [{ letter: "S", x: 10, y: 7 }];
      const word = extractWord(board, placements, 10, 7, "horizontal");
      expect(word?.word).toBe("CATS");
    });

    it("should return null for single letter", () => {
      const board = {};
      const placements: TilePlacement[] = [{ letter: "A", x: 7, y: 7 }];
      const word = extractWord(board, placements, 7, 7, "horizontal");
      expect(word).toBeNull();
    });
  });

  describe("findAllWords", () => {
    it("should find main word", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "C", x: 7, y: 7 },
        { letter: "A", x: 8, y: 7 },
        { letter: "T", x: 9, y: 7 },
      ];
      const words = findAllWords(board, placements);
      expect(words.map((w) => w.word)).toContain("CAT");
    });

    it("should find perpendicular words", () => {
      const board = { "7,7": "C", "8,7": "A", "9,7": "T" };
      const placements: TilePlacement[] = [
        { letter: "A", x: 7, y: 8 },
        { letter: "T", x: 7, y: 9 },
      ];
      const words = findAllWords(board, placements);
      const wordStrings = words.map((w) => w.word);
      expect(wordStrings).toContain("CAT"); // vertical from C
    });
  });

  describe("calculateWordScore", () => {
    it("should calculate basic word score", () => {
      const board = {};
      // Using row 4 positions 1,2,3 which have no multipliers
      const placements: TilePlacement[] = [
        { letter: "C", x: 1, y: 4 },
        { letter: "A", x: 2, y: 4 },
        { letter: "T", x: 3, y: 4 },
      ];
      // C=3, A=1, T=1 = 5, no multipliers on these positions
      const score = calculateWordScore(board, placements, [
        "1,4",
        "2,4",
        "3,4",
      ]);
      expect(score).toBe(5);
    });

    it("should apply double letter score", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "C", x: 0, y: 3 }, // DL position
        { letter: "A", x: 1, y: 3 },
        { letter: "T", x: 2, y: 3 },
      ];
      // C=3*2=6, A=1, T=1 = 8
      const score = calculateWordScore(board, placements, [
        "0,3",
        "1,3",
        "2,3",
      ]);
      expect(score).toBe(8);
    });

    it("should apply triple word score", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "C", x: 0, y: 0 }, // TW position
        { letter: "A", x: 1, y: 0 },
        { letter: "T", x: 2, y: 0 },
      ];
      // C=3, A=1, T=1 = 5 * 3 = 15
      const score = calculateWordScore(board, placements, [
        "0,0",
        "1,0",
        "2,0",
      ]);
      expect(score).toBe(15);
    });

    it("should apply center star as double word on first move", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "C", x: 6, y: 7 },
        { letter: "A", x: 7, y: 7 }, // STAR/center
        { letter: "T", x: 8, y: 7 },
      ];
      // C=3, A=1, T=1 = 5 * 2 = 10
      const score = calculateWordScore(board, placements, [
        "6,7",
        "7,7",
        "8,7",
      ]);
      expect(score).toBe(10);
    });
  });

  describe("validateMove", () => {
    it("should reject empty move", () => {
      const result = validateMove({}, []);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("No tiles placed");
    });

    it("should reject move on occupied position", () => {
      const board = { "7,7": "A" };
      const placements: TilePlacement[] = [{ letter: "B", x: 7, y: 7 }];
      const result = validateMove(board, placements);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("already occupied");
    });

    it("should reject diagonal placement", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "C", x: 7, y: 7 },
        { letter: "A", x: 8, y: 8 },
      ];
      const result = validateMove(board, placements);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("straight line");
    });

    it("should reject first move not covering center", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "C", x: 0, y: 0 },
        { letter: "A", x: 1, y: 0 },
        { letter: "T", x: 2, y: 0 },
      ];
      const result = validateMove(board, placements);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("center");
    });

    it("should accept valid first move", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "C", x: 6, y: 7 },
        { letter: "A", x: 7, y: 7 },
        { letter: "T", x: 8, y: 7 },
      ];
      const result = validateMove(board, placements);
      expect(result.valid).toBe(true);
      expect(result.words).toContain("CAT");
      expect(result.score).toBeDefined();
    });

    it("should reject invalid words", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "X", x: 6, y: 7 },
        { letter: "Y", x: 7, y: 7 },
        { letter: "Z", x: 8, y: 7 },
      ];
      const result = validateMove(board, placements);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid word");
    });
  });

  describe("applyPlacements", () => {
    it("should add tiles to board", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "C", x: 7, y: 7 },
        { letter: "A", x: 8, y: 7 },
        { letter: "T", x: 9, y: 7 },
      ];
      const newBoard = applyPlacements(board, placements);
      expect(newBoard["7,7"]).toBe("C");
      expect(newBoard["8,7"]).toBe("A");
      expect(newBoard["9,7"]).toBe("T");
    });

    it("should not modify original board", () => {
      const board: Record<string, string> = { "0,0": "X" };
      const placements: TilePlacement[] = [{ letter: "A", x: 1, y: 0 }];
      const newBoard = applyPlacements(board, placements);
      expect(newBoard["1,0"]).toBe("A");
      expect(board["1,0"]).toBeUndefined();
    });

    it("should handle blank tiles", () => {
      const board = {};
      const placements: TilePlacement[] = [
        { letter: "A", x: 7, y: 7, isBlank: true },
      ];
      const newBoard = applyPlacements(board, placements);
      expect(newBoard["7,7"]).toBe("BLANK");
    });
  });
});
