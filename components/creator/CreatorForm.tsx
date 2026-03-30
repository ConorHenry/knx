'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  const [buttonsVisible, setButtonsVisible] = useState(true);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [aiLayoutMode, setAiLayoutMode] = useState<'natural' | 'overlay-fixed' | 'overlay-scroll'>('natural');
  const [scrollableMaxHeight, setScrollableMaxHeight] = useState<number | null>(null);

  const lastFocusedFieldRef = useRef<FieldId | null>(null);
  const formContainerRef = useRef<HTMLDivElement>(null);
  const actionAreaRef = useRef<HTMLDivElement>(null);

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

  // IntersectionObserver: track whether the action area is in view
  useEffect(() => {
    const el = actionAreaRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setButtonsVisible(entry.isIntersecting),
      { threshold: 0.9 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Detect software keyboard via visualViewport
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function onResize() {
      setKeyboardOpen((vv!.height / window.innerHeight) < 0.75);
    }
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // AI mode layout: measure available space and choose natural / overlay-fixed / overlay-scroll
  useEffect(() => {
    if (!aiMode.isActive) {
      document.documentElement.style.overflow = '';
      setAiLayoutMode('natural');
      setScrollableMaxHeight(null);
      return;
    }

    const formEl = formContainerRef.current;
    const actionEl = actionAreaRef.current;
    if (!formEl || !actionEl) return;

    const viewportH = window.innerHeight;
    const totalPageH = document.documentElement.scrollHeight;

    if (viewportH >= totalPageH) {
      // Everything fits on screen without scrolling — no overlay needed
      setAiLayoutMode('natural');
      return;
    }

    // Estimated AI overlay height: gradient (32px) + button row (~48px) + padding top/bottom (28px)
    const overlayH = 110;
    // Use page-relative top (not viewport-relative) so the calculation is correct
    // regardless of where the user has scrolled before entering AI mode.
    const formTopFromPageTop = formEl.getBoundingClientRect().top + window.scrollY;
    const availH = viewportH - overlayH - formTopFromPageTop;
    // Category rows only (exclude action area, which will be hidden by the overlay)
    const rowsH = formEl.offsetHeight - actionEl.offsetHeight;

    // Scroll to top first so the title stays visible, then lock to prevent page scrolling.
    window.scrollTo(0, 0);
    document.documentElement.style.overflow = 'hidden';

    if (availH >= rowsH) {
      setAiLayoutMode('overlay-fixed');
      setScrollableMaxHeight(null);
    } else {
      setAiLayoutMode('overlay-scroll');
      setScrollableMaxHeight(availH);
    }

    return () => { document.documentElement.style.overflow = ''; };
  }, [aiMode.isActive]);

  const handleFieldFocus = useCallback((fieldId: FieldId) => {
    lastFocusedFieldRef.current = fieldId;
  }, []);

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
  const showNormalOverlay = !aiMode.isActive && !buttonsVisible && !keyboardOpen;
  const showAiOverlay = aiMode.isActive && aiLayoutMode !== 'natural';
  const showOverlay = showNormalOverlay || showAiOverlay;

  return (
    <>
      {/* ── Fixed top overlay — message bar that overlaps the title area ── */}
      <div
        aria-hidden="true"
        className={cn(
          'fixed top-0 left-0 right-0 z-40 flex flex-col pointer-events-none',
          'transition-all duration-200',
          (showAiOverlay || (showNormalOverlay && showErrors && duplicateItems.size > 0))
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-2',
        )}
      >
        {/* Content bar */}
        <div className="flex justify-center px-4">
          <div className={cn(
            'w-full max-w-2xl backdrop-blur-sm py-2 px-4',
            showAiOverlay
              ? (aiMode.error || aiMode.scenario.invalidMessage
                  ? 'bg-destructive/10'
                  : 'bg-indigo-50/95')
              : 'bg-background/95',
          )}>
            <p className={cn(
              'text-sm text-center',
              showAiOverlay && !aiMode.error && !aiMode.scenario.invalidMessage
                ? 'text-indigo-700'
                : 'text-destructive',
            )}>
              {showAiOverlay
                ? (aiMode.error ?? aiMode.scenario.invalidMessage ?? aiMode.scenario.instruction)
                : 'Remove duplicate items highlighted in red.'
              }
            </p>
          </div>
        </div>
        {/* Soft gradient feather */}
        <div className={cn(
          'h-8 bg-gradient-to-b to-transparent',
          showAiOverlay
            ? (aiMode.error || aiMode.scenario.invalidMessage
                ? 'from-destructive/10'
                : 'from-indigo-50/95')
            : 'from-background/95',
        )} />
      </div>

      <div
        ref={formContainerRef}
        className="space-y-4"
        style={
          aiLayoutMode === 'overlay-scroll' && scrollableMaxHeight !== null
            ? { maxHeight: scrollableMaxHeight, overflowY: 'auto' as const }
            : undefined
        }
      >
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
            onFieldFocus={handleFieldFocus}
          />
        ))}

        {/* ── Bottom action area ──────────────────────────────────────────────── */}
        <div
          ref={actionAreaRef}
          className={cn(
            'pt-2 flex flex-col items-center gap-3',
            showNormalOverlay && 'invisible pointer-events-none',
            showAiOverlay && 'hidden',
          )}
        >

          {/* Button row — layout identical in both modes, nothing shifts */}
          <div className="flex items-center gap-2">

            {/* AI mode toggle — icon-only pill, always in this slot */}
            <button
              onClick={aiMode.isActive
                ? aiMode.exitAiMode
                : () => aiMode.enterAiMode(lastFocusedFieldRef.current ?? undefined)
              }
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

      {/* ── Floating overlay — normal mode: AI toggle + Copy; AI mode: exit + Suggest ── */}
      <div
        aria-hidden="true"
        className={cn(
          'fixed bottom-0 left-0 right-0 z-40 flex flex-col',
          'transition-all duration-200',
          showOverlay
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none',
        )}
      >
        {/* Soft gradient feather — blends content into the overlay */}
        <div className="h-8 bg-gradient-to-b from-transparent to-background pointer-events-none" />
        {/* Content bar */}
        <div className="bg-background px-4 pb-6 pt-1 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            {/* AI toggle — shows active state in AI overlay, inactive in normal overlay */}
            <button
              onClick={showAiOverlay
                ? aiMode.exitAiMode
                : () => aiMode.enterAiMode(lastFocusedFieldRef.current ?? undefined)
              }
              tabIndex={showOverlay ? 0 : -1}
              aria-label={showAiOverlay ? 'Exit AI mode' : 'Enter AI suggestion mode'}
              className={cn(
                'size-12 rounded-full flex items-center justify-center shrink-0',
                'border-2 transition-all duration-200 outline-none',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                showAiOverlay
                  ? 'bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-300/60 shadow-[0_0_18px_rgba(99,102,241,0.45)]'
                  : 'bg-white border-border text-muted-foreground hover:border-indigo-300 hover:text-indigo-500 hover:shadow-[0_0_10px_rgba(99,102,241,0.15)]',
              )}
            >
              <Sparkles
                key={showAiOverlay ? 'ai-on' : 'ai-off'}
                className={cn('w-5 h-5', showAiOverlay && 'animate-sparkle-pop')}
              />
            </button>

            {/* Suggest (AI mode) or Copy (normal mode) */}
            {showAiOverlay ? (
              <Button
                onClick={aiMode.triggerSuggest}
                disabled={!aiMode.scenario.canSuggest || aiMode.isLoading}
                tabIndex={showOverlay ? 0 : -1}
                size="lg"
              >
                {aiMode.isLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Thinking…</>
                  : <><Sparkles className="w-4 h-4" />Suggest</>
                }
              </Button>
            ) : (
              <Button
                onClick={handleCopy}
                disabled={!isComplete}
                tabIndex={showOverlay ? 0 : -1}
                className={hasDuplicates ? 'ring-2 ring-destructive ring-offset-2 shadow-[0_0_12px_rgba(239,68,68,0.45)]' : ''}
                size="lg"
              >
                {copied
                  ? <><Check className="w-4 h-4" />Copied!</>
                  : <>{hasDuplicates ? <AlertCircle className="w-5 h-5" /> : <Copy className="w-4 h-4" />}Copy share link</>
                }
              </Button>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
