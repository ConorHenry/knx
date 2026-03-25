import { type Category, DIFFICULTY_COLORS, DIFFICULTY_TEXT_COLORS } from '@/lib/types';

interface SolvedCategoryProps {
  category: Category;
}

export function SolvedCategory({ category }: SolvedCategoryProps) {
  const bg = DIFFICULTY_COLORS[category.color];
  const text = DIFFICULTY_TEXT_COLORS[category.color];

  return (
    <div
      className="rounded-xl flex flex-col items-center justify-center py-4 px-6 text-center animate-category-merge-in"
      style={{ backgroundColor: bg }}
      role="region"
      aria-label={`Solved category: ${category.name}`}
    >
      <p className="font-bold text-sm uppercase tracking-wider mb-1" style={{ color: text }}>
        {category.name}
      </p>
      <p className="text-sm" style={{ color: text }}>
        {category.items.join(', ')}
      </p>
    </div>
  );
}
