'use client';

import { useState } from 'react';
import { Wand2, Tag, Loader2, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { type CategoryDraft } from '@/hooks/usePuzzleCreator';
import { type Difficulty, DIFFICULTY_COLORS, DIFFICULTY_LABELS, DIFFICULTY_ORDER } from '@/lib/types';

interface CategoryRowProps {
  category: CategoryDraft;
  aiLoading: { categoryId: string; type: 'items' | 'name' } | null;
  errorItems: Set<string>;
  onNameChange: (name: string) => void;
  onItemChange: (index: number, value: string) => void;
  onColorChange: (color: Difficulty) => void;
  onSuggestItems: () => void;
  onSuggestName: () => Promise<string[]>;
  onApplyName: (name: string) => void;
}

export function CategoryRow({
  category,
  aiLoading,
  errorItems,
  onNameChange,
  onItemChange,
  onColorChange,
  onSuggestItems,
  onSuggestName,
  onApplyName,
}: CategoryRowProps) {
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [nameSuggestOpen, setNameSuggestOpen] = useState(false);

  const isLoadingItems =
    aiLoading?.categoryId === category.id && aiLoading.type === 'items';
  const isLoadingName =
    aiLoading?.categoryId === category.id && aiLoading.type === 'name';

  async function handleSuggestName() {
    const suggestions = await onSuggestName();
    if (suggestions.length > 0) {
      setNameSuggestions(suggestions);
      setNameSuggestOpen(true);
    }
  }

  const bgColor = DIFFICULTY_COLORS[category.color];

  return (
    <div
      className="rounded-xl p-4 space-y-3 transition-colors"
      style={{ backgroundColor: bgColor + '33' }}
    >
      {/* Header row: color picker + category name */}
      <div className="flex items-center gap-3">
        {/* Color picker */}
        <Popover>
          <PopoverTrigger
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border border-black/10 transition-opacity hover:opacity-80"
            style={{ backgroundColor: bgColor }}
            aria-label={`Difficulty: ${DIFFICULTY_LABELS[category.color]}`}
          >
            <span
              className="w-3 h-3 rounded-full border border-black/20"
              style={{ backgroundColor: bgColor }}
            />
            {DIFFICULTY_LABELS[category.color]}
            <ChevronDown className="w-3 h-3" />
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1">
            {DIFFICULTY_ORDER.map((diff) => (
              <button
                key={diff}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors"
                onClick={() => onColorChange(diff)}
              >
                <span
                  className="w-4 h-4 rounded-full border border-black/20"
                  style={{ backgroundColor: DIFFICULTY_COLORS[diff] }}
                />
                {DIFFICULTY_LABELS[diff]}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Category name */}
        <div className="flex-1 flex items-center gap-2">
          <Input
            placeholder="Category name"
            value={category.name}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={60}
            className="flex-1 bg-white/70"
            aria-label="Category name"
          />
          <Popover open={nameSuggestOpen} onOpenChange={setNameSuggestOpen}>
            <PopoverTrigger
              onClick={handleSuggestName}
              disabled={
                isLoadingName ||
                category.items.filter((i) => i.trim()).length < 4
              }
              aria-label="Suggest category name with AI"
              className="inline-flex items-center justify-center size-8 rounded-lg border border-border bg-white/70 hover:bg-muted transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              {isLoadingName ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Tag className="w-4 h-4" />
              )}
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2 space-y-1">
              <p className="text-xs text-muted-foreground mb-2 px-1">AI suggestions:</p>
              {nameSuggestions.map((s, i) => (
                <button
                  key={i}
                  className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors"
                  onClick={() => {
                    onApplyName(s);
                    setNameSuggestOpen(false);
                    setNameSuggestions([]);
                  }}
                >
                  {s}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Items row */}
      <div className="flex items-center gap-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
          {category.items.map((item, idx) => {
            const isDupe = item.trim() && errorItems.has(item.trim().toLowerCase());
            return (
              <Input
                key={idx}
                placeholder={`Item ${idx + 1}`}
                value={item}
                onChange={(e) => onItemChange(idx, e.target.value)}
                maxLength={40}
                className={isDupe ? 'bg-white/70 border-destructive ring-1 ring-destructive' : 'bg-white/70'}
                aria-label={`Item ${idx + 1}`}
              />
            );
          })}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={onSuggestItems}
          disabled={
            isLoadingItems ||
            !category.name.trim() ||
            category.items.every((i) => i.trim())
          }
          aria-label="Suggest items with AI"
          className="shrink-0 bg-white/70"
        >
          {isLoadingItems ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Wand2 className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
