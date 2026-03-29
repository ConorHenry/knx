'use client';

import { useRef, useState } from 'react';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type FieldId, type AiFieldInfo } from '@/lib/ai-mode-types';

interface AiFieldChipProps {
  fieldId: FieldId;
  placeholder: string;
  fieldInfo: AiFieldInfo;
  onToggle: () => void;
  onClear: () => void;
}

export function AiFieldChip({
  placeholder,
  fieldInfo,
  onToggle,
  onClear,
}: AiFieldChipProps) {
  const [showClear, setShowClear] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { isTarget, isContext, displayValue, isSuggestion, isShaking, isSnapping } = fieldInfo;
  const isEmpty = !displayValue.trim();
  const hasContent = !isEmpty;

  // ── Clear button visibility ────────────────────────────────────────────────
  function handleMouseEnter() {
    if (hasContent) setShowClear(true);
  }
  function handleMouseLeave() {
    setShowClear(false);
  }
  function handleTouchStart() {
    if (!hasContent) return;
    longPressTimer.current = setTimeout(() => setShowClear(true), 500);
  }
  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  function handleClearClick(e: React.MouseEvent) {
    e.stopPropagation();
    setShowClear(false);
    onClear();
  }
  function handleClearTouch(e: React.TouchEvent) {
    e.stopPropagation();
    setShowClear(false);
    onClear();
  }

  return (
    <div
      className={cn(
        // Base layout
        'relative rounded-md h-9 px-3 flex items-center gap-1.5 text-sm',
        'transition-all duration-150 cursor-pointer select-none',
        // Unselected
        !fieldInfo.isSelected && [
          'border border-dashed',
          isEmpty
            ? 'border-border/50 bg-white/40 hover:border-border hover:bg-white/60'
            : 'border-border/70 bg-white/60 hover:border-border hover:bg-white/80',
        ],
        // Selected as target (empty or suggestion-pending) — indigo
        isTarget && 'border-2 border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200',
        // Selected as context (user-filled) — amber
        isContext && 'border-2 border-amber-400 bg-amber-50 ring-2 ring-amber-200',
        // Animations
        isShaking && 'animate-shake-fast',
        isSnapping && 'animate-snap-in',
      )}
      onClick={onToggle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
      role="button"
      aria-pressed={fieldInfo.isSelected}
    >
      {/* Field value or placeholder */}
      <span
        className={cn(
          'flex-1 truncate',
          isEmpty && 'text-muted-foreground/40 text-xs',
          isSuggestion && 'italic text-blue-600',
          !isSuggestion && !isEmpty && 'text-foreground',
        )}
      >
        {isEmpty ? placeholder : displayValue}
      </span>

      {/* Role indicator dot — indigo for target, amber for context */}
      {fieldInfo.isSelected && (
        <span
          className={cn(
            'size-1.5 rounded-full shrink-0',
            isTarget && 'bg-indigo-400',
            isContext && 'bg-amber-400',
          )}
        />
      )}

      {/* Clear button — appears on hover (desktop) or long-press (mobile) */}
      {showClear && (
        <button
          className={cn(
            'absolute -top-2 -right-2 z-10',
            'size-5 rounded-full flex items-center justify-center',
            'bg-foreground text-background shadow-sm',
            'hover:bg-foreground/80 transition-colors',
          )}
          onClick={handleClearClick}
          onTouchEnd={handleClearTouch}
          aria-label="Clear field"
        >
          <Delete className="size-3" />
        </button>
      )}
    </div>
  );
}
