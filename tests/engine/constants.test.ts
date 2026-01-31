import { describe, it, expect } from 'vitest';
import {
  BOARD_SIZE,
  RACK_SIZE,
  LETTER_VALUES,
  TILE_DISTRIBUTION,
  getMultiplier,
  createTileBag,
  shuffleArray,
  CENTER_POSITION,
} from '../../src/engine/constants';

describe('constants', () => {
  describe('basic values', () => {
    it('should have correct board size', () => {
      expect(BOARD_SIZE).toBe(15);
    });

    it('should have correct rack size', () => {
      expect(RACK_SIZE).toBe(7);
    });

    it('should have correct center position', () => {
      expect(CENTER_POSITION.x).toBe(7);
      expect(CENTER_POSITION.y).toBe(7);
    });
  });

  describe('LETTER_VALUES', () => {
    it('should have correct values for common letters', () => {
      expect(LETTER_VALUES['A']).toBe(1);
      expect(LETTER_VALUES['E']).toBe(1);
      expect(LETTER_VALUES['Z']).toBe(10);
      expect(LETTER_VALUES['Q']).toBe(10);
      expect(LETTER_VALUES['X']).toBe(8);
    });

    it('should have BLANK worth 0', () => {
      expect(LETTER_VALUES['BLANK']).toBe(0);
    });

    it('should have all 26 letters plus BLANK', () => {
      expect(Object.keys(LETTER_VALUES)).toHaveLength(27);
    });
  });

  describe('TILE_DISTRIBUTION', () => {
    it('should total 100 tiles', () => {
      const total = Object.values(TILE_DISTRIBUTION).reduce((a, b) => a + b, 0);
      expect(total).toBe(100);
    });

    it('should have correct counts for common letters', () => {
      expect(TILE_DISTRIBUTION['E']).toBe(12);
      expect(TILE_DISTRIBUTION['A']).toBe(9);
      expect(TILE_DISTRIBUTION['Q']).toBe(1);
      expect(TILE_DISTRIBUTION['Z']).toBe(1);
    });

    it('should have 2 blank tiles', () => {
      expect(TILE_DISTRIBUTION['BLANK']).toBe(2);
    });
  });

  describe('getMultiplier', () => {
    it('should return TW for corner positions', () => {
      expect(getMultiplier(0, 0)).toBe('TW');
      expect(getMultiplier(0, 14)).toBe('TW');
      expect(getMultiplier(14, 0)).toBe('TW');
      expect(getMultiplier(14, 14)).toBe('TW');
    });

    it('should return TW for edge midpoints', () => {
      expect(getMultiplier(0, 7)).toBe('TW');
      expect(getMultiplier(7, 0)).toBe('TW');
      expect(getMultiplier(14, 7)).toBe('TW');
      expect(getMultiplier(7, 14)).toBe('TW');
    });

    it('should return STAR for center', () => {
      expect(getMultiplier(7, 7)).toBe('STAR');
    });

    it('should return DW for diagonal positions', () => {
      expect(getMultiplier(1, 1)).toBe('DW');
      expect(getMultiplier(2, 2)).toBe('DW');
      expect(getMultiplier(13, 13)).toBe('DW');
    });

    it('should return TL for triple letter positions', () => {
      expect(getMultiplier(1, 5)).toBe('TL');
      expect(getMultiplier(5, 1)).toBe('TL');
      expect(getMultiplier(5, 5)).toBe('TL');
    });

    it('should return DL for double letter positions', () => {
      expect(getMultiplier(0, 3)).toBe('DL');
      expect(getMultiplier(2, 6)).toBe('DL');
      expect(getMultiplier(3, 0)).toBe('DL');
    });

    it('should return null for regular positions', () => {
      expect(getMultiplier(1, 0)).toBeNull();
      expect(getMultiplier(4, 5)).toBeNull();
    });
  });

  describe('createTileBag', () => {
    it('should create bag with 100 tiles', () => {
      const bag = createTileBag();
      expect(bag).toHaveLength(100);
    });

    it('should have correct letter counts', () => {
      const bag = createTileBag();
      const counts: Record<string, number> = {};
      for (const tile of bag) {
        counts[tile] = (counts[tile] || 0) + 1;
      }
      expect(counts['E']).toBe(12);
      expect(counts['A']).toBe(9);
      expect(counts['Z']).toBe(1);
      expect(counts['BLANK']).toBe(2);
    });
  });

  describe('shuffleArray', () => {
    it('should return array of same length', () => {
      const arr = [1, 2, 3, 4, 5];
      const shuffled = shuffleArray(arr);
      expect(shuffled).toHaveLength(arr.length);
    });

    it('should contain all original elements', () => {
      const arr = [1, 2, 3, 4, 5];
      const shuffled = shuffleArray(arr);
      expect(shuffled.sort()).toEqual(arr.sort());
    });

    it('should not modify original array', () => {
      const arr = [1, 2, 3, 4, 5];
      const original = [...arr];
      shuffleArray(arr);
      expect(arr).toEqual(original);
    });

    it('should produce different orderings (probabilistic)', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        results.add(shuffleArray(arr).join(','));
      }
      // With 10 elements and 100 shuffles, we should get many unique orderings
      expect(results.size).toBeGreaterThan(50);
    });
  });
});
