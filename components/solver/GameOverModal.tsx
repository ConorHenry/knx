'use client';

import { type Puzzle, DIFFICULTY_COLORS } from '@/lib/types';
import { Button } from '@/components/ui/button';
import type { GuessRecord } from '@/hooks/useGameState';

interface GameOverModalProps {
  status: 'won' | 'lost';
  puzzle: Puzzle;
  guesses: GuessRecord[];
  onReset: () => void;
}

export function GameOverModal({ status, puzzle, guesses, onReset }: GameOverModalProps) {
  const won = status === 'won';

  // Build emoji grid for sharing (NYT-style)
  const colorEmoji: Record<string, string> = {
    yellow: '🟨',
    green: '🟩',
    blue: '🟦',
    purple: '🟪',
  };

  function itemToColor(item: string): string {
    for (const cat of puzzle.categories) {
      if (cat.items.includes(item)) return cat.color;
    }
    return '⬜';
  }

  const emojiGrid = guesses
    .map((g) => g.items.map((item) => colorEmoji[itemToColor(item)] ?? '⬜').join(''))
    .join('\n');

  async function copyResults() {
    const text = `Clique ${won ? '✅' : '❌'}\n\n${emojiGrid}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback: select text
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={won ? 'You won!' : 'Game over'}
    >
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-300">
        <div className="text-center">
          <p className="text-5xl mb-3">{won ? '🎉' : '😔'}</p>
          <h2 className="text-2xl font-bold mb-1">{won ? 'Brilliant!' : 'Better luck next time'}</h2>
          <p className="text-muted-foreground text-sm">
            {won
              ? `Solved in ${guesses.length} guess${guesses.length === 1 ? '' : 'es'}!`
              : 'Here are the categories:'}
          </p>
        </div>

        {/* Show all categories */}
        <div className="space-y-2">
          {puzzle.categories.map((cat) => (
            <div
              key={cat.color}
              className="rounded-lg px-4 py-3"
              style={{ backgroundColor: DIFFICULTY_COLORS[cat.color] }}
            >
              <p className="font-semibold text-sm">{cat.name}</p>
              <p className="text-sm opacity-80">{cat.items.join(', ')}</p>
            </div>
          ))}
        </div>

        {/* Emoji grid */}
        {guesses.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <p className="font-mono text-xl leading-6 whitespace-pre">{emojiGrid}</p>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={copyResults}
            aria-label="Copy results to clipboard"
          >
            Copy results
          </Button>
          <Button className="flex-1" onClick={onReset} aria-label="Play again">
            Play again
          </Button>
        </div>
      </div>
    </div>
  );
}
