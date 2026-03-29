'use client';

import { useReducer, useMemo } from 'react';
import { type Difficulty, type Puzzle, DIFFICULTY_ORDER } from '@/lib/types';
import { encodePuzzle } from '@/lib/encoding';

export type CategoryDraft = {
  id: string;
  color: Difficulty;
  name: string;
  items: [string, string, string, string];
};

type CreatorState = {
  categories: [CategoryDraft, CategoryDraft, CategoryDraft, CategoryDraft];
};

type Action =
  | { type: 'SET_NAME'; categoryId: string; name: string }
  | { type: 'SET_ITEM'; categoryId: string; index: number; value: string }
  | { type: 'SET_COLOR'; categoryId: string; color: Difficulty };

function makeInitialCategories(): [CategoryDraft, CategoryDraft, CategoryDraft, CategoryDraft] {
  return DIFFICULTY_ORDER.map((color, i) => ({
    id: `cat-${i}`,
    color,
    name: '',
    items: ['', '', '', ''] as [string, string, string, string],
  })) as [CategoryDraft, CategoryDraft, CategoryDraft, CategoryDraft];
}

function reducer(state: CreatorState, action: Action): CreatorState {
  switch (action.type) {
    case 'SET_NAME':
      return {
        ...state,
        categories: state.categories.map((cat) =>
          cat.id === action.categoryId ? { ...cat, name: action.name } : cat
        ) as CreatorState['categories'],
      };

    case 'SET_ITEM':
      return {
        ...state,
        categories: state.categories.map((cat) => {
          if (cat.id !== action.categoryId) return cat;
          const items = [...cat.items] as [string, string, string, string];
          items[action.index] = action.value;
          return { ...cat, items };
        }) as CreatorState['categories'],
      };

    case 'SET_COLOR':
      return {
        ...state,
        categories: state.categories.map((cat) =>
          cat.id === action.categoryId ? { ...cat, color: action.color } : cat
        ) as CreatorState['categories'],
      };

    default:
      return state;
  }
}

export function usePuzzleCreator() {
  const [state, dispatch] = useReducer(reducer, {
    categories: makeInitialCategories(),
  });

  const puzzle: Puzzle = useMemo(
    () => ({
      categories: state.categories.map((cat) => ({
        name: cat.name,
        color: cat.color,
        items: cat.items,
      })) as Puzzle['categories'],
    }),
    [state.categories]
  );

  const isComplete = useMemo(
    () =>
      state.categories.every(
        (cat) => cat.name.trim() && cat.items.every((item) => item.trim())
      ),
    [state.categories]
  );

  const duplicateItems = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const cat of state.categories) {
      for (const item of cat.items) {
        const key = item.trim().toLowerCase();
        if (!key) continue;
        if (seen.has(key)) dupes.add(key);
        else seen.add(key);
      }
    }
    return dupes;
  }, [state.categories]);

  const shareUrl = useMemo(() => {
    if (!isComplete || duplicateItems.size > 0) return null;
    try {
      const encoded = encodePuzzle(puzzle);
      return `${typeof window !== 'undefined' ? window.location.origin : ''}/play?p=${encoded}`;
    } catch {
      return null;
    }
  }, [puzzle, isComplete, duplicateItems.size]);

  function setName(categoryId: string, name: string) {
    dispatch({ type: 'SET_NAME', categoryId, name });
  }

  function setItem(categoryId: string, index: number, value: string) {
    dispatch({ type: 'SET_ITEM', categoryId, index, value });
  }

  function setColor(categoryId: string, color: Difficulty) {
    dispatch({ type: 'SET_COLOR', categoryId, color });
  }

  return {
    categories: state.categories,
    isComplete,
    duplicateItems,
    shareUrl,
    setName,
    setItem,
    setColor,
  };
}
