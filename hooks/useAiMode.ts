'use client';

import { useReducer, useMemo, useCallback } from 'react';
import { type CategoryDraft } from './usePuzzleCreator';
import {
  type FieldId,
  type AiFieldInfo,
  serializeFieldId,
  deserializeFieldId,
} from '@/lib/ai-mode-types';
import { detectScenario } from '@/lib/ai-scenario';

// ── Stub generators ──────────────────────────────────────────────────────────
// Temporary: replaced with real API calls once the UI is finalised.

const STUB_TILES = [
  'Anchor', 'Balloon', 'Candle', 'Dagger', 'Ember', 'Falcon', 'Glacier',
  'Harbor', 'Iris', 'Jasper', 'Kettle', 'Lantern', 'Marble', 'Needle',
  'Orbit', 'Paddle', 'Quartz', 'Raven', 'Saddle', 'Timber', 'Velvet',
  'Walnut', 'Xenon', 'Yarrow', 'Zephyr',
];
const STUB_NAMES = [
  'Things that ___', 'Types of ___', 'Words meaning ___', '___ of ___',
  'Famous ___s', 'Shades of ___', 'Parts of a ___', '___ without a ___',
];
const stubTile = () => STUB_TILES[Math.floor(Math.random() * STUB_TILES.length)];
const stubName = () => STUB_NAMES[Math.floor(Math.random() * STUB_NAMES.length)];

// ── State ────────────────────────────────────────────────────────────────────

type AiModeState = {
  isActive: boolean;
  selected: string[];              // serialized FieldIds
  suggestions: [string, string][]; // [serialized FieldId, suggested value]
  isLoading: boolean;
  shakingFields: string[];         // playing shake-out animation
  snappingFields: string[];        // playing snap-in animation
};

type Action =
  | { type: 'ENTER' }
  | { type: 'EXIT' }
  | { type: 'TOGGLE_FIELD'; fieldId: string }
  | { type: 'DESELECT_FIELDS'; fieldIds: string[] }
  | { type: 'ADD_SELECTED'; fieldId: string }
  | { type: 'ACCEPT_SUGGESTION'; fieldId: string }
  | { type: 'CLEAR_SUGGESTION'; fieldId: string }
  | { type: 'SET_SUGGESTIONS'; entries: [string, string][] }
  | { type: 'CLEAR_SHAKING' }
  | { type: 'CLEAR_SNAPPING' }
  | { type: 'SET_LOADING'; loading: boolean };

function initial(): AiModeState {
  return {
    isActive: false,
    selected: [],
    suggestions: [],
    isLoading: false,
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
        return {
          ...state,
          selected: state.selected.filter((s) => s !== action.fieldId),
        };
      }
      // Radio behaviour: selecting any name field deselects any other name field.
      const fieldId = deserializeFieldId(action.fieldId);
      const base =
        fieldId.kind === 'name'
          ? state.selected.filter((s) => !s.startsWith('name:'))
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
      return { ...state, isLoading: action.loading };

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

  const selectedSet = useMemo(() => new Set(state.selected), [state.selected]);
  const suggestionMap = useMemo(() => new Map(state.suggestions), [state.suggestions]);

  const scenario = useMemo(
    () => detectScenario(selectedSet, suggestionMap, categories),
    [selectedSet, suggestionMap, categories]
  );

  // ── Public actions ─────────────────────────────────────────────────────────

  const enterAiMode = useCallback(() => dispatch({ type: 'ENTER' }), []);
  const exitAiMode = useCallback(() => dispatch({ type: 'EXIT' }), []);

  function toggleField(fieldId: FieldId) {
    const serialized = serializeFieldId(fieldId);
    // Tapping a field with a pending suggestion = accept it.
    if (selectedSet.has(serialized) && suggestionMap.has(serialized)) {
      _acceptSuggestion(fieldId, serialized);
      return;
    }
    dispatch({ type: 'TOGGLE_FIELD', fieldId: serialized });
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
        const toDrop = finalSelected.filter((s) => {
          const f = deserializeFieldId(s);
          return f.kind === 'tile' && f.catId !== nameCatId;
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

  function _performSuggest(selectedFields: string[]) {
    dispatch({ type: 'SET_LOADING', loading: true });

    // Stub: fake 800ms latency then return random strings.
    // TODO: replace with real API call using scenario.promptType + selectedFields as context.
    setTimeout(() => {
      const catMap = new Map(categories.map((c) => [c.id, c]));
      const entries: [string, string][] = [];

      for (const fieldIdStr of selectedFields) {
        const fieldId = deserializeFieldId(fieldIdStr);
        const cat = catMap.get(fieldId.catId);
        if (!cat) continue;
        const userValue =
          fieldId.kind === 'name'
            ? cat.name
            : cat.items[(fieldId as Extract<FieldId, { kind: 'tile' }>).index];
        const isTarget = !userValue.trim() || suggestionMap.has(fieldIdStr);
        if (isTarget) {
          entries.push([fieldIdStr, fieldId.kind === 'name' ? stubName() : stubTile()]);
        }
      }

      dispatch({ type: 'SET_SUGGESTIONS', entries });
    }, 800);
  }

  return {
    isActive: state.isActive,
    isLoading: state.isLoading,
    scenario,
    enterAiMode,
    exitAiMode,
    toggleField,
    clearField,
    triggerSuggest,
    getFieldInfo,
  };
}
