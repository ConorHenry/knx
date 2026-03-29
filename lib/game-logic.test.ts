import { describe, it, expect } from 'vitest';
import {
  checkGuess,
  shuffleItems,
  isGameWon,
  isGameLost,
  validateNoDuplicateItems,
  validatePuzzleComplete,
} from './game-logic';
import type { Puzzle } from './types';

const SAMPLE_PUZZLE: Puzzle = {
  categories: [
    { color: 'yellow', name: 'Shades of Blue', items: ['Azure', 'Cobalt', 'Navy', 'Teal'] },
    { color: 'green', name: 'Types of Fish', items: ['Bass', 'Trout', 'Perch', 'Pike'] },
    { color: 'blue', name: 'Dog Breeds', items: ['Poodle', 'Boxer', 'Hound', 'Lab'] },
    { color: 'purple', name: 'Famous Johns', items: ['Lennon', 'Adams', 'Muir', 'Wayne'] },
  ],
};

describe('checkGuess', () => {
  it('returns correct when all 4 items match a category', () => {
    const result = checkGuess(['Azure', 'Cobalt', 'Navy', 'Teal'], SAMPLE_PUZZLE, []);
    expect(result.result).toBe('correct');
    if (result.result === 'correct') {
      expect(result.category.color).toBe('yellow');
      expect(result.category.name).toBe('Shades of Blue');
    }
  });

  it('returns one-away when 3 of 4 items match a category', () => {
    const result = checkGuess(['Azure', 'Cobalt', 'Navy', 'Bass'], SAMPLE_PUZZLE, []);
    expect(result.result).toBe('one-away');
  });

  it('returns wrong when fewer than 3 items match any category', () => {
    const result = checkGuess(['Azure', 'Bass', 'Poodle', 'Lennon'], SAMPLE_PUZZLE, []);
    expect(result.result).toBe('wrong');
  });

  it('skips already-solved categories', () => {
    // Yellow is already solved, so guessing its items returns wrong
    const result = checkGuess(['Azure', 'Cobalt', 'Navy', 'Teal'], SAMPLE_PUZZLE, ['yellow']);
    expect(result.result).toBe('wrong');
  });

  it('correctly identifies different categories', () => {
    const result = checkGuess(['Bass', 'Trout', 'Perch', 'Pike'], SAMPLE_PUZZLE, []);
    expect(result.result).toBe('correct');
    if (result.result === 'correct') {
      expect(result.category.color).toBe('green');
    }
  });
});

describe('shuffleItems', () => {
  it('returns all 16 items', () => {
    const shuffled = shuffleItems(SAMPLE_PUZZLE);
    expect(shuffled).toHaveLength(16);
  });

  it('contains all the original items', () => {
    const shuffled = shuffleItems(SAMPLE_PUZZLE);
    const allItems = SAMPLE_PUZZLE.categories.flatMap((c) => c.items);
    expect(shuffled.sort()).toEqual(allItems.sort());
  });

  it('returns items in a different order at least sometimes (probabilistic)', () => {
    const original = SAMPLE_PUZZLE.categories.flatMap((c) => c.items);
    // Run 5 shuffles; the probability all are in order is (1/16!)^5 ≈ 0
    const allSame = Array.from({ length: 5 }, () => shuffleItems(SAMPLE_PUZZLE)).every(
      (s) => s.join() === original.join()
    );
    expect(allSame).toBe(false);
  });
});

describe('isGameWon', () => {
  it('returns false when no categories solved', () => {
    expect(isGameWon([])).toBe(false);
  });

  it('returns false when some categories solved', () => {
    expect(isGameWon(['yellow', 'green'])).toBe(false);
  });

  it('returns true when all 4 categories solved', () => {
    expect(isGameWon(['yellow', 'green', 'blue', 'purple'])).toBe(true);
  });

  it('returns true regardless of order', () => {
    expect(isGameWon(['purple', 'blue', 'yellow', 'green'])).toBe(true);
  });
});

describe('isGameLost', () => {
  it('returns false when mistakes remain', () => {
    expect(isGameLost(4)).toBe(false);
    expect(isGameLost(1)).toBe(false);
  });

  it('returns true when 0 mistakes remain', () => {
    expect(isGameLost(0)).toBe(true);
  });
});

describe('validateNoDuplicateItems', () => {
  it('returns null for a valid puzzle', () => {
    expect(validateNoDuplicateItems(SAMPLE_PUZZLE)).toBeNull();
  });

  it('returns error message when a duplicate item exists', () => {
    const puzzle: Puzzle = {
      categories: [
        { color: 'yellow', name: 'A', items: ['X', 'B', 'C', 'D'] },
        { color: 'green', name: 'B', items: ['X', 'F', 'G', 'H'] }, // X is duplicate
        { color: 'blue', name: 'C', items: ['I', 'J', 'K', 'L'] },
        { color: 'purple', name: 'D', items: ['M', 'N', 'O', 'P'] },
      ],
    };
    expect(validateNoDuplicateItems(puzzle)).toContain('x');
  });
});

describe('validatePuzzleComplete', () => {
  it('returns null for a complete puzzle', () => {
    expect(validatePuzzleComplete(SAMPLE_PUZZLE)).toBeNull();
  });

  it('returns error when a category name is empty', () => {
    const puzzle: Puzzle = {
      ...SAMPLE_PUZZLE,
      categories: [
        { ...SAMPLE_PUZZLE.categories[0], name: '' },
        SAMPLE_PUZZLE.categories[1],
        SAMPLE_PUZZLE.categories[2],
        SAMPLE_PUZZLE.categories[3],
      ],
    };
    expect(validatePuzzleComplete(puzzle)).toMatch(/category names/i);
  });

  it('returns error when an item is empty', () => {
    const puzzle: Puzzle = {
      ...SAMPLE_PUZZLE,
      categories: [
        { ...SAMPLE_PUZZLE.categories[0], items: ['Azure', '', 'Navy', 'Teal'] },
        SAMPLE_PUZZLE.categories[1],
        SAMPLE_PUZZLE.categories[2],
        SAMPLE_PUZZLE.categories[3],
      ],
    };
    expect(validatePuzzleComplete(puzzle)).toMatch(/16 items/i);
  });
});
