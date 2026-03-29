/**
 * Computes collision-aware animation routes for the remaining (non-solving) tiles
 * during Phase 1 of a solve animation.
 *
 * Classification is done in VISUAL (screen) space so that grid-horizontal tiles
 * (dRow=0) — which move both horizontally AND carry the containerShift vertically —
 * are treated as L-shaped and can be routed to avoid crossing other tiles.
 *
 * Guarantees for the common case (submitted tiles all in top row):
 *   All remaining tiles are vis-vertical or vis-still → zero movement → no collisions.
 *
 * For other configurations the algorithm resolves conflicts by flipping
 * vis-lshaped tiles between H-first and V-first until no pairwise conflicts remain.
 */

export interface RemainingTileRoute {
  tileId: string;
  /** Web Animations API keyframes. All tiles get ≥ 2 frames. */
  keyframes: Keyframe[];
}

export interface RemainingRoutesConfig {
  /** Current 16-tile grid in row-major order (includes solvingItems). */
  grid: string[];
  /** The 4 items being submitted. */
  solvingItems: string[];
  tileW: number;
  tileH: number;
  gap: number;
  /**
   * Predicted amount (px) the grid container shifts down when COMPLETE_SOLVE fires.
   * Baked into every tile's final dy so Phase 2 FLIP only corrects prediction error.
   */
  containerShift: number;
}

// ── Internal types ───────────────────────────────────────────────────────────

type VisualType = 'still' | 'vis-vertical' | 'vis-horizontal' | 'vis-lshaped';
type Orientation = 'h-first' | 'v-first';

interface TileData {
  tileId: string;
  // Grid coordinates
  curRow: number;
  curCol: number;
  targetRow: number;  // always ≤ curRow (compaction invariant)
  // Visual pixel displacements
  visualDx: number;   // = dCol * stride.w
  visualDy: number;   // = containerShift + dRow * stride.h
  // Classification
  visType: VisualType;
  orientation: Orientation | null;  // only for vis-lshaped
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

/** Pixel offset of this tile at time t ∈ [0,1], consistent with buildKeyframes. */
function pixelOffsetAt(tile: TileData, t: number): { dx: number; dy: number } {
  const { visualDx: vx, visualDy: vy } = tile;

  if (tile.visType !== 'vis-lshaped') {
    return { dx: vx * t, dy: vy * t };
  }

  const legH = Math.abs(vx);
  const legV = Math.abs(vy);
  const total = legH + legV;
  if (total < 0.5) return { dx: 0, dy: 0 };

  if (tile.orientation === 'v-first') {
    const co = legV / total;
    if (t <= co) {
      const p = co < 0.001 ? 1 : t / co;
      return { dx: 0, dy: vy * p };
    }
    const p = (t - co) / (1 - co);
    return { dx: vx * p, dy: vy };
  } else {
    // h-first
    const co = legH / total;
    if (t <= co) {
      const p = co < 0.001 ? 1 : t / co;
      return { dx: vx * p, dy: 0 };
    }
    const p = (t - co) / (1 - co);
    return { dx: vx, dy: vy * p };
  }
}

/**
 * Returns the screen-pixel position (relative to grid origin) of a tile at time t.
 * stride.h/w convert curRow/curCol to pixels.
 */
function screenPxAt(
  tile: TileData,
  t: number,
  stride: { w: number; h: number },
): { x: number; y: number } {
  const { dx, dy } = pixelOffsetAt(tile, t);
  return {
    x: tile.curCol * stride.w + dx,
    y: tile.curRow * stride.h + dy,
  };
}

/** True if two tiles' bounding boxes overlap at time t (< full stride apart). */
function overlapping(
  a: TileData,
  b: TileData,
  t: number,
  stride: { w: number; h: number },
): boolean {
  const pa = screenPxAt(a, t, stride);
  const pb = screenPxAt(b, t, stride);
  // Tiles overlap if centres are < one stride apart in both axes.
  // Using 0.9× stride as threshold leaves a small gap (avoids false positives
  // from tiles that end up exactly one stride apart at integer grid positions).
  return (
    Math.abs(pa.x - pb.x) < stride.w * 0.9 &&
    Math.abs(pa.y - pb.y) < stride.h * 0.9
  );
}

/**
 * Checks whether two tiles' animation paths conflict at any of STEPS samples.
 * Only meaningful for tiles where at least one is vis-lshaped.
 */
function pathsConflict(
  a: TileData,
  b: TileData,
  stride: { w: number; h: number },
  steps = 120,
): boolean {
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (overlapping(a, b, t, stride)) return true;
  }
  return false;
}

// ── Keyframe builder ─────────────────────────────────────────────────────────

function buildKeyframes(tile: TileData): Keyframe[] {
  const { visualDx: vx, visualDy: vy } = tile;
  const final = `translate(${vx}px,${vy}px)`;

  if (tile.visType !== 'vis-lshaped') {
    return [
      { transform: 'translate(0px,0px)', offset: 0 },
      { transform: final, offset: 1 },
    ];
  }

  const legH = Math.abs(vx);
  const legV = Math.abs(vy);
  const total = legH + legV;

  if (tile.orientation === 'v-first') {
    const co = legV / total;
    return [
      { transform: 'translate(0px,0px)', offset: 0 },
      { transform: `translate(0px,${vy}px)`, offset: co },
      { transform: final, offset: 1 },
    ];
  } else {
    const co = legH / total;
    return [
      { transform: 'translate(0px,0px)', offset: 0 },
      { transform: `translate(${vx}px,0px)`, offset: co },
      { transform: final, offset: 1 },
    ];
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

export function computeRemainingRoutes(
  config: RemainingRoutesConfig,
): RemainingTileRoute[] {
  const { grid, solvingItems, tileW, tileH, gap, containerShift } = config;
  const stride = { w: tileW + gap, h: tileH + gap };

  const solvingSet = new Set(solvingItems);
  const remainingOrder = grid.filter(t => !solvingSet.has(t));

  // ── Step 1: Build tile data ──────────────────────────────────────────────
  const tiles: TileData[] = remainingOrder.map((tileId, targetIdx) => {
    const curIdx = grid.indexOf(tileId);
    const curRow = Math.floor(curIdx / 4);
    const curCol = curIdx % 4;
    const targetRow = Math.floor(targetIdx / 4);
    const targetCol = targetIdx % 4;
    const dRow = targetRow - curRow;
    const dCol = targetCol - curCol;

    const visualDx = dCol * stride.w;
    const visualDy = containerShift + dRow * stride.h;

    const hasX = Math.abs(visualDx) > 0.5;
    const hasY = Math.abs(visualDy) > 0.5;

    let visType: VisualType;
    if (!hasX && !hasY) visType = 'still';
    else if (!hasX) visType = 'vis-vertical';
    else if (!hasY) visType = 'vis-horizontal';
    else visType = 'vis-lshaped';

    return {
      tileId,
      curRow, curCol,
      targetRow,
      visualDx, visualDy,
      visType,
      orientation: null,
    };
  });

  // ── Step 2: Assign orientations for vis-lshaped tiles ────────────────────
  //
  // Priority rules (applied in order):
  //   (a) Tiles targeting grid row 0 → H-first: the horizontal leg runs at
  //       the tile's natural screen-y (row 0 = y=0), which is clear of the
  //       y=containerShift zone where vis-horizontal tiles move.  V-first would
  //       place the horizontal leg exactly at y=containerShift, guaranteeing a
  //       conflict with any vis-horizontal tile from row 1.
  //   (b) Grid-horizontal tiles (dRow=0) → H-first by default: the horizontal
  //       movement is their primary displacement; containerShift drift is secondary.
  //   (c) All other vis-lshaped tiles → alternate H-first / V-first.
  let altPref: Orientation = 'h-first';
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (tile.visType !== 'vis-lshaped') continue;

    const dRow = tile.targetRow - tile.curRow;  // reconstruct; ≤ 0

    if (tile.targetRow === 0) {
      // (a) top-row: H-first to stay clear of vis-horizontal traffic at y=containerShift
      tile.orientation = 'h-first';
    } else if (dRow === 0) {
      // (b) grid-horizontal: H-first default
      tile.orientation = 'h-first';
    } else {
      // (c) alternating
      tile.orientation = altPref;
      altPref = altPref === 'h-first' ? 'v-first' : 'h-first';
    }
  }

  // ── Step 3: Collision resolution ─────────────────────────────────────────
  //
  // We check vis-lshaped tiles against ALL moving tiles (including vis-horizontal)
  // and flip orientations to resolve conflicts.  Tiles whose visualDy≈0 (i.e.,
  // vis-horizontal) cannot be helped by orientation changes; we never flip them.
  // All vis-lshaped tiles are eligible for flipping (no protected set).

  const moving = tiles.filter(t => t.visType !== 'still');

  for (let pass = 0; pass < 3; pass++) {
    let anyFlip = false;
    for (let i = 0; i < moving.length; i++) {
      for (let j = i + 1; j < moving.length; j++) {
        // Only worth checking if at least one tile is vis-lshaped (and can be flipped).
        const iLshaped = moving[i].visType === 'vis-lshaped';
        const jLshaped = moving[j].visType === 'vis-lshaped';
        if (!iLshaped && !jLshaped) continue;

        if (!pathsConflict(moving[i], moving[j], stride)) continue;

        // Flip the later tile (higher index) if it's lshaped; otherwise flip i.
        if (jLshaped) {
          moving[j].orientation =
            moving[j].orientation === 'h-first' ? 'v-first' : 'h-first';
          anyFlip = true;
        } else if (iLshaped) {
          moving[i].orientation =
            moving[i].orientation === 'h-first' ? 'v-first' : 'h-first';
          anyFlip = true;
        }
      }
    }
    if (!anyFlip) break;
  }

  // ── Step 4: Build keyframes ───────────────────────────────────────────────
  return tiles.map(tile => ({
    tileId: tile.tileId,
    keyframes: buildKeyframes(tile),
  }));
}
