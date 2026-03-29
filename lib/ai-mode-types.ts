// Field identity — uniquely identifies any editable field in the creator form.
export type FieldId =
  | { kind: 'name'; catId: string }
  | { kind: 'tile'; catId: string; index: 0 | 1 | 2 | 3 };

export function serializeFieldId(id: FieldId): string {
  return id.kind === 'name'
    ? `name:${id.catId}`
    : `tile:${id.catId}:${id.index}`;
}

export function deserializeFieldId(s: string): FieldId {
  const [kind, catId, idxStr] = s.split(':');
  if (kind === 'name') return { kind: 'name', catId };
  return { kind: 'tile', catId, index: Number(idxStr) as 0 | 1 | 2 | 3 };
}

// Which prompt template to use — determined by the selection combination.
export type PromptType = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P6v';

// Auto-correction applied before submitting, with a brief animation.
export type SwitchKind =
  | 'deselect-cross-cat' // S4: drop cross-cat context tiles — no tile target to use them
  | 'escalate-name';     // S6/S7: auto-add the empty category name as a target

// Everything the UI needs to render the bottom action bar and field states.
export type ScenarioResult = {
  scenarioId: string | null; // S1–S23 for debugging; null when no selection
  canSuggest: boolean;
  promptType: PromptType | null;
  switchKind: SwitchKind | null;
  instruction: string;       // always shown in AI mode
  invalidMessage: string | null; // replaces instruction when canSuggest is false
};

// Shape of the /api/ai/suggest response (shared between route and hook).
export type SuggestResult = {
  suggestions: Record<string, string>;
  extras?: string[];                    // P1–P4: flat array of extra values
  extrasByCat?: Record<string, string[]>; // P5: per-category extras
};

// Per-field state snapshot returned by useAiMode.getFieldInfo.
export type AiFieldInfo = {
  isSelected: boolean;
  isTarget: boolean;   // selected + (empty or has pending suggestion)
  isContext: boolean;  // selected + has user-filled content
  suggestion: string | undefined;
  displayValue: string; // suggestion ?? userValue
  isSuggestion: boolean;
  isShaking: boolean;  // shake-out animation (deselect-cross-cat switch)
  isSnapping: boolean; // snap-in animation (escalate-name switch)
};
