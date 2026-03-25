# Clique — Animation System Notes

Reference for picking up animation work. Covers architecture, current state,
known issues, and next-session TODO.

---

## Overview

When a player submits a correct guess the following sequence plays:

```
t = 0 ms      Phase 1 begins
              • 4 solving tiles drift up + across to the reveal-row zone
              • Top-row non-solving tiles slide horizontally to new columns

t = 320 ms    COMPLETE_SOLVE fires (useGameState)
              • Solving tiles removed from DOM
              • New SolvedCategory row mounts → category-merge-in animation
              • Phase 2 begins for remaining tiles

t = 320 ms+   Phase 2
              • Former top-row tiles: FLIP continues seamlessly from mid-animation
              • All other tiles: FLIP from original positions

t = 920 ms    (for 3rd correct guess) AUTO_SOLVE_LAST fires
              → same sequence repeats for the 4th category

t = 1520 ms   Win modal fades in (MODAL_DELAY_MS after status = 'won')
```

---

## Timing Constants

All timing constants are co-located with their usage. To slow everything down
for debugging, multiply each by 3 (see below).

| Constant | File | Value | Purpose |
|---|---|---|---|
| `tile-drift-to-row` duration | `globals.css` | 360ms | Solving tiles + top-row slide |
| `tile-flip-settle` duration | `globals.css` | 340ms | Remaining tiles FLIP |
| `category-merge-in` duration | `globals.css` | 460ms | Reveal row entrance |
| `COMPLETE_SOLVE_DELAY_MS` | `useGameState.ts` | 320ms | Phase 1 → Phase 2 gap |
| `AUTO_SOLVE_DELAY_MS` | `useGameState.ts` | 380ms | Pause between 3rd and 4th reveals |
| FLIP cleanup timeout | `PuzzleGrid.tsx` | 400ms | Remove flip classes after settle |
| `MODAL_DELAY_MS` | `GameBoard.tsx` | 600ms | Win modal delay after `status='won'` |
| `CLEAR_LAST_RESULT` timeout | `useGameState.ts` | 800ms | Clear one-away toast |

**To slow everything 3× for debugging**, multiply all values above by 3.
The constants are named/commented so it's easy to find them.

---

## CSS Keyframes (`app/globals.css`)

### `tile-drift-to-row`
Applied to **solving tiles** and **top-row non-solving tiles** in Phase 1.
Animates `translate(0,0)` → `translate(var(--drift-x), var(--drift-y))`.
`animation-fill-mode: forwards` — tile stays at target after animation ends.
CSS vars `--drift-x` / `--drift-y` are set inline per tile.

### `tile-flip-settle`
Applied to **remaining tiles** in Phase 2 (FLIP technique).
Animates `translate(var(--flip-x), var(--flip-y))` → `translate(0,0)`.
`animation-fill-mode: backwards` — tile instantly snaps to `from` state when
class is applied (before browser paints), so the layout jump is never visible.
CSS vars `--flip-x` / `--flip-y` set inline per tile.

### `category-merge-in`
Applied to **SolvedCategory** on mount.
Starts blurry, compressed, translated up; springs into full size.
`transform-origin: top center` so it unfurls downward.

---

## State Pipeline (`hooks/useGameState.ts`)

```
SUBMIT_GUESS (correct)
  → solvingItems = selected tiles
  → solvingCategory = matched category
  → grid unchanged (tiles stay in DOM for animation)

useEffect([solvingItems.length]) — fires when solvingItems becomes non-empty
  → setTimeout(COMPLETE_SOLVE, COMPLETE_SOLVE_DELAY_MS)

COMPLETE_SOLVE
  → removes solvingItems from grid
  → adds solvingCategory.color to solvedColors
  → if exactly 1 category left: pendingAutoSolve = true

useEffect([pendingAutoSolve]) — fires when pendingAutoSolve = true
  → setTimeout(AUTO_SOLVE_LAST, AUTO_SOLVE_DELAY_MS)

AUTO_SOLVE_LAST
  → sets solvingItems = remaining 4 tiles
  → same pipeline repeats → COMPLETE_SOLVE → status = 'won'

GameBoard useEffect([status])
  → when 'won': setTimeout(setShowModal(true), MODAL_DELAY_MS)
  → when 'lost': setShowModal(true) immediately
```

---

## PuzzleGrid Animation Logic (`components/solver/PuzzleGrid.tsx`)

All animation is applied via **direct DOM mutation** in `useLayoutEffect` —
no React state changes, so there are no extra renders and timing is
frame-accurate.

### Refs

| Ref | Purpose |
|---|---|
| `itemRefs` | `Map<string, HTMLButtonElement>` — every tile button |
| `preFlipRects` | `Map<string, DOMRect>` — snapshot of all tile positions at Phase 1 start; used as "from" for Group-2 FLIP |
| `phase1TopRowItems` | `Set<string>` — which non-solving tiles were in row 0; Phase 2 uses their mid-animation position instead of preFlipRects |
| `prevGridLen` | sentinel to detect when grid shrinks (COMPLETE_SOLVE) |
| `prevSolvingLen` | sentinel to detect when solvingItems becomes non-empty (Phase 1) |

### Phase 1 (in `useLayoutEffect`, no deps array — runs every render, guarded by sentinel)

1. Snapshot all tile `getBoundingClientRect()` → `preFlipRects`
2. Measure `tileW`, `tileH`, `gap` from first two tiles
3. Read `solvedAreaRef.current.getBoundingClientRect().bottom` as vertical target Y
4. **Solving tiles**: sort by current column (left-to-right). Each tile drifts to
   its assigned column slot at the reveal-row Y.
   `dx = (targetCol - curCol) * (tileW + gap)`
   `dy = solvedAreaBottom - (r0.top + curRow * (tileH + gap))`
5. **Top-row non-solving tiles**: drift horizontally only.
   `dx = (newCol - oldCol) * (tileW + gap)`, `dy = 0`
   `newCol` = their index in `remaining[]` (always < 4, stays in row 0)
6. Both groups: `el.style.setProperty('--drift-x/y', ...)` + `el.classList.add('animate-tile-drift')`

### Phase 2 (in `useLayoutEffect`, no deps array — runs every render, guarded by sentinel)

Triggered when `grid.length` decreases (COMPLETE_SOLVE).

**Group 1 — former top-row tiles** (`phase1TopRowItems`):
1. `midAnim = el.getBoundingClientRect()` — captures current mid-animation position
2. `el.classList.remove('animate-tile-drift')` + clear CSS vars — cancels Phase 1
3. `cur = el.getBoundingClientRect()` — natural position in new 12-tile grid
4. `flip-x = midAnim.left - cur.left`, `flip-y = midAnim.top - cur.top`

**Group 2 — all other remaining tiles**:
1. `snap = preFlipRects.get(item)` — original position from Phase 1 start
2. `cur = el.getBoundingClientRect()` — natural position in new 12-tile grid
3. `flip-x = snap.left - cur.left`, `flip-y = snap.top - cur.top`

Both groups: apply `--flip-x/y` CSS vars + `animate-tile-flip` class.
Cleanup timeout removes classes after animation completes.

### Why no React state for animations?

Using `useState` would trigger a re-render, which would re-run all the `useLayoutEffect`
sentinels and potentially fire a second animation. Direct DOM mutation sidesteps this:
the DOM is mutated synchronously before the browser paints, effects complete, and React
never sees a state change.

---

## `solvedAreaRef` (passed from `GameBoard`)

The vertical drift target for Phase 1 must be the bottom of the solved-categories
container — NOT the top of the tile grid — because the new reveal row appears there,
not at the tile grid top.

`GameBoard` attaches a `useRef<HTMLDivElement>` to `<div className="space-y-2">` (the
solved categories wrapper) and passes it as `solvedAreaRef` to `PuzzleGrid`.

- First solve: container is empty → `bottom === top` → target is correct (first row appears at the top of this div)
- Subsequent solves: `bottom` is the bottom edge of the last existing row → new row stacks immediately after ✓

---

## Next Session — Animation TODO

These items were identified but not yet implemented:

1. **Polish the timing** — now that animations are implemented, tune the exact
   durations and easing curves to feel snappy but satisfying. Key levers:
   - `COMPLETE_SOLVE_DELAY_MS`: controls overlap between tile drift and reveal row appearance
   - `tile-drift-to-row` easing: currently `cubic-bezier(0.25, 0.46, 0.45, 0.94)` (ease-out)
   - `tile-flip-settle` easing: same curve
   - `category-merge-in` easing: `cubic-bezier(0.22, 1, 0.36, 1)` (spring-ish)

2. **Wrong-guess shake** — currently uses `animate-shake` CSS keyframe. Verify it
   still feels right after the drift animations were added (no conflicts with
   `transition-colors duration-150` on non-solving tiles).

3. **Consider staggering the solving tiles' drift** — right now all 4 solving tiles
   start simultaneously. A 40–60ms stagger between them (left-to-right) could look
   more organic. Would require setting `animation-delay` per tile in Phase 1.

4. **Loss reveal** — when the game is lost, all unsolved categories are currently
   shown in the modal but don't animate onto the board. Consider a sequential reveal
   of the remaining categories on the board before the modal appears.

5. **Mobile layout** — on small screens the grid tiles are narrower; verify the
   FLIP calculations still hold (they use measured `getBoundingClientRect` so
   should be fine, but worth a visual check).

---

## Quick Debug Reference

**To slow all animations 3× (for visual debugging):**
```
globals.css:
  tile-drift-to-row   360ms  → 1080ms
  tile-flip-settle    340ms  → 1020ms
  category-merge-in   460ms  → 1380ms

useGameState.ts:
  COMPLETE_SOLVE_DELAY_MS   320  → 960
  AUTO_SOLVE_DELAY_MS       380  → 1140
  CLEAR_LAST_RESULT timeout 800  → 2400

PuzzleGrid.tsx:
  cleanup timeout  400  → 1200

GameBoard.tsx:
  MODAL_DELAY_MS   600  → 1800
```

**To add a console trace to Phase 1/2:**
In `PuzzleGrid.tsx`, add `console.log('Phase 1', { solvingItems, topRow: [...topRowNonSolving] })`
inside the Phase 1 useLayoutEffect, and similarly for Phase 2.
