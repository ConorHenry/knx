/**
 * Pure scenario detection logic.
 *
 * Given the current selection + suggestions + categories, returns a ScenarioResult
 * that drives the instruction bar, suggest button state, and any switch behavior.
 *
 * Core validity rules encoded here:
 *  1. Cross-cat context is only valid when at least one tile target is present.
 *  2. If a name field is a target, all other selected fields must be from the same category.
 *  3. Auto-escalation: if all tile targets are in one category and that category's name is
 *     also empty (and not already selected), snap it in as a target on submit.
 */

import { type CategoryDraft } from '@/hooks/usePuzzleCreator';
import {
  deserializeFieldId,
  serializeFieldId,
  type FieldId,
  type ScenarioResult,
} from './ai-mode-types';

type FieldAnalysis = {
  id: FieldId;
  serialized: string;
  catId: string;
  isTarget: boolean;
  isContext: boolean;
};

function analyzeFields(
  selected: Set<string>,
  suggestions: Map<string, string>,
  categories: CategoryDraft[]
): FieldAnalysis[] {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  return Array.from(selected).map((s) => {
    const id = deserializeFieldId(s);
    const cat = catMap.get(id.catId)!;
    const userValue =
      id.kind === 'name'
        ? cat.name
        : cat.items[(id as Extract<FieldId, { kind: 'tile' }>).index];
    const isTarget = !userValue.trim() || suggestions.has(s);
    return { id, serialized: s, catId: id.catId, isTarget, isContext: !isTarget };
  });
}

export function detectScenario(
  selected: Set<string>,
  suggestions: Map<string, string>,
  categories: CategoryDraft[]
): ScenarioResult {
  if (selected.size === 0) {
    return {
      scenarioId: null,
      canSuggest: false,
      promptType: null,
      switchKind: null,
      instruction: 'Select empty fields to fill, or filled fields to use as context.',
      invalidMessage: null,
    };
  }

  const fields = analyzeFields(selected, suggestions, categories);
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const targets = fields.filter((f) => f.isTarget);
  const contexts = fields.filter((f) => f.isContext);
  const targetNames = targets.filter((f) => f.id.kind === 'name');
  const targetTiles = targets.filter((f) => f.id.kind === 'tile');
  const contextTiles = contexts.filter((f) => f.id.kind === 'tile');
  const contextNames = contexts.filter((f) => f.id.kind === 'name');

  // Only context selected — no targets yet.
  if (targets.length === 0) {
    return {
      scenarioId: null,
      canSuggest: false,
      promptType: null,
      switchKind: null,
      instruction: 'Select an empty field to fill.',
      invalidMessage: null,
    };
  }

  // ── HAS NAME TARGET ──────────────────────────────────────────────────────────
  if (targetNames.length > 0) {
    const nameTargetCatId = targetNames[0].catId;

    // S23: tile targets in a different category than the name target.
    if (targetTiles.some((f) => f.catId !== nameTargetCatId)) {
      return {
        scenarioId: 'S23',
        canSuggest: false,
        promptType: null,
        switchKind: null,
        instruction: "Can't suggest a category name and tiles from different categories together.",
        invalidMessage:
          "A category name and tiles from different categories can't be suggested together — select one or the other.",
      };
    }

    const hasCrossContextTiles = contextTiles.some((f) => f.catId !== nameTargetCatId);
    const hasSameCatContextTiles = contextTiles.some((f) => f.catId === nameTargetCatId);
    const hasSameCatContext =
      hasSameCatContextTiles || contextNames.some((f) => f.catId === nameTargetCatId);

    // Name + tile targets (same category).
    if (targetTiles.length > 0) {
      if (hasCrossContextTiles) {
        // S22: valid — cross-cat context informs the tile targets as red herrings;
        // the name suggestion uses only same-cat context.
        return {
          scenarioId: 'S22',
          canSuggest: true,
          promptType: 'P6v',
          switchKind: null,
          instruction:
            'Suggest a name and a tile — the tile will be a red herring against the selected context.',
          invalidMessage: null,
        };
      }
      // S20 or S21: name + tile targets, same-cat context only.
      return {
        scenarioId: hasSameCatContext ? 'S21' : 'S20',
        canSuggest: true,
        promptType: 'P6',
        switchKind: null,
        instruction: hasSameCatContext
          ? 'Suggest a name and tiles for this category, guided by the selected context.'
          : 'Suggest a name and tiles for this category.',
        invalidMessage: null,
      };
    }

    // Name target only — no tile targets.
    // S4: both same-cat and cross-cat context present — drop cross-cat on submit.
    if (hasCrossContextTiles && hasSameCatContextTiles) {
      return {
        scenarioId: 'S4',
        canSuggest: true,
        promptType: 'P2',
        switchKind: 'deselect-cross-cat',
        instruction: 'Tap Suggest — tiles from other categories will be removed automatically.',
        invalidMessage: null,
      };
    }
    // S3: only cross-cat context, no tile target to use it — blocked.
    if (hasCrossContextTiles) {
      return {
        scenarioId: 'S3',
        canSuggest: false,
        promptType: null,
        switchKind: null,
        instruction: 'Category names can only draw context from tiles in the same category.',
        invalidMessage: 'A category name can only use tiles from the same category.',
      };
    }
    // S1 or S2: same-cat context or no context at all.
    return {
      scenarioId: hasSameCatContextTiles ? 'S2' : 'S1',
      canSuggest: true,
      promptType: hasSameCatContextTiles ? 'P2' : 'P1',
      switchKind: null,
      instruction: hasSameCatContextTiles
        ? 'Suggest a name that fits the selected tiles.'
        : 'Suggest a name for this category.',
      invalidMessage: null,
    };
  }

  // ── TILE TARGETS ONLY ────────────────────────────────────────────────────────
  const uniqueTargetCatIds = Array.from(new Set(targetTiles.map((f) => f.catId)));

  // Multiple target categories → P5: mutual red herrings.
  if (uniqueTargetCatIds.length > 1) {
    const catCount = uniqueTargetCatIds.length;
    const hasThirdCatContext = contextTiles.some(
      (f) => !uniqueTargetCatIds.includes(f.catId)
    );
    const scenarioId =
      catCount >= 3
        ? 'S19'
        : contextNames.length > 0
        ? 'S17'
        : hasThirdCatContext
        ? 'S18'
        : contexts.length > 0
        ? 'S16'
        : 'S15';

    return {
      scenarioId,
      canSuggest: true,
      promptType: 'P5',
      switchKind: null,
      instruction: `Suggest tiles across ${catCount} categories that could be mistaken for each other.`,
      invalidMessage: null,
    };
  }

  // Single target category → P3 or P4.
  const targetCatId = uniqueTargetCatIds[0];
  const cat = catMap.get(targetCatId)!;
  const targetCount = targetTiles.length;

  const hasCrossContextTiles = contextTiles.some((f) => f.catId !== targetCatId);
  const hasCrossContextNames = contextNames.some((f) => f.catId !== targetCatId);
  const hasCrossContext = hasCrossContextTiles || hasCrossContextNames;
  const hasSameCatContextTiles = contextTiles.some((f) => f.catId === targetCatId);
  const hasSameCatContextName = contextNames.some((f) => f.catId === targetCatId);
  const hasSameCatContext = hasSameCatContextTiles || hasSameCatContextName;

  // Escalation: if the category name is also empty and not already selected,
  // snap it in as a target on submit (saves an extra round-trip).
  const catNameEmpty = !cat.name.trim();
  const nameAlreadySelected = selected.has(serializeFieldId({ kind: 'name', catId: targetCatId }));
  const shouldEscalateName = catNameEmpty && !nameAlreadySelected && !hasCrossContext;

  // Cross-cat context → P4: red herring.
  if (hasCrossContext) {
    const crossCatIds = new Set<string>(
      contextTiles
        .filter((f) => f.catId !== targetCatId)
        .map((f) => f.catId)
        .concat(contextNames.filter((f) => f.catId !== targetCatId).map((f) => f.catId))
    );

    let scenarioId: string;
    if (crossCatIds.size >= 2) scenarioId = 'S14';
    else if (hasSameCatContextTiles && hasCrossContextTiles) scenarioId = 'S13';
    else if (hasCrossContextTiles && hasCrossContextNames) scenarioId = 'S12';
    else if (hasCrossContextTiles) scenarioId = 'S10';
    else scenarioId = 'S11';

    const catName = cat.name.trim();
    return {
      scenarioId,
      canSuggest: true,
      promptType: 'P4',
      switchKind: null,
      instruction: catName
        ? `Suggest a tile for "${catName}" that could also match the selected context.`
        : 'Suggest a misleading tile that fits this category but could plausibly belong elsewhere.',
      invalidMessage: null,
    };
  }

  // No cross-cat context → P3: straightforward same-category suggestion.
  let scenarioId: string;
  let switchKind: 'escalate-name' | null = null;

  if (shouldEscalateName) {
    switchKind = 'escalate-name';
    scenarioId = hasSameCatContext ? 'S7' : 'S6';
  } else if (hasSameCatContextTiles && hasSameCatContextName) {
    scenarioId = 'S9';
  } else if (hasSameCatContextName) {
    scenarioId = 'S8';
  } else if (hasSameCatContextTiles) {
    scenarioId = 'S7';
  } else {
    scenarioId = 'S6';
  }

  const catName = cat.name.trim();
  const tileLabel = targetCount === 1 ? 'a tile' : `${targetCount} tiles`;
  const instruction =
    switchKind === 'escalate-name'
      ? 'Tap Suggest — your category name will also be filled in.'
      : catName
      ? `Suggest ${tileLabel} for "${catName}".`
      : `Suggest ${tileLabel} for this category.`;

  return {
    scenarioId,
    canSuggest: true,
    promptType: 'P3',
    switchKind,
    instruction,
    invalidMessage: null,
  };
}
