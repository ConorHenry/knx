'use client';

import { CreatorForm } from '@/components/creator/CreatorForm';

export default function CreatePage() {
  return (
    <main className="min-h-screen p-4 max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Create a Puzzle</h1>
      <CreatorForm />
    </main>
  );
}
