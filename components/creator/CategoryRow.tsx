'use client';

import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { type CategoryDraft } from '@/hooks/usePuzzleCreator';
import {
  type Difficulty,
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS,
  DIFFICULTY_ORDER,
} from '@/lib/types';
import { type FieldId } from '@/lib/ai-mode-types';
import { type useAiMode } from '@/hooks/useAiMode';
import { AiFieldChip } from './AiFieldChip';
import { cn } from '@/lib/utils';

interface CategoryRowProps {
  category: CategoryDraft;
  errorItems: Set<string>;
  isAiMode: boolean;
  onNameChange: (name: string) => void;
  onItemChange: (index: number, value: string) => void;
  onColorChange: (color: Difficulty) => void;
  getFieldInfo: ReturnType<typeof useAiMode>['getFieldInfo'];
  onToggleField: (fieldId: FieldId) => void;
  onClearField: (fieldId: FieldId) => void;
}

export function CategoryRow({
  category,
  errorItems,
  isAiMode,
  onNameChange,
  onItemChange,
  onColorChange,
  getFieldInfo,
  onToggleField,
  onClearField,
}: CategoryRowProps) {
  const bgColor = DIFFICULTY_COLORS[category.color];
  const nameFieldId: FieldId = { kind: 'name', catId: category.id };

  return (
    <div
      className={cn(
        'rounded-xl p-4 space-y-3 transition-colors',
        isAiMode && 'opacity-90',
      )}
      style={{ backgroundColor: bgColor + '33' }}
    >
      {/* Header row: color picker + category name */}
      <div className="flex items-center gap-3">
        {/* Color picker — frozen in AI mode */}
        <Popover>
          <PopoverTrigger
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
              'border border-black/10 transition-opacity hover:opacity-80',
              isAiMode && 'pointer-events-none opacity-50',
            )}
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
        <div className="flex-1">
          {isAiMode ? (
            <AiFieldChip
              fieldId={nameFieldId}
              placeholder="Category name"
              fieldInfo={getFieldInfo(nameFieldId)}
              onToggle={() => onToggleField(nameFieldId)}
              onClear={() => onClearField(nameFieldId)}
            />
          ) : (
            <Input
              placeholder="Category name"
              value={category.name}
              onChange={(e) => onNameChange(e.target.value)}
              maxLength={60}
              className="bg-white/70"
              aria-label="Category name"
            />
          )}
        </div>
      </div>

      {/* Items grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {category.items.map((item, idx) => {
          const tileFieldId: FieldId = {
            kind: 'tile',
            catId: category.id,
            index: idx as 0 | 1 | 2 | 3,
          };

          if (isAiMode) {
            return (
              <AiFieldChip
                key={idx}
                fieldId={tileFieldId}
                placeholder={`Item ${idx + 1}`}
                fieldInfo={getFieldInfo(tileFieldId)}
                onToggle={() => onToggleField(tileFieldId)}
                onClear={() => onClearField(tileFieldId)}
              />
            );
          }

          const isDupe = Boolean(item.trim() && errorItems.has(item.trim().toLowerCase()));
          return (
            <Input
              key={idx}
              placeholder={`Item ${idx + 1}`}
              value={item}
              onChange={(e) => onItemChange(idx, e.target.value)}
              maxLength={40}
              className={
                isDupe
                  ? 'bg-white/70 border-destructive ring-1 ring-destructive'
                  : 'bg-white/70'
              }
              aria-label={`Item ${idx + 1}`}
            />
          );
        })}
      </div>
    </div>
  );
}
