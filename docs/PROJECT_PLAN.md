# Clique — Project Plan

A web app where users create custom NYT Connections-style puzzles and share them via URL.
No backend storage — the entire puzzle is encoded in the share link.

---

## Core Concept

**NYT Connections rules recap**
- 16 items arranged in a 4×4 grid
- Players group them into 4 categories of 4
- Each category has a difficulty colour: Yellow (easy) → Green → Blue → Purple (hardest)
- 4 wrong guesses allowed; "one away" hint if 3/4 items are correct

**Clique adds**
- A **Creator** flow: build your own puzzle, get AI suggestions, share a URL
- A **Solver** flow: receive the URL, play the puzzle

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router) | Static export friendly |
| Language | TypeScript (strict) | |
| Styling | Tailwind CSS v3 | Custom keyframes in globals.css |
| UI components | shadcn/ui (Radix base) | Button, Input, Popover, Tooltip |
| AI suggestions | Anthropic Claude API (`@anthropic-ai/sdk`) | Server-side route handler |
| URL encoding | `fflate` (deflate) + base64url | Keeps share links short |
| Testing | Vitest + Testing Library | Unit tests for logic & encoding |
| E2E | Playwright | Config present, tests TBD |
| Deploy target | AWS (TBD — see Deployment section) |

---

## Project Structure

```
clique/
├── app/
│   ├── page.tsx              # Landing / entry point
│   ├── play/[puzzle]/page.tsx # Solver route — decodes puzzle from URL param
│   ├── layout.tsx
│   └── globals.css           # All custom keyframes & animation utility classes
├── components/
│   ├── creator/              # Puzzle creation UI
│   └── solver/               # Puzzle solving UI
│       ├── GameBoard.tsx     # Orchestrates state + layout
│       ├── PuzzleGrid.tsx    # 4×4 grid with all FLIP animation logic
│       ├── SolvedCategory.tsx
│       ├── MistakeCounter.tsx
│       └── GameOverModal.tsx
├── hooks/
│   └── useGameState.ts       # All game state (useReducer) + timing effects
├── lib/
│   ├── types.ts              # Puzzle / Category / Difficulty types
│   ├── game-logic.ts         # checkGuess, isGameWon, shuffleItems, validators
│   ├── encoding.ts           # Puzzle ↔ URL encoding (deflate + base64url)
│   ├── validation.ts         # Zod schema for puzzle creation
│   ├── game-logic.test.ts
│   └── encoding.test.ts
└── docs/
    ├── PROJECT_PLAN.md       # ← this file
    └── ANIMATION_NOTES.md    # Animation system deep-dive
```

---

## Feature Status

### ✅ Complete

**Solver**
- Full game loop: select, submit, one-away feedback, shake on wrong, mistake counter
- Correct guess auto-removes tiles; category reveal row slides in
- Auto-solves the last category when 3 are done (no need to submit the obvious last guess)
- Win / loss modal with emoji share grid
- Play again / reset

**URL encoding**
- Puzzle serialised → deflate compressed → base64url → query param
- Fully round-trip tested

**Game state (useGameState)**
- `useReducer` with typed actions
- Hydration-safe shuffle (client-only `useEffect`)
- `pendingAutoSolve` flag for sequential last-two reveals
- `solvingItems` / `solvingCategory` / `COMPLETE_SOLVE` pipeline for animations

**Animations (see ANIMATION_NOTES.md for full detail)**
- Solving tiles drift to reveal-row position
- Top-row non-solving tiles slide horizontally immediately
- Remaining tiles FLIP to new positions when reveal row appears
- Category row condenses in from above (`category-merge-in`)
- Win modal delayed to let final card animate first

**Creator (partial)**
- UI exists for entering category names + 4 items each
- Difficulty colour selector per category
- Share link generation

### 🔲 TODO

**Creator**
- [ ] AI suggestion integration (Anthropic API route handler)
  - "Suggest 4th item for this group" prompt
  - "Suggest a category name" prompt
  - Popover UI with loading state
- [ ] Input validation UX (highlight empty/duplicate items before share)
- [ ] Preview of the puzzle before sharing

**Solver**
- [ ] Animation polish (see ANIMATION_NOTES.md — "Next session" section)
- [ ] Responsive layout pass (mobile keyboard pushes content)

**Infrastructure**
- [ ] AWS deployment (see Deployment section)
- [ ] Environment variable setup for ANTHROPIC_API_KEY

**Testing**
- [ ] E2E Playwright tests for creator flow
- [ ] E2E Playwright tests for solver flow
- [ ] Unit tests for AI prompt construction

---

## URL Encoding Scheme

```
/play?p=<base64url(deflate(json))>

JSON shape:
{
  "categories": [
    { "name": "string", "color": "yellow"|"green"|"blue"|"purple", "items": [s,s,s,s] },
    ...×4
  ]
}
```

`lib/encoding.ts` — `encodePuzzle(puzzle)` / `decodePuzzle(param)`.
Typical URL length: ~200–350 chars for a normal puzzle. No server storage needed.

---

## AI Suggestion Feature (TODO)

**API route**: `POST /api/suggest`

Request body variants:
```ts
// Suggest a missing item for a partial group
{ mode: "item", categoryName: string, items: string[] }

// Suggest a category name given 4 items
{ mode: "name", items: [string, string, string, string] }
```

Response: `{ suggestion: string }`

Uses `@anthropic-ai/sdk` server-side only. `ANTHROPIC_API_KEY` env var.
The route handler already has the SDK installed — just needs implementation.

---

## Deployment (AWS — TBD)

Options to evaluate:
1. **Amplify** — simplest, git-push deploy, handles Next.js SSR
2. **App Runner** — containerised, more control
3. **S3 + CloudFront** — cheapest for a static export (works if we convert to `output: 'export'`)
   - The AI suggestion route would need a separate Lambda / API Gateway
   - Or: make the API call from the client directly (less ideal — exposes key)

Recommended path: **Amplify** for the main app + rely on Amplify's built-in server functions for the `/api/suggest` route. Zero ops overhead.

---

## Development

```bash
npm run dev        # localhost:3000
npm test           # vitest unit tests
npm run test:e2e   # playwright (requires dev server running)
npm run build      # production build
```

---

## Key Design Decisions

- **No database** — puzzles live entirely in the URL. Zero infra cost, zero privacy concerns.
- **Client-side shuffle** — initial grid is category-order on server, shuffled in `useEffect` to avoid React hydration mismatch.
- **Direct DOM mutation for animations** — `PuzzleGrid` uses `useLayoutEffect` + `el.classList`/`el.style` directly rather than React state, so animation timing is frame-accurate with zero extra renders.
- **FLIP technique** — remaining tiles animate via First/Last/Invert/Play so the grid reflow looks physically correct rather than tiles teleporting.
