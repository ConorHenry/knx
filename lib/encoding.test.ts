import { describe, it, expect } from 'vitest';
import { encodePuzzle, decodePuzzle } from './encoding';
import type { Puzzle } from './types';

const SAMPLE_PUZZLE: Puzzle = {
  categories: [
    { color: 'yellow', name: 'Shades of Blue', items: ['Azure', 'Cobalt', 'Navy', 'Teal'] },
    { color: 'green', name: 'Types of Fish', items: ['Bass', 'Trout', 'Perch', 'Pike'] },
    { color: 'blue', name: 'Dog Breeds', items: ['Poodle', 'Boxer', 'Hound', 'Lab'] },
    { color: 'purple', name: 'Famous Johns', items: ['Lennon', 'Adams', 'Muir', 'Wayne'] },
  ],
};

describe('encodePuzzle / decodePuzzle', () => {
  it('round-trips a standard puzzle', () => {
    const encoded = encodePuzzle(SAMPLE_PUZZLE);
    const decoded = decodePuzzle(encoded);
    expect(decoded).toEqual(SAMPLE_PUZZLE);
  });

  it('produces a URL-safe string (no +, /, =)', () => {
    const encoded = encodePuzzle(SAMPLE_PUZZLE);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('produces a reasonably short URL parameter (< 400 chars)', () => {
    const encoded = encodePuzzle(SAMPLE_PUZZLE);
    expect(encoded.length).toBeLessThan(400);
  });

  it('round-trips a puzzle with long category names and items', () => {
    const longPuzzle: Puzzle = {
      categories: [
        {
          color: 'yellow',
          name: 'Things that can follow "Sun"',
          items: ['Flower', 'Screen', 'Glasses', 'Rise'],
        },
        {
          color: 'green',
          name: 'Words before "Stone"',
          items: ['Cobble', 'Sand', 'Lime', 'Corner'],
        },
        {
          color: 'blue',
          name: 'Kinds of roll',
          items: ['Spring', 'Drum', 'Bread', 'Barrel'],
        },
        {
          color: 'purple',
          name: 'Compound words with "Black"',
          items: ['Board', 'Bird', 'Berry', 'Smith'],
        },
      ],
    };
    expect(decodePuzzle(encodePuzzle(longPuzzle))).toEqual(longPuzzle);
  });

  it('round-trips a puzzle with unicode characters', () => {
    const unicodePuzzle: Puzzle = {
      categories: [
        { color: 'yellow', name: 'Café Items', items: ['Café au lait', 'Crêpe', 'Éclair', 'Naïve'] },
        { color: 'green', name: 'Japanese Words', items: ['寿司', '刺身', '天ぷら', '味噌'] },
        { color: 'blue', name: 'Emoji Foods', items: ['🍕', '🍔', '🌮', '🍜'] },
        { color: 'purple', name: 'Special & Chars', items: ["Rock 'n' Roll", 'AC/DC', 'Tom & Jerry', 'R&B'] },
      ],
    };
    expect(decodePuzzle(encodePuzzle(unicodePuzzle))).toEqual(unicodePuzzle);
  });

  it('preserves all four difficulty colors', () => {
    const encoded = encodePuzzle(SAMPLE_PUZZLE);
    const decoded = decodePuzzle(encoded);
    expect(decoded.categories[0].color).toBe('yellow');
    expect(decoded.categories[1].color).toBe('green');
    expect(decoded.categories[2].color).toBe('blue');
    expect(decoded.categories[3].color).toBe('purple');
  });

  it('throws on empty string', () => {
    expect(() => decodePuzzle('')).toThrow();
  });

  it('throws on garbage input', () => {
    expect(() => decodePuzzle('not-a-valid-puzzle')).toThrow();
  });

  it('throws on wrong number of categories', () => {
    // Manually craft a serialized string with 3 categories
    import('fflate').then(({ deflateSync }) => {
      const raw = 'Y|Name|A|B|C|D~G|Name|A|B|C|D~B|Name|A|B|C|D';
      const bytes = new TextEncoder().encode(raw);
      const compressed = deflateSync(bytes, { level: 9 });
      const b64 = btoa(Array.from(compressed, (b) => String.fromCharCode(b)).join(''));
      const encoded = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      expect(() => decodePuzzle(encoded)).toThrow('expected 4 categories');
    });
  });
});
