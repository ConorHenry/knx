'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, AlertCircle, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CategoryRow } from './CategoryRow';
import { usePuzzleCreator } from '@/hooks/usePuzzleCreator';
import { useAiMode } from '@/hooks/useAiMode';
import { type FieldId } from '@/lib/ai-mode-types';
import { cn } from '@/lib/utils';

export function CreatorForm() {
  const {
    categories,
    isComplete,
    duplicateItems,
    shareUrl,
    setName,
    setItem,
    setColor,
  } = usePuzzleCreator();

  const aiMode = useAiMode(categories, setName, setItem);

  const [copied, setCopied] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (duplicateItems.size === 0) setShowErrors(false);
  }, [duplicateItems.size]);

  useEffect(() => {
    if (!aiMode.isActive) return;
    const allFilled = categories.every(
      (cat) => cat.name.trim() && cat.items.every((item) => item.trim())
    );
    if (allFilled) aiMode.exitAiMode();
  }, [categories, aiMode.isActive, aiMode.exitAiMode]);

  async function handleCopy() {
    if (!isComplete) return;
    if (duplicateItems.size > 0) {
      setShowErrors(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl!);
    } catch { /* clipboard blocked */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const hasDuplicates = isComplete && duplicateItems.size > 0;
  const errorItems = showErrors ? duplicateItems : new Set<string>();
  const hasUnpopulatedFields = categories.some(
    (cat) => !cat.name.trim() || cat.items.some((item) => !item.trim())
  );

  return (
    <div className="space-y-4">
      {categories.map((category) => (
        <CategoryRow
          key={category.id}
          category={category}
          errorItems={errorItems}
          isAiMode={aiMode.isActive}
          onNameChange={(name) => setName(category.id, name)}
          onItemChange={(index, value) => setItem(category.id, index, value)}
          onColorChange={(color) => setColor(category.id, color)}
          getFieldInfo={(fieldId: FieldId) => aiMode.getFieldInfo(fieldId)}
          onToggleField={(fieldId: FieldId) => aiMode.toggleField(fieldId)}
          onClearField={(fieldId: FieldId) => aiMode.clearField(fieldId)}
        />
      ))}

      {/* ── Bottom action area ──────────────────────────────────────────────── */}
      <div className="pt-2 flex flex-col items-center gap-3">

        {/* Button row — layout identical in both modes, nothing shifts */}
        <div className="flex items-center gap-2">

          {/* AI mode toggle — icon-only pill, always in this slot */}
          <button
            onClick={aiMode.isActive ? aiMode.exitAiMode : aiMode.enterAiMode}
            disabled={!hasUnpopulatedFields && !aiMode.isActive}
            aria-label={aiMode.isActive ? 'Exit AI mode' : 'Enter AI suggestion mode'}
            aria-pressed={aiMode.isActive}
            className={cn(
              'size-12 rounded-full flex items-center justify-center shrink-0',
              'border-2 transition-all duration-200 outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:opacity-40 disabled:pointer-events-none',
              aiMode.isActive
                ? 'bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-300/60 shadow-[0_0_18px_rgba(99,102,241,0.45)]'
                : 'bg-white border-border text-muted-foreground hover:border-indigo-300 hover:text-indigo-500 hover:shadow-[0_0_10px_rgba(99,102,241,0.15)]',
            )}
          >
            {/* key swap re-mounts the icon so the animation fires fresh on each toggle */}
            <Sparkles
              key={aiMode.isActive ? 'ai-on' : 'ai-off'}
              className={cn('w-5 h-5', aiMode.isActive && 'animate-sparkle-pop')}
            />
          </button>

          {/* Copy / Suggest — stacked in the same grid cell, fade-swap in place */}
          <div className="grid">
            {/* Copy button */}
            <div
              className={cn(
                'col-start-1 row-start-1 transition-opacity duration-150',
                aiMode.isActive ? 'opacity-0 pointer-events-none' : 'opacity-100',
              )}
            >
              <Button
                onClick={handleCopy}
                disabled={!isComplete}
                className={
                  hasDuplicates
                    ? 'ring-2 ring-destructive ring-offset-2 shadow-[0_0_12px_rgba(239,68,68,0.45)]'
                    : ''
                }
                size="lg"
              >
                {copied ? (
                  <><Check className="w-4 h-4" />Copied!</>
                ) : (
                  <>
                    {hasDuplicates ? <AlertCircle className="w-5 h-5" /> : <Copy className="w-4 h-4" />}
                    Copy share link
                  </>
                )}
              </Button>
            </div>

            {/* Suggest button */}
            <div
              className={cn(
                'col-start-1 row-start-1 transition-opacity duration-150',
                !aiMode.isActive ? 'opacity-0 pointer-events-none' : 'opacity-100',
              )}
            >
              <Button
                onClick={aiMode.triggerSuggest}
                disabled={!aiMode.scenario.canSuggest || aiMode.isLoading}
                size="lg"
              >
                {aiMode.isLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Thinking…</>
                ) : (
                  <><Sparkles className="w-4 h-4" />Suggest</>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Duplicate item error — only in normal mode */}
        {showErrors && duplicateItems.size > 0 && (
          <p className="text-sm text-destructive text-center">
            Remove duplicate items highlighted in red.
          </p>
        )}

        {/* Instruction bar — slides in below the button row when AI mode is active */}
        <div
          className={cn(
            'grid w-full transition-all duration-200',
            aiMode.isActive ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <div
              className={cn(
                'rounded-lg px-4 py-2.5 text-sm text-center',
                aiMode.error || aiMode.scenario.invalidMessage
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-indigo-50 text-indigo-700',
              )}
            >
              {aiMode.error ?? aiMode.scenario.invalidMessage ?? aiMode.scenario.instruction}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
