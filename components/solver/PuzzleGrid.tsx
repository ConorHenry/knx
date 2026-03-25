'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { GuessRecord } from '@/hooks/useGameState';

interface PuzzleGridProps {
  grid: string[];
  selected: Set<string>;
  shakeItems: string[];
  solvingItems: string[];
  /** Ref to the solved-categories wrapper; its bottom edge is the vertical
   *  target for drifting tiles (where the next reveal row will appear). */
  solvedAreaRef: React.RefObject<HTMLDivElement>;
  lastGuessResult: GuessRecord | null;
  onToggleItem: (item: string) => void;
}

type Delta = { dx: number; dy: number };

/**
 * All animation logic is applied via direct DOM mutation in useLayoutEffect
 * so we never cause extra React renders or lose animation-frame timing.
 *
 * Phase 1 (solvingItems becomes non-empty):
 *   • Solving tiles          → animate-tile-drift  (up + across to reveal-row slots)
 *   • Top-row non-solving    → animate-tile-drift  (horizontal only, to new column)
 *
 * Phase 2 (grid shrinks after COMPLETE_SOLVE):
 *   • Former top-row tiles   → cancel Phase 1 drift, FLIP from mid-animation position
 *   • All other remaining    → FLIP from preFlipRects (original position)
 */
export function PuzzleGrid({
  grid,
  selected,
  shakeItems,
  solvingItems,
  solvedAreaRef,
  lastGuessResult,
  onToggleItem,
}: PuzzleGridProps) {
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Snapshot of every tile's screen position taken at Phase 1 start.
  // Used as the "from" position for Group-2 (non-top-row) tiles in Phase 2.
  const preFlipRects = useRef<Map<string, DOMRect>>(new Map());

  // Which non-solving tiles were in the top row when Phase 1 started.
  // Phase 2 uses current getBoundingClientRect for these (mid-animation)
  // rather than preFlipRects, so the FLIP continues seamlessly.
  const phase1TopRowItems = useRef<Set<string>>(new Set());

  // Sentinels to detect Phase 1 / Phase 2 triggers on each render.
  const prevGridLen = useRef(grid.length);
  const prevSolvingLen = useRef(0);

  // Announce one-away feedback to screen readers
  useEffect(() => {
    if (lastGuessResult?.result === 'one-away' && feedbackRef.current) {
      feedbackRef.current.textContent = 'One away!';
      setTimeout(() => {
        if (feedbackRef.current) feedbackRef.current.textContent = '';
      }, 2000);
    }
  }, [lastGuessResult]);

  // ── Phase 1 ──────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (solvingItems.length === prevSolvingLen.current) return;
    prevSolvingLen.current = solvingItems.length;
    if (solvingItems.length === 0) return; // COMPLETE_SOLVE cleanup handled in Phase 2

    // Snapshot ALL tile positions before anything moves.
    const snapshot = new Map<string, DOMRect>();
    itemRefs.current.forEach((el, item) => snapshot.set(item, el.getBoundingClientRect()));
    preFlipRects.current = snapshot;

    // Measure tile dimensions from the first two tiles.
    const el0 = itemRefs.current.get(grid[0]);
    const el1 = itemRefs.current.get(grid[1]);
    if (!el0) return;
    const r0 = el0.getBoundingClientRect();
    const tileW = r0.width;
    const tileH = r0.height;
    const gap = el1 ? el1.getBoundingClientRect().left - (r0.left + tileW) : 8;

    // Vertical target: bottom of the solved-categories container = where the
    // next reveal row will appear.
    const solvedBottom = solvedAreaRef.current
      ? solvedAreaRef.current.getBoundingClientRect().bottom
      : r0.top;

    // ── Solving tiles: drift up + across to their assigned column slots ──────
    // Sort by current column so the leftmost solving tile gets column 0, etc.
    const sortedSolving = [...solvingItems].sort(
      (a, b) => (grid.indexOf(a) % 4) - (grid.indexOf(b) % 4),
    );
    sortedSolving.forEach((item, targetCol) => {
      const el = itemRefs.current.get(item);
      if (!el) return;
      const idx = grid.indexOf(item);
      const curCol = idx % 4;
      const curRow = Math.floor(idx / 4);
      const dx = (targetCol - curCol) * (tileW + gap);
      const dy = solvedBottom - (r0.top + curRow * (tileH + gap));
      el.style.setProperty('--drift-x', `${dx}px`);
      el.style.setProperty('--drift-y', `${dy}px`);
      el.classList.add('animate-tile-drift');
    });

    // ── Top-row non-solving tiles: drift horizontally to new column ───────────
    // After the 4 solving tiles are removed, the remaining tiles are re-indexed.
    // Non-solving top-row tiles always land in row 0 of the new grid (they have
    // the smallest new indices), so dy = 0 and only dx is needed.
    const remaining = grid.filter(item => !solvingItems.includes(item));
    const topRowNonSolving = grid.slice(0, 4).filter(item => !solvingItems.includes(item));
    phase1TopRowItems.current = new Set(topRowNonSolving);

    topRowNonSolving.forEach(item => {
      const el = itemRefs.current.get(item);
      if (!el) return;
      const oldCol = grid.indexOf(item) % 4; // always < 4 since they're in row 0
      const newIdx = remaining.indexOf(item);
      const newCol = newIdx % 4;
      const dx = (newCol - oldCol) * (tileW + gap);
      if (Math.abs(dx) < 0.5) return; // already in the right column
      el.style.setProperty('--drift-x', `${dx}px`);
      el.style.setProperty('--drift-y', '0px');
      el.classList.add('animate-tile-drift');
    });
  });

  // ── Phase 2 ──────────────────────────────────────────────────────────────
  // Fires when grid shrinks (COMPLETE_SOLVE removed the 4 solving tiles).
  useLayoutEffect(() => {
    if (grid.length >= prevGridLen.current) {
      prevGridLen.current = grid.length;
      return;
    }
    prevGridLen.current = grid.length;
    if (preFlipRects.current.size === 0) return;

    const deltas: Array<{ el: HTMLButtonElement; d: Delta }> = [];

    itemRefs.current.forEach((el, item) => {
      let fromX: number;
      let fromY: number;

      if (phase1TopRowItems.current.has(item)) {
        // Group 1: tile was animating in Phase 1.
        // Capture its CURRENT visual position (mid-animation) via getBoundingClientRect,
        // then cancel the Phase 1 drift so the tile is at its natural 12-tile position.
        const midAnim = el.getBoundingClientRect();
        el.classList.remove('animate-tile-drift');
        el.style.removeProperty('--drift-x');
        el.style.removeProperty('--drift-y');
        fromX = midAnim.left;
        fromY = midAnim.top;
      } else {
        // Group 2: tile hasn't moved yet — use the preFlipRects snapshot.
        const snap = preFlipRects.current.get(item);
        if (!snap) return;
        fromX = snap.left;
        fromY = snap.top;
      }

      const cur = el.getBoundingClientRect(); // natural position in the new 12-tile grid
      const dx = fromX - cur.left;
      const dy = fromY - cur.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        deltas.push({ el, d: { dx, dy } });
      }
    });

    preFlipRects.current = new Map();
    phase1TopRowItems.current = new Set();
    if (deltas.length === 0) return;

    // Apply before browser paint → tiles snap to from-positions, then animate.
    for (const { el, d } of deltas) {
      el.style.setProperty('--flip-x', `${d.dx}px`);
      el.style.setProperty('--flip-y', `${d.dy}px`);
      el.classList.add('animate-tile-flip');
    }

    // Clean up after animation completes (1020ms at 3×, 340ms at 1×)
    const cleanup = setTimeout(() => {
      for (const { el } of deltas) {
        el.classList.remove('animate-tile-flip');
        el.style.removeProperty('--flip-x');
        el.style.removeProperty('--flip-y');
      }
    }, 400);

    return () => clearTimeout(cleanup);
  });

  return (
    <div className="space-y-2">
      {/* One-away toast */}
      <div className="h-7 flex items-center justify-center">
        {lastGuessResult?.result === 'one-away' && (
          <p className="text-sm font-semibold bg-gray-800 text-white px-4 py-1 rounded-full animate-in fade-in zoom-in-95 duration-200">
            One away...
          </p>
        )}
        <p ref={feedbackRef} className="sr-only" aria-live="polite" />
      </div>

      {/* Grid */}
      <div
        className="grid grid-cols-4 gap-2"
        role="group"
        aria-label="Puzzle items — select 4 that belong together"
      >
        {grid.map((item) => {
          const isSelected = selected.has(item);
          const isShaking = shakeItems.includes(item);
          const isSolving = solvingItems.includes(item);

          return (
            <button
              key={item}
              ref={(el) => {
                if (el) itemRefs.current.set(item, el);
                else itemRefs.current.delete(item);
              }}
              onClick={() => onToggleItem(item)}
              aria-pressed={isSelected}
              aria-label={item}
              className={cn(
                'rounded-xl p-3 font-bold text-sm uppercase tracking-wide text-center',
                'min-h-[72px] flex items-center justify-center select-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-900',
                isSolving
                  ? 'bg-gray-800 text-white'
                  : [
                      'transition-colors duration-150',
                      isSelected
                        ? 'bg-gray-800 text-white scale-95'
                        : 'bg-gray-200 text-gray-900 hover:bg-gray-300 active:scale-95',
                      isShaking && 'animate-shake',
                    ],
              )}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}
