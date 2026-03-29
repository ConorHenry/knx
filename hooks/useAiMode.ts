'use client';

import { useReducer, useMemo, useCallback, useRef } from 'react';
import { type CategoryDraft } from './usePuzzleCreator';
import {
  type FieldId,
  type AiFieldInfo,
  type SuggestResult,
  serializeFieldId,
  deserializeFieldId,
} from '@/lib/ai-mode-types';
import { detectScenario } from '@/lib/ai-scenario';

// ── Suggestion pools ──────────────────────────────────────────────────────────
// Stores overfetched suggestions so repeat requests don't hit the API.
// Pools are keyed by a string derived from promptType + context field IDs.
// They live in a ref (not state) — pool updates never need to trigger a re-render.
//
// Key format:
//   Single-cat (P1–P4, P6, P6v): "{promptType}|{sortedContextFieldIds}"
//   P5 (multi-cat):               "P5|{sortedContextFieldIds}|{sortedTargetCatIds}"

type SingleCatPool = {
  kind: 'single';
  extras: string[];   // remaining pre-fetched values, popped on repeat requests
  seen: string[];     // all values ever returned for this key (passed to API as exclude)
};

type MultiCatPool = {
  kind: 'multi';
  extrasByCat: Record<string, string[]>; // catId → remaining pre-fetched values
  seen: string[];
};

type SuggestionPool = SingleCatPool | MultiCatPool;

function buildPoolKey(
  promptType: string,
  contexts: string[],
  targetCatIds: string[] = [],
): string {
  const ctxPart = [...contexts].sort().join(',');
  if (promptType === 'P5') {
    const catPart = [...targetCatIds].sort().join(',');
    return `P5|${ctxPart}|${catPart}`;
  }
  return `${promptType}|${ctxPart}`;
}

// Returns true if this pool has enough extras to cover the current targets
// without an API call.
function poolCanServe(
  pool: SuggestionPool,
  targets: string[],
  targetsByCat: Map<string, string[]>,
): boolean {
  if (pool.kind === 'single') {
    return pool.extras.length >= targets.length;
  }
  // Multi-cat: every target category must have enough extras
  let canServe = true;
  targetsByCat.forEach((catTargets, catId) => {
    if ((pool.extrasByCat[catId]?.length ?? 0) < catTargets.length) canServe = false;
  });
  return canServe;
}

// Pops values from the pool for the current targets and returns the updated pool.
function consumePool(
  pool: SuggestionPool,
  targets: string[],
  targetsByCat: Map<string, string[]>,
): { entries: [string, string][]; updatedPool: SuggestionPool } {
  if (pool.kind === 'single') {
    const values = pool.extras.slice(0, targets.length);
    const entries: [string, string][] = targets.map((t, i) => [t, values[i]]);
    return {
      entries,
      updatedPool: { ...pool, extras: pool.extras.slice(targets.length) },
    };
  }
  // Multi-cat
  const entries: [string, string][] = [];
  const updatedExtrasByCat = { ...pool.extrasByCat };
  targetsByCat.forEach((catTargets, catId) => {
    const catExtras = pool.extrasByCat[catId] ?? [];
    catTargets.forEach((t: string, i: number) => entries.push([t, catExtras[i]]));
    updatedExtrasByCat[catId] = catExtras.slice(catTargets.length);
  });
  return {
    entries,
    updatedPool: { ...pool, extrasByCat: updatedExtrasByCat },
  };
}

// Merges a fresh API response into the pool for this key (or creates a new one).
function mergeIntoPool(
  existing: SuggestionPool | undefined,
  result: SuggestResult,
  targets: string[],
): SuggestionPool {
  // Collect every value that was returned this call (current + extras) for `seen`
  const currentValues = Object.values(result.suggestions);

  if (result.extrasByCat) {
    // P5 multi-cat pool
    const allNewValues = [
      ...currentValues,
      ...Object.values(result.extrasByCat).flat(),
    ];
    const prevSeen = existing?.seen ?? [];
    return {
      kind: 'multi',
      extrasByCat: result.extrasByCat,
      seen: Array.from(new Set([...prevSeen, ...allNewValues])),
    };
  }

  // Single-cat pool (P1–P4, P6, P6v)
  const newExtras = result.extras ?? [];
  const allNewValues = [...currentValues, ...newExtras];
  const prevPool = existing?.kind === 'single' ? existing : undefined;
  return {
    kind: 'single',
    extras: newExtras,
    seen: Array.from(new Set([...(prevPool?.seen ?? []), ...allNewValues])),
  };
}

// ── State ─────────────────────────────────────────────────────────────────────

type AiModeState = {
  isActive: boolean;
  selected: string[];              // serialized FieldIds
  suggestions: [string, string][]; // [serialized FieldId, suggested value]
  isLoading: boolean;
  error: string | null;
  shakingFields: string[];         // playing shake-out animation
  snappingFields: string[];        // playing snap-in animation
};

type Action =
  | { type: 'ENTER' }
  | { type: 'EXIT' }
  | { type: 'TOGGLE_FIELD'; fieldId: string; dropFieldIds?: string[] }
  | { type: 'DESELECT_FIELDS'; fieldIds: string[] }
  | { type: 'ADD_SELECTED'; fieldId: string }
  | { type: 'ACCEPT_SUGGESTION'; fieldId: string }
  | { type: 'CLEAR_SUGGESTION'; fieldId: string }
  | { type: 'SET_SUGGESTIONS'; entries: [string, string][] }
  | { type: 'CLEAR_SHAKING' }
  | { type: 'CLEAR_SNAPPING' }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null };

function initial(): AiModeState {
  return {
    isActive: false,
    selected: [],
    suggestions: [],
    isLoading: false,
    error: null,
    shakingFields: [],
    snappingFields: [],
  };
}

function reducer(state: AiModeState, action: Action): AiModeState {
  switch (action.type) {
    case 'ENTER':
      return { ...initial(), isActive: true };

    case 'EXIT':
      return initial();

    case 'TOGGLE_FIELD': {
      if (state.selected.includes(action.fieldId)) {
        // Deselecting — just remove.
        return {
          ...state,
          selected: state.selected.filter((s) => s !== action.fieldId),
        };
      }
      // Selecting — drop any fields specified by the caller (e.g. other empty name targets).
      const drop = action.dropFieldIds ?? [];
      const base = drop.length > 0
        ? state.selected.filter((s) => !drop.includes(s))
        : [...state.selected];
      return { ...state, selected: [...base, action.fieldId] };
    }

    case 'DESELECT_FIELDS':
      return {
        ...state,
        selected: state.selected.filter((s) => !action.fieldIds.includes(s)),
        suggestions: state.suggestions.filter(([k]) => !action.fieldIds.includes(k)),
        shakingFields: action.fieldIds,
      };

    case 'ADD_SELECTED':
      return {
        ...state,
        selected: state.selected.includes(action.fieldId)
          ? state.selected
          : [...state.selected, action.fieldId],
        snappingFields: [...state.snappingFields, action.fieldId],
      };

    case 'ACCEPT_SUGGESTION':
      return {
        ...state,
        selected: state.selected.filter((s) => s !== action.fieldId),
        suggestions: state.suggestions.filter(([k]) => k !== action.fieldId),
      };

    case 'CLEAR_SUGGESTION':
      return {
        ...state,
        suggestions: state.suggestions.filter(([k]) => k !== action.fieldId),
      };

    case 'SET_SUGGESTIONS':
      return {
        ...state,
        isLoading: false,
        error: null,
        // Replace any existing suggestions for these fields, append new ones.
        suggestions: [
          ...state.suggestions.filter(([k]) => !action.entries.some(([ek]) => ek === k)),
          ...action.entries,
        ],
      };

    case 'CLEAR_SHAKING':
      return { ...state, shakingFields: [] };

    case 'CLEAR_SNAPPING':
      return { ...state, snappingFields: [] };

    case 'SET_LOADING':
      return { ...state, isLoading: action.loading, error: null };

    case 'SET_ERROR':
      return { ...state, isLoading: false, error: action.error };

    default:
      return state;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAiMode(
  categories: CategoryDraft[],
  setName: (catId: string, name: string) => void,
  setItem: (catId: string, index: number, value: string) => void,
) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);

  // Pools live in a ref — they update silently alongside state dispatches.
  // Cleared whenever EXIT is dispatched (we mirror that in the ref).
  const poolsRef = useRef<Map<string, SuggestionPool>>(new Map());

  const selectedSet = useMemo(() => new Set(state.selected), [state.selected]);
  const suggestionMap = useMemo(() => new Map(state.suggestions), [state.suggestions]);

  const scenario = useMemo(
    () => detectScenario(selectedSet, suggestionMap, categories),
    [selectedSet, suggestionMap, categories]
  );

  // ── Public actions ─────────────────────────────────────────────────────────

  const enterAiMode = useCallback(() => {
    poolsRef.current = new Map(); // fresh pools on each AI mode session
    dispatch({ type: 'ENTER' });
  }, []);

  const exitAiMode = useCallback(() => {
    // Accept all pending suggestions before clearing state.
    suggestionMap.forEach((value, serialized) => {
      const fieldId = deserializeFieldId(serialized);
      if (fieldId.kind === 'name') {
        setName(fieldId.catId, value);
      } else {
        setItem(fieldId.catId, fieldId.index, value);
      }
    });
    poolsRef.current = new Map();
    dispatch({ type: 'EXIT' });
  }, [suggestionMap, setName, setItem]);

  function toggleField(fieldId: FieldId) {
    const serialized = serializeFieldId(fieldId);
    // Tapping a field with a pending suggestion = accept it.
    if (selectedSet.has(serialized) && suggestionMap.has(serialized)) {
      _acceptSuggestion(fieldId, serialized);
      return;
    }

    // Radio behaviour for empty name targets: selecting a new empty name deselects
    // other empty names (only one unpopulated name target at a time).
    // Filled names can coexist freely — they act as context, not targets.
    let dropFieldIds: string[] | undefined;
    if (fieldId.kind === 'name' && !selectedSet.has(serialized)) {
      const cat = categories.find((c) => c.id === fieldId.catId);
      const isEmptyName = !cat?.name.trim() && !suggestionMap.has(serialized);
      if (isEmptyName) {
        dropFieldIds = state.selected.filter((s) => {
          if (!s.startsWith('name:')) return false;
          const otherId = deserializeFieldId(s);
          const otherCat = categories.find((c) => c.id === otherId.catId);
          return !otherCat?.name.trim() && !suggestionMap.has(s);
        });
      }
      // Selecting a filled name → no drops needed; it coexists as context.
    }

    dispatch({ type: 'TOGGLE_FIELD', fieldId: serialized, dropFieldIds });
  }

  function clearField(fieldId: FieldId) {
    const serialized = serializeFieldId(fieldId);
    if (suggestionMap.has(serialized)) {
      // Discard the pending suggestion — field stays selected as an empty target.
      dispatch({ type: 'CLEAR_SUGGESTION', fieldId: serialized });
    } else {
      // Clear user content and deselect.
      if (fieldId.kind === 'name') {
        setName(fieldId.catId, '');
      } else {
        setItem(fieldId.catId, fieldId.index, '');
      }
      dispatch({ type: 'TOGGLE_FIELD', fieldId: serialized });
    }
  }

  function triggerSuggest() {
    if (!scenario.canSuggest) return;

    // Compute the final selection after applying any switch behaviour.
    let finalSelected = [...state.selected];

    if (scenario.switchKind === 'deselect-cross-cat') {
      const nameTarget = finalSelected.find((s) => s.startsWith('name:'));
      if (nameTarget) {
        const nameCatId = deserializeFieldId(nameTarget).catId;
        // Drop everything from other categories — tiles AND names (e.g. N(B) in S4).
        const toDrop = finalSelected.filter((s) => {
          const f = deserializeFieldId(s);
          return f.catId !== nameCatId;
        });
        if (toDrop.length > 0) {
          finalSelected = finalSelected.filter((s) => !toDrop.includes(s));
          dispatch({ type: 'DESELECT_FIELDS', fieldIds: toDrop });
          setTimeout(() => dispatch({ type: 'CLEAR_SHAKING' }), 600);
        }
      }
    }

    if (scenario.switchKind === 'escalate-name') {
      const tileTarget = finalSelected.find((s) => s.startsWith('tile:'));
      if (tileTarget) {
        const catId = deserializeFieldId(tileTarget).catId;
        const nameId = serializeFieldId({ kind: 'name', catId });
        if (!finalSelected.includes(nameId)) {
          finalSelected = [...finalSelected, nameId];
          dispatch({ type: 'ADD_SELECTED', fieldId: nameId });
          setTimeout(() => dispatch({ type: 'CLEAR_SNAPPING' }), 600);
        }
      }
    }

    // Brief delay when a switch animation is playing; otherwise fire immediately.
    const delay = scenario.switchKind ? 350 : 0;
    setTimeout(() => _performSuggest(finalSelected), delay);
  }

  // ── Per-field state snapshot ───────────────────────────────────────────────

  function getFieldInfo(fieldId: FieldId): AiFieldInfo {
    const serialized = serializeFieldId(fieldId);
    const isSelected = selectedSet.has(serialized);
    const suggestion = suggestionMap.get(serialized);
    const cat = categories.find((c) => c.id === fieldId.catId)!;
    const userValue =
      fieldId.kind === 'name'
        ? cat.name
        : cat.items[(fieldId as Extract<FieldId, { kind: 'tile' }>).index];

    const isTarget = isSelected && (!userValue.trim() || suggestion !== undefined);
    const isContext = isSelected && !isTarget;

    return {
      isSelected,
      isTarget,
      isContext,
      suggestion,
      displayValue: suggestion ?? userValue,
      isSuggestion: suggestion !== undefined,
      isShaking: state.shakingFields.includes(serialized),
      isSnapping: state.snappingFields.includes(serialized),
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  function _acceptSuggestion(fieldId: FieldId, serialized: string) {
    const value = suggestionMap.get(serialized);
    if (value === undefined) return;
    if (fieldId.kind === 'name') {
      setName(fieldId.catId, value);
    } else {
      setItem(fieldId.catId, fieldId.index, value);
    }
    dispatch({ type: 'ACCEPT_SUGGESTION', fieldId: serialized });
  }

  async function _performSuggest(selectedFields: string[]) {
    dispatch({ type: 'SET_LOADING', loading: true });

    // Classify fields into targets (empty / suggestion-pending) and contexts (user-filled).
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const targets: string[] = [];
    const contexts: string[] = [];

    for (const fieldIdStr of selectedFields) {
      const fieldId = deserializeFieldId(fieldIdStr);
      const cat = catMap.get(fieldId.catId);
      if (!cat) continue;
      const userValue =
        fieldId.kind === 'name'
          ? cat.name
          : cat.items[(fieldId as Extract<FieldId, { kind: 'tile' }>).index];
      const isTarget = !userValue.trim() || suggestionMap.has(fieldIdStr);
      if (isTarget) targets.push(fieldIdStr);
      else contexts.push(fieldIdStr);
    }

    if (targets.length === 0) {
      dispatch({ type: 'SET_LOADING', loading: false });
      return;
    }

    // Re-detect scenario on the final selection (after any switch effects)
    const finalSelected = new Set(selectedFields);
    const finalScenario = detectScenario(finalSelected, suggestionMap, categories);
    const promptType = finalScenario.promptType;

    if (!promptType) {
      dispatch({ type: 'SET_LOADING', loading: false });
      return;
    }

    // Build a map of catId → target fieldIds (used for P5 pool checks)
    const targetsByCat = new Map<string, string[]>();
    for (const t of targets) {
      const catId = deserializeFieldId(t).catId;
      if (!targetsByCat.has(catId)) targetsByCat.set(catId, []);
      targetsByCat.get(catId)!.push(t);
    }
    const targetCatIds = Array.from(targetsByCat.keys());

    // ── Check pool first ───────────────────────────────────────────────────
    const poolKey = buildPoolKey(promptType, contexts, targetCatIds);
    const existingPool = poolsRef.current.get(poolKey);

    if (existingPool && poolCanServe(existingPool, targets, targetsByCat)) {
      const { entries, updatedPool } = consumePool(existingPool, targets, targetsByCat);
      poolsRef.current.set(poolKey, updatedPool);
      dispatch({ type: 'SET_SUGGESTIONS', entries });
      return;
    }

    // ── No usable pool — call the API ──────────────────────────────────────

    // All tile values already in the puzzle (user-filled, across every category).
    // Combined with the pool's seen list so the model never suggests a duplicate
    // of an existing tile OR a value we've already shown the user for this pool.
    const existingTileValues = categories
      .flatMap((c) => c.items)
      .map((v) => v.trim())
      .filter(Boolean);
    const exclude = Array.from(
      new Set([...(existingPool?.seen ?? []), ...existingTileValues])
    );

    try {
      const res = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptType,
          targets,
          contexts,
          exclude,
          categories: categories.map((c) => ({
            id: c.id,
            color: c.color,
            name: c.name,
            items: c.items as [string, string, string, string],
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        dispatch({ type: 'SET_ERROR', error: data?.error ?? 'Suggestion failed' });
        return;
      }

      const result = data as SuggestResult;

      // Store extras in the pool for this key
      const updatedPool = mergeIntoPool(existingPool, result, targets);
      poolsRef.current.set(poolKey, updatedPool);

      // Client-side safety filter: drop any suggestion that duplicates an existing tile.
      const existingTileSet = new Set(existingTileValues.map((v) => v.toLowerCase()));
      const entries: [string, string][] = Object.entries(
        result.suggestions as Record<string, string>
      ).filter(([, value]) => !existingTileSet.has(value.trim().toLowerCase()));

      dispatch({ type: 'SET_SUGGESTIONS', entries });
    } catch {
      dispatch({ type: 'SET_ERROR', error: 'Network error — please try again' });
    }
  }

  return {
    isActive: state.isActive,
    isLoading: state.isLoading,
    error: state.error,
    scenario,
    enterAiMode,
    exitAiMode,
    toggleField,
    clearField,
    triggerSuggest,
    getFieldInfo,
  };
}
