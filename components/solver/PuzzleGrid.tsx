'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { GuessRecord } from '@/hooks/useGameState';
import { computeRemainingRoutes } from '@/lib/animations/remaining-tile-routes';

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

// ── Timing constants ──────────────────────────────────────────────────────────
// Total duration for individual tile rearrangement paths.
// Phase 1 prediction runs until COMPLETE_SOLVE fires; Phase 2 then takes over
// for the remaining ~680ms correction window. This must exceed
// COMPLETE_SOLVE_DELAY_MS or the handoff will visibly jump.
const REARRANGE_DURATION_MS = 1320;

// Cleanup margin after all animations finish.
const PHASE2_CLEANUP_BUFFER_MS = 400;

/**
 * All animation logic is applied via direct DOM mutation in useLayoutEffect /
 * Web Animations API so we never cause extra React renders.
 *
 * Phase 1 (solvingItems becomes non-empty):
 *   • Solving tiles     → CSS animate-tile-drift (up + across to reveal-row slots)
 *   • Non-solving tiles → start rearranging simultaneously:
 *       each tile moves along a v-first L-shaped path directly from its current
 *       position to its predicted target in the new compact grid.
 *       Vertical-first ordering causes top-row tiles to drop out of the way
 *       before sliding to their new columns.
 *
 * Phase 2 (COMPLETE_SOLVE shrinks the grid):
 *   • The grid container shifts down by containerShift and natural positions
 *     change.  Because this fires in useLayoutEffect (before paint) we cancel
 *     each rearrangement animation and restart it from the tile's current
 *     visual position toward its now-known actual natural CSS position.
 *     The user never sees a jump.
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
  // Acts as a sentinel (size > 0 = Phase 1 has run) for the Phase 2 guard.
  const preFlipRects = useRef<Map<string, DOMRect>>(new Map());

  // Bottom of the solved-categories area at Phase 1 start.
  const phase1SolvedBottom = useRef<number | null>(null);

  // Timestamp when Phase 1 started, used by Phase 2 to compute remaining time.
  const phase1StartTime = useRef<number | null>(null);

  // The containerShift prediction used when building Phase 1 keyframes.
  const predictedContainerShift = useRef<number>(0);

  // Running individual-rearrangement animations, keyed by tile ID.
  const rearrangeAnimations = useRef<Map<string, Animation>>(new Map());

  // Cleanup timer stored in a ref so React inter-render cleanups don't cancel it.
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sentinels to detect Phase 1 / Phase 2 triggers on each render.
  const prevGridLen = useRef(grid.length);
  const prevSolvingLen = useRef(0);

  // Cancel everything on unmount.
  useEffect(() => {
    return () => {
      if (cleanupTimerRef.current !== null) clearTimeout(cleanupTimerRef.current);
      rearrangeAnimations.current.forEach(anim => anim.cancel());
    };
  }, []);

  // Announce one-away feedback to screen readers.
  useEffect(() => {
    if (lastGuessResult?.result === 'one-away' && feedbackRef.current) {
      feedbackRef.current.textContent = 'One away!';
      setTimeout(() => {
        if (feedbackRef.current) feedbackRef.current.textContent = '';
      }, 2000);
    }
  }, [lastGuessResult]);

  // ── Phase 1 ──────────────────────────────────────────────────────────────
  // Solving tiles drift up; remaining tiles begin rearranging simultaneously.
  useLayoutEffect(() => {
    if (solvingItems.length === prevSolvingLen.current) return;
    prevSolvingLen.current = solvingItems.length;
    if (solvingItems.length === 0) return;

    // Cancel any leftover work from a previous solve cycle.
    if (cleanupTimerRef.current !== null) clearTimeout(cleanupTimerRef.current);
    rearrangeAnimations.current.forEach(anim => anim.cancel());
    rearrangeAnimations.current = new Map();

    // Snapshot ALL tile positions before anything moves.
    const snapshot = new Map<string, DOMRect>();
    itemRefs.current.forEach((el, item) => snapshot.set(item, el.getBoundingClientRect()));
    preFlipRects.current = snapshot;

    // Record solved area bottom and Phase 1 start time.
    phase1SolvedBottom.current =
      solvedAreaRef.current?.getBoundingClientRect().bottom ?? 0;
    phase1StartTime.current = Date.now();

    // Measure tile dimensions from the first two tiles.
    const el0 = itemRefs.current.get(grid[0]);
    const el1 = itemRefs.current.get(grid[1]);
    if (!el0) return;
    const r0 = el0.getBoundingClientRect();
    const tileW = r0.width;
    const tileH = r0.height;
    const gap = el1 ? el1.getBoundingClientRect().left - (r0.left + tileW) : 8;

    // Predict containerShift — height of the incoming solved-category row plus
    // the space-y-2 gap that separates non-first children.
    // If a solved row already exists, measure it directly; otherwise estimate
    // from tile height (no space-y-2 margin on the very first child).
    let predicted: number;
    if (solvedAreaRef.current && solvedAreaRef.current.children.length > 0) {
      const firstChild = solvedAreaRef.current.children[0] as HTMLElement;
      predicted = firstChild.getBoundingClientRect().height + gap;
    } else {
      predicted = tileH; // first solve: no space-y-2 margin on first child
    }
    predictedContainerShift.current = predicted;

    // Solving tiles: CSS drift up + across to their assigned column slots.
    const solvedBottom = phase1SolvedBottom.current;
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

    // Remaining tiles: animate to their predicted positions in the new compact
    // grid, simultaneously with the solving-tile drift.  Routes are computed
    // by computeRemainingRoutes which guarantees:
    //   • No two remaining tiles occupy the same cell at any point.
    //   • Tiles targeting row 0 use V-first paths (top row fills fast).
    //   • Other L-shaped tiles alternate H-first / V-first.
    const routes = computeRemainingRoutes({
      grid,
      solvingItems,
      tileW,
      tileH,
      gap,
      containerShift: predicted,
    });

    routes.forEach(({ tileId, keyframes }) => {
      const el = itemRefs.current.get(tileId);
      if (!el) return;
      const anim = el.animate(keyframes, {
        duration: REARRANGE_DURATION_MS,
        easing: 'ease-in-out',
        fill: 'forwards',
      });
      rearrangeAnimations.current.set(tileId, anim);
    });

    // Cleanup after all animations finish.
    cleanupTimerRef.current = setTimeout(() => {
      rearrangeAnimations.current.forEach(anim => anim.cancel());
      rearrangeAnimations.current = new Map();
    }, REARRANGE_DURATION_MS + PHASE2_CLEANUP_BUFFER_MS);
  });

  // ── Phase 2 correction ────────────────────────────────────────────────────
  // Fires when COMPLETE_SOLVE shrinks the grid, changing every remaining tile's
  // natural CSS position.  Running in useLayoutEffect (before paint) we cancel
  // each animation and immediately restart it from the tile's current visual
  // position toward its actual new natural position — no visible jump.
  useLayoutEffect(() => {
    if (grid.length >= prevGridLen.current) {
      prevGridLen.current = grid.length;
      return;
    }
    prevGridLen.current = grid.length;
    if (preFlipRects.current.size === 0) return;

    phase1SolvedBottom.current = null;

    const elapsed = Date.now() - (phase1StartTime.current ?? Date.now());
    const remainingTime = Math.max(REARRANGE_DURATION_MS - elapsed, 100);

    itemRefs.current.forEach((el, item) => {
      const runningAnim = rearrangeAnimations.current.get(item);
      if (!runningAnim) return;

      // Current visual position (includes running animation transform).
      // NOTE: COMPLETE_SOLVE has already mutated the DOM — the tile's CSS
      // natural position has shifted.  midAnim = (new CSS) + (Phase-1 transform),
      // not the pre-mutation visual position we want to start the correction from.
      const midAnim = el.getBoundingClientRect();
      runningAnim.cancel();
      rearrangeAnimations.current.delete(item);

      // New natural CSS position after COMPLETE_SOLVE re-render.
      const newNatural = el.getBoundingClientRect();

      // Phase-1 animation transform at this moment (direction-agnostic):
      //   animTransX = midAnim.left - newNatural.left
      // Pre-mutation visual position = preFlipRects (old CSS) + animTransX.
      // Correction must start there so the user sees no jump:
      //   fromTransX = preFlipRects.left + animTransX - newNatural.left
      //              = preFlipRects.left + midAnim.left - 2 * newNatural.left
      const preFlip = preFlipRects.current.get(item);
      const fromTransX =
        (preFlip?.left ?? newNatural.left) + midAnim.left - 2 * newNatural.left;
      const fromTransY =
        (preFlip?.top ?? newNatural.top) + midAnim.top - 2 * newNatural.top;

      if (Math.abs(fromTransX) <= 0.5 && Math.abs(fromTransY) <= 0.5) return;

      const corrAnim = el.animate(
        [
          { transform: `translate(${fromTransX}px, ${fromTransY}px)`, offset: 0 },
          { transform: 'translate(0px, 0px)', offset: 1 },
        ],
        { duration: remainingTime, easing: 'ease-out', fill: 'forwards' },
      );
      rearrangeAnimations.current.set(item, corrAnim);
    });

    preFlipRects.current = new Map();
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
