# Clique — Claude Code Context

NYT Connections clone where anyone can create a custom puzzle and share it as a URL. No accounts, no database — all puzzle data is encoded directly in the share link.

---

## How it works (the core loop)

1. Creator goes to `/create`, fills in 4 category names + 4 items each, picks difficulty colors
2. When all 20 fields are valid, a share URL is computed: `/play?p=<encoded>`
3. Creator clicks "Copy share link" → sends URL to friends
4. Friends open the URL → puzzle decoded → solver loads → they play

The encoding is `fflate` deflate + Base64URL (see `lib/encoding.ts`). URLs are ~140–200 chars. No server round-trip needed to load a puzzle.

---

## What's actually built

### Core
- `lib/types.ts` — `Puzzle`, `Category`, `Difficulty`, constants
- `lib/encoding.ts` — `encodePuzzle` / `decodePuzzle`
- `lib/validation.ts` — Zod schemas (puzzle + AI API request bodies)
- `lib/game-logic.ts` — `checkGuess`, `validatePuzzleComplete`, `validateNoDuplicateItems`, etc.

### Solver (play side) — fully working
- `app/play/page.tsx` — decodes `?p=` param, renders `GameBoard` or error
- `components/solver/GameBoard.tsx` — top-level layout; has "Create your own puzzle" link → `/create` (opens new tab)
- `components/solver/PuzzleGrid.tsx` — 4×4 interactive grid with two-phase FLIP solve animation
- `components/solver/SolvedCategory.tsx`, `MistakeCounter.tsx`, `GameOverModal.tsx`
- `hooks/useGameState.ts` — full game state machine (useReducer)

### Creator (build side) — fully working, AI mode UI complete
- `app/create/page.tsx` — puzzle creation page
- `components/creator/CreatorForm.tsx` — 4 category rows + copy-link button with reactive validation UX; AI mode toggle button
- `components/creator/CategoryRow.tsx` — per-category input (name + 4 items + difficulty picker); swaps inputs for selectable chips in AI mode
- `components/creator/AiFieldChip.tsx` — selectable chip component used in AI mode; indigo ring = target field, amber ring = context field; hover/long-press reveals Delete (clear) button
- `hooks/usePuzzleCreator.ts` — all creator state via useReducer (AI state lives separately in `useAiMode`)
- `hooks/useAiMode.ts` — all AI mode state; selection logic, scenario detection, switch/escalation behaviours, stub suggestion generator
- `lib/ai-mode-types.ts` — `FieldId`, `AiFieldInfo`, `ScenarioResult`, serialization utils
- `lib/ai-scenario.ts` — pure scenario detection (S1–S23); maps selection combinations to prompt types, validity, instructions, and switch behaviours

### AI mode — how it works

A sparkle (✨) button sits to the left of the copy button and is enabled whenever any fields are unpopulated. Clicking it enters **AI select mode**:

- All form inputs become non-editable **chips**. Tapping a chip selects it.
- **Indigo ring** = target field (empty or suggestion-pending — will be filled by AI)
- **Amber ring** = context field (user-filled — guides the AI)
- The role is derived automatically from the field's content when selected.
- Hover (desktop) or long-press (mobile) on any chip with content reveals a **Delete button** to clear it.
- A dynamic **instruction bar** appears below the buttons, describing what the AI will do based on the current selection.
- A **Suggest button** appears when the selection is valid. Clicking it runs `detectScenario()` to determine the prompt type (P1–P6v), applies any switch animation (shake cross-cat tiles out, snap empty name in), then calls the suggestion backend.
- Tapping a chip that has a pending suggestion **accepts** it (writes to form state, chip deselects). Accepted fields re-enter as context if selected again.
- Clicking the sparkle button again exits AI mode and discards any unaccepted suggestions.

**Suggestion backend is currently stubbed** — `useAiMode._performSuggest()` returns random strings after an 800ms fake delay. Replace with real API call when routes are ready.

### Scenario / prompt-type reference

`lib/ai-scenario.ts` maps every valid selection combination to one of six prompt types. Full combination table with validity rules, UI behaviours, and messages lives in `docs/ai-selection-combinations-edited.csv`. Key rules:
- Cross-cat context is only valid when at least one **tile target** is present
- If any target is a **name field**, all selected fields must be from the same category
- **Escalation**: if tile targets are in one category and that category's name is also empty (and unselected), it is auto-snapped in as a target on submit

### Tests (Vitest) — 64 passing
- `lib/encoding.test.ts`, `lib/game-logic.test.ts`, animation tests

---

## Creator validation design (important — non-obvious)

Validation is **reactive, not imperative**. No "submit" validator function.

`usePuzzleCreator` exposes two computed values via `useMemo`:
- `isComplete: boolean` — all 4 names + all 16 items non-empty → drives the button's `disabled` prop
- `duplicateItems: Set<string>` — lowercase-trimmed values that appear in more than one slot → drives alert state

**Copy button behavior:**
1. Incomplete → `disabled` (grayed out)
2. Complete, no duplicates → active, copies `shareUrl` to clipboard, flips to "Copied!" for 2s
3. Complete, has duplicates → same black button but with `AlertCircle` icon (larger) + red ring/halo; clicking sets `showErrors=true` which passes `errorItems` down to each `CategoryRow`, which applies `border-destructive ring-1 ring-destructive` to the specific duplicate `<Input>` elements. Helper text appears below.
4. `showErrors` auto-clears via `useEffect` as soon as `duplicateItems.size` drops to 0

Field-level highlighting: `CreatorForm` passes `errorItems: Set<string>` to each `CategoryRow`. Each item input checks `errorItems.has(item.trim().toLowerCase())`.

---

## What's NOT built yet

### AI suggestion API routes (next priority)
- `useAiMode._performSuggest()` currently returns random stub strings — replace with a real fetch once routes exist
- Route should accept the serialized selection + scenario prompt type and return suggested values per target field
- Model: `claude-haiku-4-5-20251001` via `@anthropic-ai/sdk` (already in package.json)
- Prompt templates for each type (P1–P6v) need to be written — the selection analysis and context extraction logic is already in `lib/ai-scenario.ts`

### Animation polish
- Two-phase solve animation works but is currently **slowed 6× in dev** for tuning (see `app/globals.css` — animation durations, and timing constants in `PuzzleGrid.tsx`)
- When ready to restore: divide all animation duration values by 6
- See `ANIMATION_NOTES.md` for full architecture

### E2E tests (Playwright) — not written yet

### Deployment (AWS Amplify Gen 2) — not configured yet
- `ANTHROPIC_API_KEY` will go in Amplify console env vars

---

## Tech stack

Next.js 14 (App Router) · TypeScript · Tailwind + shadcn/ui · fflate · Anthropic SDK · Vitest · Playwright · AWS Amplify Gen 2

---

## Conventions

- All creator state lives in `hooks/usePuzzleCreator.ts` — don't put validation logic in components
- All solver state lives in `hooks/useGameState.ts`
- Pure logic (no React) goes in `lib/`
- Animation DOM mutations go directly in `useLayoutEffect` / Web Animations API — never in React state, to avoid extra renders
- shadcn components are in `components/ui/` — don't modify them
