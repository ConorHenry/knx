'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CategoryRow } from './CategoryRow';
import { usePuzzleCreator } from '@/hooks/usePuzzleCreator';

export function CreatorForm() {
  const {
    categories,
    aiLoading,
    aiError,
    isComplete,
    duplicateItems,
    shareUrl,
    setName,
    setItem,
    setColor,
    suggestItems,
    suggestName,
    applyNameSuggestion,
  } = usePuzzleCreator();

  const [copied, setCopied] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // Clear error highlights as soon as the duplicate is resolved.
  useEffect(() => {
    if (duplicateItems.size === 0) setShowErrors(false);
  }, [duplicateItems.size]);

  async function handleCopy() {
    if (!isComplete) return; // button is disabled — shouldn't reach here
    if (duplicateItems.size > 0) {
      setShowErrors(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl!);
    } catch {
      // Clipboard blocked — no-op
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const hasDuplicates = isComplete && duplicateItems.size > 0;
  const errorItems = showErrors ? duplicateItems : new Set<string>();

  return (
    <div className="space-y-4">
      {categories.map((category) => (
        <CategoryRow
          key={category.id}
          category={category}
          aiLoading={aiLoading}
          errorItems={errorItems}
          onNameChange={(name) => setName(category.id, name)}
          onItemChange={(index, value) => setItem(category.id, index, value)}
          onColorChange={(color) => setColor(category.id, color)}
          onSuggestItems={() =>
            suggestItems(
              category.id,
              category.name,
              category.items.filter((i) => i.trim())
            )
          }
          onSuggestName={() => suggestName(category.id, category.items)}
          onApplyName={(name) => applyNameSuggestion(category.id, name)}
        />
      ))}

      {aiError && (
        <p className="text-sm text-destructive">{aiError}</p>
      )}

      <div className="pt-2 flex flex-col items-center">
        <Button
          onClick={handleCopy}
          disabled={!isComplete}
          className={hasDuplicates ? 'ring-2 ring-destructive ring-offset-2 shadow-[0_0_12px_rgba(239,68,68,0.45)]' : ''}
          size="lg"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Copied!
            </>
          ) : (
            <>
              {hasDuplicates
                ? <AlertCircle className="w-6 h-6 mr-2" />
                : <Copy className="w-4 h-4 mr-2" />}
              Copy share link
            </>
          )}
        </Button>
        {showErrors && duplicateItems.size > 0 && (
          <p className="text-sm text-destructive mt-2 text-center">
            Remove duplicate items highlighted in red.
          </p>
        )}
      </div>
    </div>
  );
}
