'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { decodePuzzle } from '@/lib/encoding';
import { type Puzzle } from '@/lib/types';
import { GameBoard } from '@/components/solver/GameBoard';

// Hardcoded test puzzle — used when no ?p= param is present
const TEST_PUZZLE: Puzzle = {
  categories: [
    {
      color: 'yellow',
      name: 'Shades of Blue',
      items: ['Azure', 'Cobalt', 'Navy', 'Teal'],
    },
    {
      color: 'green',
      name: 'Types of Fish',
      items: ['Bass', 'Trout', 'Perch', 'Pike'],
    },
    {
      color: 'blue',
      name: 'Famous Johns',
      items: ['Lennon', 'Adams', 'Muir', 'Wayne'],
    },
    {
      color: 'purple',
      name: '_____ Jack',
      items: ['Cracker', 'Flapjack', 'Lumber', 'Steeplechase'],
    },
  ],
};

function PlayPageInner() {
  const searchParams = useSearchParams();
  const param = searchParams.get('p');

  let puzzle: Puzzle;
  let decodeError: string | null = null;

  if (param) {
    try {
      puzzle = decodePuzzle(param);
    } catch {
      decodeError = 'This puzzle link is invalid or corrupted.';
      puzzle = TEST_PUZZLE; // fallback for error UI
    }
  } else {
    puzzle = TEST_PUZZLE;
  }

  if (decodeError) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <p className="text-5xl mb-4">🔗</p>
          <h1 className="text-xl font-bold mb-2">Invalid Puzzle Link</h1>
          <p className="text-muted-foreground">{decodeError}</p>
        </div>
      </main>
    );
  }

  return <GameBoard puzzle={puzzle} />;
}

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading puzzle…</p></div>}>
      <PlayPageInner />
    </Suspense>
  );
}
