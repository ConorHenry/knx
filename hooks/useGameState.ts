'use client';

import { useReducer, useCallback, useEffect } from 'react';
import type { Category, Difficulty, Puzzle } from '@/lib/types';
import { checkGuess, isGameWon, isGameLost } from '@/lib/game-logic';
import { DIFFICULTY_ORDER } from '@/lib/types';

export type GuessRecord = {
  items: string[];
  result: 'correct' | 'one-away' | 'wrong';
  category?: Category;
};

export type GameStatus = 'playing' | 'won' | 'lost';

type GameState = {
  puzzle: Puzzle;
  /** Items currently shown in the grid (excludes already-solved items). */
  grid: string[];
  selected: Set<string>;
  solvedColors: Difficulty[];
  guesses: GuessRecord[];
  mistakesRemaining: number;
  status: GameStatus;
  lastGuessResult: GuessRecord | null;
  shakeItems: string[];
  /**
   * Items currently playing the float-up animation.
   * They remain in `grid` until COMPLETE_SOLVE removes them.
   */
  solvingItems: string[];
  /** The category being solved — moved to solvedColors by COMPLETE_SOLVE. */
  solvingCategory: Category | null;
  /** True when exactly one unsolved category remains; triggers AUTO_SOLVE_LAST. */
  pendingAutoSolve: boolean;
};

type Action =
  | { type: 'TOGGLE_ITEM'; item: string }
  | { type: 'SUBMIT_GUESS' }
  | { type: 'COMPLETE_SOLVE' }
  | { type: 'AUTO_SOLVE_LAST' }
  | { type: 'SHUFFLE' }
  | { type: 'CLEAR_LAST_RESULT' }
  | { type: 'RESET' };

const MAX_MISTAKES = 4;

// Initial grid is ordered deterministically; SHUFFLE is dispatched client-side
// after mount to avoid server/client hydration mismatch.
function makeInitialState(puzzle: Puzzle): GameState {
  return {
    puzzle,
    grid: puzzle.categories.flatMap((cat) => cat.items),
    selected: new Set(),
    solvedColors: [],
    guesses: [],
    mistakesRemaining: MAX_MISTAKES,
    status: 'playing',
    lastGuessResult: null,
    shakeItems: [],
    solvingItems: [],
    solvingCategory: null,
    pendingAutoSolve: false,
  };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'TOGGLE_ITEM': {
      if (state.status !== 'playing' || state.solvingItems.length > 0) return state;
      const next = new Set(state.selected);
      if (next.has(action.item)) {
        next.delete(action.item);
      } else if (next.size < 4) {
        next.add(action.item);
      }
      return { ...state, selected: next };
    }

    case 'SUBMIT_GUESS': {
      if (
        state.selected.size !== 4 ||
        state.status !== 'playing' ||
        state.solvingItems.length > 0
      ) return state;

      const selected = Array.from(state.selected);
      const guessResult = checkGuess(selected, state.puzzle, state.solvedColors);
      const record: GuessRecord = {
        items: selected,
        result: guessResult.result,
        category: guessResult.result === 'correct' ? guessResult.category : undefined,
      };

      if (guessResult.result === 'correct') {
        // Don't update solvedColors yet — leave tiles in the grid so they can
        // play their float-up animation. COMPLETE_SOLVE finalises the solve.
        return {
          ...state,
          selected: new Set(),
          solvingItems: selected,
          solvingCategory: guessResult.category,
          guesses: [...state.guesses, record],
          lastGuessResult: record,
          shakeItems: [],
        };
      }

      const newMistakes = state.mistakesRemaining - 1;
      const lost = isGameLost(newMistakes);
      return {
        ...state,
        selected: new Set(),
        mistakesRemaining: newMistakes,
        guesses: [...state.guesses, record],
        status: lost ? 'lost' : 'playing',
        lastGuessResult: record,
        shakeItems: lost ? [] : selected,
      };
    }

    case 'COMPLETE_SOLVE': {
      if (!state.solvingCategory) return state;

      const newSolvedColors = [...state.solvedColors, state.solvingCategory.color];
      const newGrid = state.grid.filter((item) => !state.solvingItems.includes(item));
      const won = isGameWon(newSolvedColors);

      // After 3 solved (1 remaining), flag for the auto-solve effect.
      const oneLast =
        !won &&
        DIFFICULTY_ORDER.filter((c) => !newSolvedColors.includes(c)).length === 1;

      return {
        ...state,
        grid: newGrid,
        solvedColors: newSolvedColors,
        solvingItems: [],
        solvingCategory: null,
        status: won ? 'won' : 'playing',
        pendingAutoSolve: oneLast,
      };
    }

    case 'AUTO_SOLVE_LAST': {
      if (!state.pendingAutoSolve || state.status !== 'playing') return state;

      const remaining = state.puzzle.categories.find(
        (cat) => !state.solvedColors.includes(cat.color)
      );
      if (!remaining) return state;

      const record: GuessRecord = {
        items: [...remaining.items],
        result: 'correct',
        category: remaining,
      };

      // Start the float animation on the last 4 tiles; COMPLETE_SOLVE follows.
      return {
        ...state,
        selected: new Set(),
        solvingItems: [...remaining.items],
        solvingCategory: remaining,
        guesses: [...state.guesses, record],
        lastGuessResult: record,
        pendingAutoSolve: false,
      };
    }

    case 'SHUFFLE': {
      if (state.status !== 'playing' || state.solvingItems.length > 0) return state;
      const shuffled = [...state.grid];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return { ...state, grid: shuffled };
    }

    case 'CLEAR_LAST_RESULT':
      return { ...state, lastGuessResult: null, shakeItems: [] };

    case 'RESET':
      return makeInitialState(state.puzzle);

    default:
      return state;
  }
}

// ── Timing constants ──────────────────────────────────────────────────────────
// Keep in sync with the CSS animation durations in globals.css.
/** Tiles reach their top-row targets at ~360 ms; fire just before so the
 *  category row begins forming as the tiles arrive. */
const COMPLETE_SOLVE_DELAY_MS = 320;
/** Pause between the 3rd category reveal and the last auto-solve. */
const AUTO_SOLVE_DELAY_MS = 380;

export function useGameState(puzzle: Puzzle) {
  const [state, dispatch] = useReducer(reducer, puzzle, makeInitialState);

  // Shuffle client-side only to avoid server/client hydration mismatch.
  useEffect(() => {
    dispatch({ type: 'SHUFFLE' });
  }, []);

  // When tiles are solving, wait for the float animation then commit the solve.
  useEffect(() => {
    if (state.solvingItems.length === 0) return;
    const timer = setTimeout(
      () => dispatch({ type: 'COMPLETE_SOLVE' }),
      COMPLETE_SOLVE_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [state.solvingItems]);

  // When only one category remains, auto-solve it after a brief pause so the
  // 3rd and 4th category reveals animate sequentially.
  useEffect(() => {
    if (!state.pendingAutoSolve) return;
    const timer = setTimeout(
      () => dispatch({ type: 'AUTO_SOLVE_LAST' }),
      AUTO_SOLVE_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [state.pendingAutoSolve]);

  const toggleItem = useCallback((item: string) => {
    dispatch({ type: 'TOGGLE_ITEM', item });
  }, []);

  const submitGuess = useCallback(() => {
    dispatch({ type: 'SUBMIT_GUESS' });
    setTimeout(() => dispatch({ type: 'CLEAR_LAST_RESULT' }), 800);
  }, []);

  const shuffle = useCallback(() => {
    dispatch({ type: 'SHUFFLE' });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
    setTimeout(() => dispatch({ type: 'SHUFFLE' }), 0);
  }, []);

  return {
    grid: state.grid,
    selected: state.selected,
    solvedColors: state.solvedColors,
    guesses: state.guesses,
    mistakesRemaining: state.mistakesRemaining,
    status: state.status,
    lastGuessResult: state.lastGuessResult,
    shakeItems: state.shakeItems,
    solvingItems: state.solvingItems,
    puzzle: state.puzzle,
    toggleItem,
    submitGuess,
    shuffle,
    reset,
  };
}
