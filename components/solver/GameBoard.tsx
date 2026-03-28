'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useGameState } from '@/hooks/useGameState';
import type { Puzzle } from '@/lib/types';
import { PuzzleGrid } from './PuzzleGrid';
import { SolvedCategory } from './SolvedCategory';
import { MistakeCounter } from './MistakeCounter';
import { GameOverModal } from './GameOverModal';
import { Button } from '@/components/ui/button';

interface GameBoardProps {
  puzzle: Puzzle;
}

// Delay before the win modal appears, giving the last SolvedCategory card
// time to animate in before the overlay covers everything.
const MODAL_DELAY_MS = 3600;

export function GameBoard({ puzzle }: GameBoardProps) {
  const {
    grid,
    selected,
    solvedColors,
    guesses,
    mistakesRemaining,
    status,
    lastGuessResult,
    shakeItems,
    solvingItems,
    toggleItem,
    submitGuess,
    shuffle,
    reset,
  } = useGameState(puzzle);

  // Solved categories in the order they were solved
  const solvedCategories = solvedColors.map(
    (color) => puzzle.categories.find((c) => c.color === color)!
  );

  // Ref to the solved-categories wrapper so PuzzleGrid can measure where
  // the next reveal row will appear (its bottom edge = target Y for drift).
  const solvedAreaRef = useRef<HTMLDivElement>(null);

  // Don't show the modal the instant status flips — give the final card
  // animation time to play. On loss, show immediately (no last card reveal).
  const [showModal, setShowModal] = useState(false);
  useEffect(() => {
    if (status === 'lost') {
      setShowModal(true);
      return;
    }
    if (status !== 'won') {
      setShowModal(false);
      return;
    }
    const timer = setTimeout(() => setShowModal(true), MODAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <main className="min-h-screen bg-white flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg space-y-4">
        {/* Header — includes link to creator */}
        <header className="text-center space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight">Clique</h1>
          <p className="text-sm text-muted-foreground">
            Group 16 items into 4 categories of 4.
          </p>
          <Link href="/create" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="mt-2">
              Create your own puzzle
            </Button>
          </Link>
        </header>

        {/* Solved categories (slide in from top) */}
        <div ref={solvedAreaRef} className="space-y-2">
          {solvedCategories.map((cat) => (
            <SolvedCategory key={cat.color} category={cat} />
          ))}
        </div>

        {/* Active grid */}
        {grid.length > 0 && (
          <PuzzleGrid
            grid={grid}
            selected={selected}
            shakeItems={shakeItems}
            solvingItems={solvingItems}
            solvedAreaRef={solvedAreaRef}
            lastGuessResult={lastGuessResult}
            onToggleItem={toggleItem}
          />
        )}

        {/* Controls */}
        {status === 'playing' && (
          <div className="flex items-center justify-between gap-3 pt-2">
            <MistakeCounter mistakesRemaining={mistakesRemaining} />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={shuffle}
                aria-label="Shuffle items"
              >
                Shuffle
              </Button>
              <Button
                size="sm"
                onClick={submitGuess}
                disabled={selected.size !== 4}
                aria-label="Submit guess"
              >
                Submit
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Game over overlay — delayed on win to let the final card animate in */}
      {showModal && (
        <GameOverModal
          status={status as 'won' | 'lost'}
          puzzle={puzzle}
          guesses={guesses}
          onReset={reset}
        />
      )}
    </main>
  );
}
