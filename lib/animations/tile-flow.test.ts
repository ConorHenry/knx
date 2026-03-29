import { describe, it, expect } from 'vitest';
import { computeLPath, computeTileFlowPaths } from './tile-flow';

// Tile dimensions used throughout: 92×72 px tiles with 8 px gaps → stride 100×80.
const STRIDE = { w: 100, h: 80 };
const TILE_CONFIG = { tileW: 92, tileH: 72, gap: 8 };

// ── computeLPath ─────────────────────────────────────────────────────────────

describe('computeLPath – stationary tile', () => {
  it('returns a single keyframe at offset 0 when from === to', () => {
    const path = computeLPath({ row: 1, col: 2 }, { row: 1, col: 2 }, STRIDE, 'h-first');
    expect(path).toHaveLength(1);
    expect(path[0]).toEqual({ dx: 0, dy: 0, offset: 0 });
  });
});

describe('computeLPath – straight horizontal movement', () => {
  it('moves right: produces two keyframes, dy always 0', () => {
    const path = computeLPath({ row: 0, col: 0 }, { row: 0, col: 2 }, STRIDE, 'h-first');
    expect(path).toHaveLength(2);
    expect(path[0]).toEqual({ dx: 0, dy: 0, offset: 0 });
    expect(path[1]).toEqual({ dx: 200, dy: 0, offset: 1 });
  });

  it('moves left: negative dx', () => {
    const path = computeLPath({ row: 0, col: 3 }, { row: 0, col: 1 }, STRIDE, 'v-first');
    expect(path).toHaveLength(2);
    expect(path[1].dx).toBe(-200);
    expect(path[1].dy).toBe(0);
  });

  it('ignores preference for straight paths (preference is not consumed)', () => {
    const hPath = computeLPath({ row: 2, col: 1 }, { row: 2, col: 3 }, STRIDE, 'h-first');
    const vPath = computeLPath({ row: 2, col: 1 }, { row: 2, col: 3 }, STRIDE, 'v-first');
    expect(hPath).toEqual(vPath);
  });
});

describe('computeLPath – straight vertical movement', () => {
  it('moves up: negative dy', () => {
    const path = computeLPath({ row: 3, col: 1 }, { row: 1, col: 1 }, STRIDE, 'h-first');
    expect(path).toHaveLength(2);
    expect(path[1]).toEqual({ dx: 0, dy: -160, offset: 1 });
  });

  it('moves down: positive dy', () => {
    const path = computeLPath({ row: 0, col: 2 }, { row: 2, col: 2 }, STRIDE, 'v-first');
    expect(path).toHaveLength(2);
    expect(path[1]).toEqual({ dx: 0, dy: 160, offset: 1 });
  });
});

describe('computeLPath – L-shaped movement', () => {
  it('h-first: corner has finalDx and dy=0, then adds finalDy', () => {
    // from (2,0) → to (0,3): move right 3 cols, up 2 rows
    const path = computeLPath({ row: 2, col: 0 }, { row: 0, col: 3 }, STRIDE, 'h-first');
    expect(path).toHaveLength(3);
    expect(path[0]).toEqual({ dx: 0, dy: 0, offset: 0 });
    expect(path[1].dx).toBe(300);     // horizontal leg: 3 cols × 100
    expect(path[1].dy).toBe(0);
    expect(path[2]).toEqual({ dx: 300, dy: -160, offset: 1 });
  });

  it('v-first: corner has dx=0 and finalDy, then adds finalDx', () => {
    // from (2,0) → to (0,3): same deltas, but vertical first
    const path = computeLPath({ row: 2, col: 0 }, { row: 0, col: 3 }, STRIDE, 'v-first');
    expect(path).toHaveLength(3);
    expect(path[1].dx).toBe(0);
    expect(path[1].dy).toBe(-160);    // vertical leg: 2 rows × 80
    expect(path[2]).toEqual({ dx: 300, dy: -160, offset: 1 });
  });

  it('h-first corner offset equals legH / (legH + legV)', () => {
    // from (3,0) → to (0,2): dx=200 (legH), dy=-240 (legV)
    const path = computeLPath({ row: 3, col: 0 }, { row: 0, col: 2 }, STRIDE, 'h-first');
    expect(path[1].offset).toBeCloseTo(200 / (200 + 240));
  });

  it('v-first corner offset equals legV / (legH + legV)', () => {
    // from (3,0) → to (0,2): dx=200 (legH), dy=-240 (legV)
    const path = computeLPath({ row: 3, col: 0 }, { row: 0, col: 2 }, STRIDE, 'v-first');
    expect(path[1].offset).toBeCloseTo(240 / (200 + 240));
  });

  it('final keyframe always has offset 1', () => {
    const path = computeLPath({ row: 3, col: 3 }, { row: 0, col: 0 }, STRIDE, 'h-first');
    expect(path[path.length - 1].offset).toBe(1);
  });
});

// ── computeTileFlowPaths ──────────────────────────────────────────────────────

// Reference grid used by most tests below:
//
//   A B C D    (row 0)   — B is solving
//   E F G H    (row 1)   — G is solving
//   I J K L    (row 2)   — K is solving
//   M N O P    (row 3)   — N is solving
//
// Remaining 12 tiles in grid order: A C D E F H I J L M O P
// Their target positions in the 3×4 compact grid (row-major):
//   A(0,0) C(0,1) D(0,2) E(0,3)
//   F(1,0) H(1,1) I(1,2) J(1,3)
//   L(2,0) M(2,1) O(2,2) P(2,3)

const GRID16 = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'];
const REMAINING = ['A','C','D','E','F','H','I','J','L','M','O','P'];

describe('computeTileFlowPaths – structure', () => {
  it('returns one path per remaining tile in order', () => {
    const paths = computeTileFlowPaths({ remainingTiles: REMAINING, grid16: GRID16, ...TILE_CONFIG });
    expect(paths.map(p => p.tileId)).toEqual(REMAINING);
  });

  it('every path starts at { dx:0, dy:0, offset:0 }', () => {
    const paths = computeTileFlowPaths({ remainingTiles: REMAINING, grid16: GRID16, ...TILE_CONFIG });
    for (const { keyframes } of paths) {
      expect(keyframes[0]).toEqual({ dx: 0, dy: 0, offset: 0 });
    }
  });
});

describe('computeTileFlowPaths – individual tiles', () => {
  const paths = () =>
    computeTileFlowPaths({ remainingTiles: REMAINING, grid16: GRID16, ...TILE_CONFIG });

  it('A: already at target (0,0) → no movement', () => {
    const a = paths().find(p => p.tileId === 'A')!;
    expect(a.keyframes).toHaveLength(1);
  });

  it('C: (0,2) → (0,1) — moves 1 col left, straight', () => {
    const c = paths().find(p => p.tileId === 'C')!;
    expect(c.keyframes).toHaveLength(2);
    expect(c.keyframes[1]).toEqual({ dx: -100, dy: 0, offset: 1 });
  });

  it('D: (0,3) → (0,2) — moves 1 col left, straight', () => {
    const d = paths().find(p => p.tileId === 'D')!;
    expect(d.keyframes).toHaveLength(2);
    expect(d.keyframes[1]).toEqual({ dx: -100, dy: 0, offset: 1 });
  });

  it('E: (1,0) → (0,3) — L-shaped path (row and col both change)', () => {
    const e = paths().find(p => p.tileId === 'E')!;
    expect(e.keyframes).toHaveLength(3);
    expect(e.keyframes[2]).toEqual({ dx: 300, dy: -80, offset: 1 });
  });

  it('F: (1,1) → (1,0) — moves 1 col left, straight', () => {
    const f = paths().find(p => p.tileId === 'F')!;
    expect(f.keyframes).toHaveLength(2);
    expect(f.keyframes[1]).toEqual({ dx: -100, dy: 0, offset: 1 });
  });

  it('P: (3,3) → (2,3) — moves 1 row up, straight', () => {
    const p = paths().find(pt => pt.tileId === 'P')!;
    expect(p.keyframes).toHaveLength(2);
    expect(p.keyframes[1]).toEqual({ dx: 0, dy: -80, offset: 1 });
  });
});

describe('computeTileFlowPaths – turn alternation', () => {
  it('L-shaped paths alternate h-first / v-first starting from initialPreference', () => {
    const hPaths = computeTileFlowPaths({
      remainingTiles: REMAINING, grid16: GRID16, ...TILE_CONFIG,
      initialPreference: 'h-first',
    }).filter(p => p.keyframes.length === 3);

    const vPaths = computeTileFlowPaths({
      remainingTiles: REMAINING, grid16: GRID16, ...TILE_CONFIG,
      initialPreference: 'v-first',
    }).filter(p => p.keyframes.length === 3);

    // When initialPreference is h-first, the first L-path's corner has dy=0.
    expect(hPaths[0].keyframes[1].dy).toBe(0);
    // When initialPreference is v-first, the first L-path's corner has dx=0.
    expect(vPaths[0].keyframes[1].dx).toBe(0);
  });

  it('consecutive L-shaped paths have opposite corner orientations', () => {
    const lPaths = computeTileFlowPaths({
      remainingTiles: REMAINING, grid16: GRID16, ...TILE_CONFIG,
      initialPreference: 'h-first',
    }).filter(p => p.keyframes.length === 3);

    for (let i = 1; i < lPaths.length; i++) {
      const prev = lPaths[i - 1];
      const curr = lPaths[i];
      const prevIsHFirst = prev.keyframes[1].dy === 0;
      const currIsHFirst = curr.keyframes[1].dy === 0;
      expect(prevIsHFirst).not.toBe(currIsHFirst);
    }
  });
});

describe('computeTileFlowPaths – no solving tiles (full grid stays intact)', () => {
  it('all tiles already at target → all paths have length 1', () => {
    // When no tiles were solved, remainingTiles === grid16 and every tile is
    // already at its target position.
    const grid = ['A','B','C','D','E','F','G','H','I','J','K','L'];
    const paths = computeTileFlowPaths({
      remainingTiles: grid, grid16: grid, ...TILE_CONFIG,
    });
    for (const { keyframes } of paths) {
      expect(keyframes).toHaveLength(1);
    }
  });
});
