import type { Category, Difficulty, Puzzle } from './types';
import { DIFFICULTY_ORDER } from './types';

export type GuessResult =
  | { result: 'correct'; category: Category }
  | { result: 'one-away' }
  | { result: 'wrong' };

/**
 * Checks a guess of exactly 4 items against the puzzle.
 * Returns correct (with the matched category), one-away, or wrong.
 */
export function checkGuess(
  selected: string[],
  puzzle: Puzzle,
  solvedColors: Difficulty[]
): GuessResult {
  const selectedSet = new Set(selected);

  for (const category of puzzle.categories) {
    if (solvedColors.includes(category.color)) continue;

    const matches = category.items.filter((item) => selectedSet.has(item)).length;

    if (matches === 4) {
      return { result: 'correct', category };
    }
    if (matches === 3) {
      return { result: 'one-away' };
    }
  }

  return { result: 'wrong' };
}

/**
 * Fisher-Yates shuffle of all items in a puzzle (flattened across categories).
 * Returns a shuffled 1D array of item strings.
 */
export function shuffleItems(puzzle: Puzzle): string[] {
  const items = puzzle.categories.flatMap((cat) => cat.items);
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function isGameWon(solvedColors: Difficulty[]): boolean {
  return DIFFICULTY_ORDER.every((color) => solvedColors.includes(color));
}

export function isGameLost(mistakesRemaining: number): boolean {
  return mistakesRemaining <= 0;
}

/**
 * Validates that a puzzle has no duplicate items across all categories.
 */
export function validateNoDuplicateItems(puzzle: Puzzle): string | null {
  const allItems = puzzle.categories.flatMap((cat) => cat.items.map((i) => i.trim().toLowerCase()));
  const seen = new Set<string>();
  for (const item of allItems) {
    if (seen.has(item)) return `Duplicate item: "${item}"`;
    seen.add(item);
  }
  return null;
}

/**
 * Validates that all fields in the puzzle are non-empty.
 */
export function validatePuzzleComplete(puzzle: Puzzle): string | null {
  for (const category of puzzle.categories) {
    if (!category.name.trim()) return 'All category names must be filled in.';
    for (const item of category.items) {
      if (!item.trim()) return 'All 16 items must be filled in.';
    }
  }
  return null;
}
