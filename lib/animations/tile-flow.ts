/** A position in a CSS grid (0-based row and column). */
export type GridPos = { row: number; col: number };

/**
 * A 2-D pixel offset from a tile's natural layout position, optionally with
 * a normalised animation timeline position (0–1) for proportional pacing.
 */
export type PixelOffset = { dx: number; dy: number; offset?: number };

/** Whether to traverse the horizontal or vertical leg first on an L-path. */
export type TurnPreference = 'h-first' | 'v-first';

/** The animated path for one non-solving tile during Phase 1. */
export interface TileFlowPath {
  tileId: string;
  /**
   * Pixel-offset keyframes, always starting at { dx: 0, dy: 0, offset: 0 }.
   * - Length 1 → tile is already at its target; no movement.
   * - Length 2 → straight horizontal or vertical movement.
   * - Length 3 → L-shaped movement with one right-angle turn.
   *
   * For L-shaped paths the middle keyframe's `offset` is set proportionally
   * to the fraction of total Manhattan distance covered by the first leg,
   * so both legs animate at the same pixel-per-ms rate.
   */
  keyframes: PixelOffset[];
}

export interface TileFlowConfig {
  /**
   * Non-solving tile IDs in their target order — i.e., the full grid array
   * with solving tiles filtered out.  A tile's index here determines its
   * target (row, col) in the new compact grid (same column count, one fewer row).
   */
  remainingTiles: string[];
  /**
   * All tile IDs in the current 4×4 grid, row-major (includes solving tiles).
   * A tile's index here determines its current (row, col).
   */
  grid16: string[];
  /** Rendered tile width in pixels. */
  tileW: number;
  /** Rendered tile height in pixels. */
  tileH: number;
  /** Gap between tiles in pixels. */
  gap: number;
  /**
   * Turn direction for the first L-shaped path encountered.
   * Alternates automatically for each subsequent L-shaped path.
   * Straight and stationary paths do not consume a turn-preference slot.
   * Defaults to 'h-first'.
   */
  initialPreference?: TurnPreference;
}

/**
 * Computes Phase 1 pixel-offset keyframes for every non-solving tile.
 *
 * Each tile animates along a Manhattan path (straight or L-shaped) from its
 * current position in the 4×4 grid to its target position in the compacted
 * grid.  L-shaped paths alternate between horizontal-first and vertical-first
 * turns to vary the visual texture of the movement.
 */
export function computeTileFlowPaths(config: TileFlowConfig): TileFlowPath[] {
  const {
    remainingTiles,
    grid16,
    tileW,
    tileH,
    gap,
    initialPreference = 'h-first',
  } = config;

  const stride = { w: tileW + gap, h: tileH + gap };
  let pref: TurnPreference = initialPreference;

  return remainingTiles.map((tileId, targetIdx) => {
    const currentIdx = grid16.indexOf(tileId);

    const from: GridPos = {
      row: Math.floor(currentIdx / 4),
      col: currentIdx % 4,
    };
    const to: GridPos = {
      row: Math.floor(targetIdx / 4),
      col: targetIdx % 4,
    };

    const keyframes = computeLPath(from, to, stride, pref);

    // Only L-shaped paths (tile must change both row and column) consume a
    // turn-preference slot; straight and stationary paths do not.
    if (from.row !== to.row && from.col !== to.col) {
      pref = pref === 'h-first' ? 'v-first' : 'h-first';
    }

    return { tileId, keyframes };
  });
}

/**
 * Returns pixel-offset keyframes for a tile moving from `from` to `to`.
 *
 * The first keyframe is always { dx: 0, dy: 0, offset: 0 } (the tile's
 * natural layout position).  For L-shaped paths the corner keyframe carries
 * a proportional `offset` so both legs run at the same pixel/ms rate.
 */
export function computeLPath(
  from: GridPos,
  to: GridPos,
  stride: { w: number; h: number },
  preference: TurnPreference,
): PixelOffset[] {
  const finalDx = (to.col - from.col) * stride.w;
  const finalDy = (to.row - from.row) * stride.h;

  // No movement needed.
  if (finalDx === 0 && finalDy === 0) {
    return [{ dx: 0, dy: 0, offset: 0 }];
  }

  // Straight horizontal or vertical — no turn required.
  if (finalDx === 0 || finalDy === 0) {
    return [
      { dx: 0, dy: 0, offset: 0 },
      { dx: finalDx, dy: finalDy, offset: 1 },
    ];
  }

  // L-shaped path.  The corner offset is proportional to the Manhattan
  // distance of the first leg so both legs run at the same pixel/ms speed.
  const legH = Math.abs(finalDx);
  const legV = Math.abs(finalDy);
  const total = legH + legV;
  const cornerOffset =
    preference === 'h-first' ? legH / total : legV / total;

  const corner: PixelOffset =
    preference === 'h-first'
      ? { dx: finalDx, dy: 0, offset: cornerOffset }       // horizontal leg first
      : { dx: 0, dy: finalDy, offset: cornerOffset };      // vertical leg first

  return [
    { dx: 0, dy: 0, offset: 0 },
    corner,
    { dx: finalDx, dy: finalDy, offset: 1 },
  ];
}
