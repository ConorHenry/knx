# Clique — Project Plan

NYT Connections clone that lets anyone create a custom puzzle and share it with friends via a URL. No accounts, no database — all puzzle data lives in the share link.

---

## Completed ✅

### Core infrastructure
- `lib/types.ts` — `Puzzle`, `Category`, `Difficulty` types
- `lib/encoding.ts` — `encodePuzzle` / `decodePuzzle` (fflate + Base64URL, ~140–200 char URLs)
- `lib/validation.ts` — Zod schemas for puzzle and AI API request bodies
- `lib/game-logic.ts` — `checkGuess` (correct / one-away / wrong), `isGameWon`, `isGameLost`

### Solver UI
- `hooks/useGameState.ts` — full game state machine (useReducer)
- `components/solver/PuzzleGrid.tsx` — interactive 4×4 grid with Phase 1/2 FLIP animations
- `components/solver/SolvedCategory.tsx` — revealed category banners
- `components/solver/MistakeCounter.tsx` — dot indicators
- `components/solver/GameOverModal.tsx` — win / lose overlay
- `components/solver/GameBoard.tsx` — top-level solver layout
- `app/play/page.tsx` — decodes `?p=` URL param, renders solver or error state

### Creator UI
- `hooks/usePuzzleCreator.ts` — form state with validation
- `components/creator/CategoryRow.tsx` — per-category input row with AI suggestion buttons
- `components/creator/CreatorForm.tsx` — 4 category rows + share button
- `app/create/page.tsx` — puzzle creation page

### AI routes
- `app/api/ai/suggest-items/route.ts` — POST: fills up to 4 items for a category
- `app/api/ai/suggest-name/route.ts` — POST: suggests 3 category names from 4 items
- Both routes: Zod-validated input, server-side Anthropic SDK call, JSON output

### Tests (Vitest)
- `lib/encoding.test.ts` — round-trip, unicode, edge cases
- `lib/game-logic.test.ts` — all guess outcomes, win/lose detection
- 28 tests passing

---

## Remaining Work

### Animation polish (priority: high — next session)
The two-phase solve animation is functional but still being tuned. See `ANIMATION_NOTES.md` for full architecture.

**Things to revisit:**
- [ ] Verify drift Y-target feels natural across all solve orders (especially first solve vs. later solves as `solvedAreaRef` grows)
- [ ] Consider easing curves — current: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` for drift/flip, `cubic-bezier(0.22, 1, 0.36, 1)` for category reveal
- [ ] Mobile sizing — test on narrow viewports, ensure tile heights and gap math hold
- [ ] Test with longer item strings that cause text wrapping

### E2E tests (priority: medium)
- [ ] `e2e/creator.spec.ts` — fill all fields → get AI suggestion → accept it → copy share URL
- [ ] `e2e/solver.spec.ts` — load known URL → make 4 correct guesses → win screen
- [ ] `e2e/solver.spec.ts` — make 4 wrong guesses → lose screen
- [ ] `e2e/invalid-url.spec.ts` — `/play?p=garbage` → error UI

### Creator UX improvements (priority: medium)
- [ ] Suggestion popover in `CategoryRow` — currently suggestions replace the input directly; would be better as a dismissable popover list
- [ ] Validation feedback — highlight which fields are incomplete before sharing
- [ ] Preview the puzzle before sharing (show it in solve mode)
- [ ] Character limits on item/category name inputs

### Solver UX improvements (priority: low)
- [ ] Guess history replay in `GameOverModal` (show which groups were solved correctly vs mistakes)
- [ ] Confetti or celebration on win
- [ ] "Copy result" button (share outcome grid like Wordle, without spoilers)
- [ ] Keyboard navigation for the grid (Tab + Space/Enter already planned)

### Deployment (priority: low — do last)
- [ ] Set `ANTHROPIC_API_KEY` in Amplify console environment variables
- [ ] `amplify/backend.ts` — Amplify Gen 2 backend config
- [ ] Verify Next.js API routes deploy correctly as Lambda on Amplify
- [ ] Custom domain (optional)
- [ ] `README.md` with setup instructions

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS + shadcn/ui |
| URL encoding | fflate deflate + Base64URL |
| AI | Anthropic Claude API (claude-haiku-4-5) |
| Deployment | AWS Amplify Gen 2 |
| Unit tests | Vitest + React Testing Library |
| E2E tests | Playwright |

---

## Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...    # Amplify console only — never in code or .env.local committed to git
```

---

## Key Files Quick Reference

| File | Purpose |
|---|---|
| `lib/types.ts` | All shared types — start here |
| `lib/encoding.ts` | URL encode/decode — the sharing mechanism |
| `lib/game-logic.ts` | Pure solver logic |
| `hooks/useGameState.ts` | Solver state machine + animation timing constants |
| `components/solver/PuzzleGrid.tsx` | Phase 1/2 animation logic |
| `ANIMATION_NOTES.md` | Deep-dive on the solve animation architecture |
