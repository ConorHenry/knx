'use client';

import { CreatorForm } from '@/components/creator/CreatorForm';

export default function CreatePage() {
  return (
    <main className="min-h-screen px-4 pt-3 pb-8 max-w-2xl mx-auto">
      <h1 className="text-lg sm:text-2xl font-bold mb-2">Create a Puzzle</h1>
      <CreatorForm />
    </main>
  );
}
