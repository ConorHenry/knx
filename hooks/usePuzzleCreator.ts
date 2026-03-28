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

type AiLoading =
  | { categoryId: string; type: 'items' | 'name' }
  | null;

type CreatorState = {
  categories: [CategoryDraft, CategoryDraft, CategoryDraft, CategoryDraft];
  aiLoading: AiLoading;
  aiError: string | null;
};

type Action =
  | { type: 'SET_NAME'; categoryId: string; name: string }
  | { type: 'SET_ITEM'; categoryId: string; index: number; value: string }
  | { type: 'SET_COLOR'; categoryId: string; color: Difficulty }
  | { type: 'SET_AI_LOADING'; loading: AiLoading }
  | { type: 'SET_AI_ERROR'; error: string | null }
  | { type: 'APPLY_SUGGESTED_ITEMS'; categoryId: string; suggestions: string[] }
  | { type: 'APPLY_SUGGESTED_NAME'; categoryId: string; name: string };

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

    case 'SET_AI_LOADING':
      return { ...state, aiLoading: action.loading, aiError: null };

    case 'SET_AI_ERROR':
      return { ...state, aiError: action.error, aiLoading: null };

    case 'APPLY_SUGGESTED_ITEMS': {
      return {
        ...state,
        aiLoading: null,
        aiError: null,
        categories: state.categories.map((cat) => {
          if (cat.id !== action.categoryId) return cat;
          const items = [...cat.items] as [string, string, string, string];
          let suggestionIdx = 0;
          for (let i = 0; i < 4 && suggestionIdx < action.suggestions.length; i++) {
            if (!items[i].trim()) {
              items[i] = action.suggestions[suggestionIdx++];
            }
          }
          return { ...cat, items };
        }) as CreatorState['categories'],
      };
    }

    case 'APPLY_SUGGESTED_NAME':
      return {
        ...state,
        aiLoading: null,
        aiError: null,
        categories: state.categories.map((cat) =>
          cat.id === action.categoryId ? { ...cat, name: action.name } : cat
        ) as CreatorState['categories'],
      };

    default:
      return state;
  }
}

export function usePuzzleCreator() {
  const [state, dispatch] = useReducer(reducer, {
    categories: makeInitialCategories(),
    aiLoading: null,
    aiError: null,
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

  // True when every name and every item is non-empty.
  const isComplete = useMemo(
    () =>
      state.categories.every(
        (cat) => cat.name.trim() && cat.items.every((item) => item.trim())
      ),
    [state.categories]
  );

  // Set of lowercase-trimmed item values that appear more than once.
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

  async function suggestItems(categoryId: string, categoryName: string, existingItems: string[]) {
    dispatch({ type: 'SET_AI_LOADING', loading: { categoryId, type: 'items' } });
    try {
      const res = await fetch('/api/ai/suggest-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryName, existingItems }),
      });
      if (!res.ok) throw new Error('Suggestions unavailable');
      const data = await res.json();
      dispatch({ type: 'APPLY_SUGGESTED_ITEMS', categoryId, suggestions: data.suggestions });
    } catch {
      dispatch({ type: 'SET_AI_ERROR', error: 'Suggestions unavailable. Try again.' });
    }
  }

  async function suggestName(categoryId: string, items: [string, string, string, string]) {
    dispatch({ type: 'SET_AI_LOADING', loading: { categoryId, type: 'name' } });
    try {
      const res = await fetch('/api/ai/suggest-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error('Suggestions unavailable');
      const data = await res.json();
      dispatch({ type: 'SET_AI_LOADING', loading: null });
      return data.suggestions as string[];
    } catch {
      dispatch({ type: 'SET_AI_ERROR', error: 'Suggestions unavailable. Try again.' });
      return [];
    }
  }

  function applyNameSuggestion(categoryId: string, name: string) {
    dispatch({ type: 'APPLY_SUGGESTED_NAME', categoryId, name });
  }

  return {
    categories: state.categories,
    aiLoading: state.aiLoading,
    aiError: state.aiError,
    isComplete,
    duplicateItems,
    shareUrl,
    setName,
    setItem,
    setColor,
    suggestItems,
    suggestName,
    applyNameSuggestion,
  };
}
