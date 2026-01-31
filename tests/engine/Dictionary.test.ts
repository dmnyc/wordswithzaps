import { describe, it, expect, beforeEach } from 'vitest';
import { Dictionary, getDictionary, resetDictionary } from '../../src/engine/Dictionary';

describe('Dictionary', () => {
  let dict: Dictionary;

  beforeEach(() => {
    dict = new Dictionary();
  });

  describe('loadWords', () => {
    it('should load words into the trie', () => {
      dict.loadWords(['CAT', 'DOG', 'CATS']);
      expect(dict.isLoaded()).toBe(true);
      expect(dict.getWordCount()).toBe(3);
    });

    it('should handle mixed case input', () => {
      dict.loadWords(['cat', 'Dog', 'BIRD']);
      expect(dict.isValidWord('CAT')).toBe(true);
      expect(dict.isValidWord('dog')).toBe(true);
      expect(dict.isValidWord('Bird')).toBe(true);
    });
  });

  describe('loadFromText', () => {
    it('should load from newline-separated text', () => {
      dict.loadFromText('CAT\nDOG\nBIRD\n');
      expect(dict.getWordCount()).toBe(3);
    });

    it('should handle empty lines', () => {
      dict.loadFromText('CAT\n\nDOG\n\n');
      expect(dict.getWordCount()).toBe(2);
    });
  });

  describe('isValidWord', () => {
    beforeEach(() => {
      dict.loadWords(['CAT', 'CATS', 'DOG', 'DOGS', 'QUIZ', 'QUIZZES']);
    });

    it('should return true for valid words', () => {
      expect(dict.isValidWord('CAT')).toBe(true);
      expect(dict.isValidWord('CATS')).toBe(true);
      expect(dict.isValidWord('QUIZ')).toBe(true);
    });

    it('should return false for invalid words', () => {
      expect(dict.isValidWord('XYZ')).toBe(false);
      expect(dict.isValidWord('CATZ')).toBe(false);
    });

    it('should return false for single letters', () => {
      dict.loadWords(['A', 'I']);
      expect(dict.isValidWord('A')).toBe(false);
      expect(dict.isValidWord('I')).toBe(false);
    });

    it('should return false for prefixes that are not words', () => {
      expect(dict.isValidWord('CA')).toBe(false);
      expect(dict.isValidWord('QUI')).toBe(false);
    });

    it('should throw if dictionary not loaded', () => {
      const unloadedDict = new Dictionary();
      expect(() => unloadedDict.isValidWord('CAT')).toThrow('Dictionary not loaded');
    });
  });

  describe('hasPrefix', () => {
    beforeEach(() => {
      dict.loadWords(['CAT', 'CATS', 'CATALOG', 'DOG']);
    });

    it('should return true for valid prefixes', () => {
      expect(dict.hasPrefix('C')).toBe(true);
      expect(dict.hasPrefix('CA')).toBe(true);
      expect(dict.hasPrefix('CAT')).toBe(true);
      expect(dict.hasPrefix('CATA')).toBe(true);
    });

    it('should return false for invalid prefixes', () => {
      expect(dict.hasPrefix('X')).toBe(false);
      expect(dict.hasPrefix('CX')).toBe(false);
    });
  });

  describe('getWordsWithPrefix', () => {
    beforeEach(() => {
      dict.loadWords(['CAT', 'CATS', 'CATALOG', 'DOG', 'DOGS']);
    });

    it('should return words matching prefix', () => {
      const words = dict.getWordsWithPrefix('CAT');
      expect(words).toContain('CAT');
      expect(words).toContain('CATS');
      expect(words).toContain('CATALOG');
      expect(words).not.toContain('DOG');
    });

    it('should respect limit', () => {
      const words = dict.getWordsWithPrefix('', 2);
      expect(words.length).toBeLessThanOrEqual(2);
    });

    it('should return empty for non-matching prefix', () => {
      const words = dict.getWordsWithPrefix('XYZ');
      expect(words).toHaveLength(0);
    });
  });

  describe('singleton', () => {
    beforeEach(() => {
      resetDictionary();
    });

    it('should return the same instance', () => {
      const d1 = getDictionary();
      const d2 = getDictionary();
      expect(d1).toBe(d2);
    });

    it('should reset instance when reset called', () => {
      const d1 = getDictionary();
      d1.loadWords(['TEST']);
      resetDictionary();
      const d2 = getDictionary();
      expect(d2.isLoaded()).toBe(false);
    });
  });
});
