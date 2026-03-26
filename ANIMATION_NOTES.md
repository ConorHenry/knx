# Solve Animation Architecture

This document describes how the tile animations work when a player submits a correct guess. Read this before touching `PuzzleGrid.tsx`, `useGameState.ts`, or `globals.css`.

---

## High-Level Overview

When 4 tiles are solved, two animation phases fire in sequence:

| Phase | What moves | How long | Trigger |
|---|---|---|---|
| **Phase 1** | Solving tiles drift up to the reveal-row target; top-row non-solving tiles slide horizontally to their future columns | 360 ms | `solvingItems` becomes non-empty |
| **Phase 2** | After `COMPLETE_SOLVE`, the grid shrinks by 4. All remaining tiles FLIP from where they were (or appear to be mid-flight) to their new natural positions | 340 ms | `grid.length` decreases |

The `SolvedCategory` reveal row materialises simultaneously with Phase 2 using `animate-category-merge-in` (460 ms).

---

## State Machine Timing (keep in sync with CSS durations)

```
useGameState.ts
  COMPLETE_SOLVE_DELAY_MS = 320   // fires COMPLETE_SOLVE ~40ms before Phase 1 ends
  AUTO_SOLVE_DELAY_MS     = 380   // gap between 3rd and 4th category auto-reveal

globals.css
  .animate-tile-drift        360ms  (Phase 1)
  .animate-tile-flip         340ms  (Phase 2)
  .animate-category-merge-in 460ms  (reveal row)
```

`COMPLETE_SOLVE_DELAY_MS` (320 ms) intentionally fires slightly before Phase 1 ends (360 ms) so the category row starts forming just as the solving tiles arrive — it looks like they're "becoming" the row.

---

## Phase 1 Detail

Triggered in `useLayoutEffect` when `solvingItems.length` goes from 0 → 4.

**Before any animation starts**, a full snapshot of every tile's `getBoundingClientRect()` is saved into `preFlipRects`. This is the anchor for Phase 2.

### Solving tiles
- Sorted left-to-right by current column.
- Each tile is assigned a target column slot (0–3).
- `--drift-x` = column delta × (tile width + gap).
- `--drift-y` = `solvedAreaRef.current.getBoundingClientRect().bottom` − tile's current top.
  `solvedAreaRef` is a `ref` on the solved-categories `<div>` in `GameBoard`. Its `.bottom` is exactly where the next reveal row will appear.
- Class `animate-tile-drift` is added.

### Top-row non-solving tiles
- These are the tiles in grid positions 0–3 that are *not* in `solvingItems`.
- After the 4 solving tiles leave, these tiles will land in the top row of the 12-tile grid. They should start moving immediately rather than jumping during Phase 2.
- `--drift-y = 0px` (vertical position stays the same).
- `--drift-x` = new column − old column (computed from the post-solve `remaining` array).
- These tiles are stored in `phase1TopRowItems` ref for Phase 2 to identify.

---

## Phase 2 Detail

Triggered in `useLayoutEffect` when `grid.length` decreases (i.e., `COMPLETE_SOLVE` has fired and the 4 solving tiles are removed from the grid).

The 12 remaining tiles need to FLIP from their pre-solve positions to their new natural positions in the shorter grid. There are two groups with different "from" positions.

### Group 1 — former top-row non-solving tiles
These were already animating a horizontal drift in Phase 1. Simply using `preFlipRects` (their static pre-solve position) as the FLIP origin would cause a visual jump back to their start before sliding forward again.

**The fix:** call `getBoundingClientRect()` *before* removing the Phase 1 animation class. This captures the tile's current visual position mid-flight. Then:
1. Remove `animate-tile-drift` → tile snaps back to natural layout position.
2. Measure natural position with `getBoundingClientRect()`.
3. Compute delta from mid-flight → natural position.
4. Apply `animate-tile-flip` with that delta.

Since this all happens inside `useLayoutEffect` (before paint), no visual jump occurs — the browser only ever sees the animation playing forward from the mid-flight position.

### Group 2 — all other remaining tiles
These haven't moved yet. Use `preFlipRects` snapshot as the "from" position, measure current natural position, apply FLIP normally.

---

## The FLIP Technique

FLIP = First, Last, Invert, Play.

For each tile:
```
fromX, fromY  = where the tile visually appears right now
toX,   toY    = where the browser naturally places it in the new DOM layout
--flip-x      = fromX - toX   (the inversion)
--flip-y      = fromY - toY
```

The `tile-flip-settle` keyframe animates *from* the inversion *to* `(0, 0)`:
```css
@keyframes tile-flip-settle {
  from { transform: translate(var(--flip-x), var(--flip-y)); }
  to   { transform: translate(0px, 0px); }
}
```

`animation-fill-mode: backwards` means the tile is immediately at the `from` state as soon as the class is applied — the browser never paints the layout-position, so there's no flash.

---

## `solvedAreaRef`

A `ref<HTMLDivElement>` created in `GameBoard` and attached to the solved-categories wrapper `<div>`. It's passed down to `PuzzleGrid` as a prop.

`solvedAreaRef.current.getBoundingClientRect().bottom` is used as the vertical target for Phase 1 drifting tiles. This is the only reliable way to know exactly where the next reveal row will appear, because the solved area grows as categories are revealed and the grid has a variable `space-y-4` gap above it.

---

## Files to Touch for Animation Changes

| File | What it controls |
|---|---|
| `globals.css` | Keyframe definitions + animation classes + durations |
| `components/solver/PuzzleGrid.tsx` | Phase 1/Phase 2 logic, delta math, CSS class application |
| `components/solver/SolvedCategory.tsx` | Reveal row entrance animation class |
| `hooks/useGameState.ts` | `COMPLETE_SOLVE_DELAY_MS`, `AUTO_SOLVE_DELAY_MS` timing constants |
| `components/solver/GameBoard.tsx` | `MODAL_DELAY_MS`, `solvedAreaRef` attachment |

**If you change animation durations in CSS, update the timing constants in `useGameState.ts` to match.**
