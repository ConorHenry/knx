import { deflateSync, inflateSync } from 'fflate';
import { type Puzzle, type Category, type Difficulty } from './types';

// Compact serialization: color|name|item1|item2|item3|item4
// Four rows joined by ~
// Color encoded as single char: Y/G/B/P

const COLOR_TO_CHAR: Record<Difficulty, string> = {
  yellow: 'Y',
  green: 'G',
  blue: 'B',
  purple: 'P',
};

const CHAR_TO_COLOR: Record<string, Difficulty> = {
  Y: 'yellow',
  G: 'green',
  B: 'blue',
  P: 'purple',
};

function serializePuzzle(puzzle: Puzzle): string {
  return puzzle.categories
    .map(
      (cat) =>
        [COLOR_TO_CHAR[cat.color], cat.name, ...cat.items].join('|')
    )
    .join('~');
}

function deserializePuzzle(raw: string): Puzzle {
  const rows = raw.split('~');
  if (rows.length !== 4) {
    throw new Error('Invalid puzzle: expected 4 categories');
  }

  const categories = rows.map((row) => {
    const parts = row.split('|');
    if (parts.length !== 6) {
      throw new Error('Invalid category: expected 6 parts');
    }
    const [colorChar, name, ...items] = parts;
    const color = CHAR_TO_COLOR[colorChar];
    if (!color) {
      throw new Error(`Invalid color char: ${colorChar}`);
    }
    if (items.length !== 4) {
      throw new Error('Invalid category: expected 4 items');
    }
    return { color, name, items } as Category;
  }) as [Category, Category, Category, Category];

  return { categories };
}

export function encodePuzzle(puzzle: Puzzle): string {
  const raw = serializePuzzle(puzzle);
  const bytes = new TextEncoder().encode(raw);
  const compressed = deflateSync(bytes, { level: 9 });
  // Base64URL encoding (no padding)
  const b64 = btoa(Array.from(compressed, (b) => String.fromCharCode(b)).join(''));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function decodePuzzle(param: string): Puzzle {
  // Base64URL decoding
  const b64 = param.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binaryStr = atob(padded);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const decompressed = inflateSync(bytes);
  const raw = new TextDecoder().decode(decompressed);
  return deserializePuzzle(raw);
}
