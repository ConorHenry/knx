import { NextRequest, NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { deserializeFieldId, type SuggestResult } from '@/lib/ai-mode-types';
import { DIFFICULTY_LABELS, type Difficulty } from '@/lib/types';

// ── Rate limiting (in-memory, resets on cold start) ───────────────────────────

const ipRequests = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipRequests.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRequests.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= 30) return true;
  entry.count++;
  return false;
}

// ── Overfetch multipliers ─────────────────────────────────────────────────────
// The API returns (needed × multiplier) values. Extras are cached client-side
// and served on repeat requests without hitting the model again.
// Tweak per prompt type as quality vs. spend tradeoffs become clear.

const OVERFETCH_MULTIPLIER: Record<string, number> = {
  P1: 3,
  P2: 3,
  P3: 3,
  P4: 3,
  P5: 3,
  P6: 1,   // coupled name+tile output — overfetch not applicable
  P6v: 1,  // same
};

// ── Request schema ────────────────────────────────────────────────────────────

const CategorySchema = z.object({
  id: z.string(),
  color: z.enum(['yellow', 'green', 'blue', 'purple']),
  name: z.string(),
  items: z.tuple([z.string(), z.string(), z.string(), z.string()]),
});

const RequestSchema = z.object({
  promptType: z.enum(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P6v']),
  targets: z.array(z.string()),   // serialized FieldIds to fill
  contexts: z.array(z.string()),  // serialized FieldIds to use as context
  categories: z.array(CategorySchema),
  exclude: z.array(z.string()).optional().default([]), // values already shown to user
});

// ── Output schema (consistent across all prompt types) ────────────────────────

const OutputSchema = z.object({
  values: z.array(z.string().min(1).max(60)),
});

// ── Model selection ───────────────────────────────────────────────────────────
// Swap CREATIVE_MODEL for a stronger model if red herring quality is lacking.

const FAST_MODEL = google('gemini-2.5-flash');
const CREATIVE_MODEL = google('gemini-2.5-flash');

function pickModel(promptType: string) {
  return ['P4', 'P5', 'P6v'].includes(promptType) ? CREATIVE_MODEL : FAST_MODEL;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `You are a puzzle designer helping create a NYT Connections puzzle.
The game shows 16 tiles in a 4×4 grid. Players must find 4 groups of 4 tiles that share a category.

Difficulty levels:
- Straightforward: obvious, everyday connection
- Moderate: requires thought, less obvious
- Tricky: designed to mislead players
- Devious: very subtle, often wordplay or a trick

Rules for good tiles: 1–4 words, unambiguous once you know the category, potentially misleading before you do.

Respond with ONLY valid JSON matching the requested format. No explanation or extra text.`;

// ── Context helpers ───────────────────────────────────────────────────────────

type CategoryInfo = z.infer<typeof CategorySchema>;

function getFieldValue(fieldIdStr: string, catMap: Map<string, CategoryInfo>): string {
  const f = deserializeFieldId(fieldIdStr);
  const cat = catMap.get(f.catId)!;
  return f.kind === 'name' ? cat.name : cat.items[f.index];
}

function difficultyLabel(color: Difficulty): string {
  return DIFFICULTY_LABELS[color];
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildPrompt(
  promptType: string,
  targets: string[],
  contexts: string[],
  catMap: Map<string, CategoryInfo>,
  exclude: string[],
): { prompt: string; expectedCount: number } {
  const overfetch = OVERFETCH_MULTIPLIER[promptType] ?? 1;
  const n = targets.length;

  // Classify contexts relative to the primary target category
  const primaryCatId = deserializeFieldId(targets[0]).catId;

  const sameCatTiles: string[] = [];
  let sameCatName: string | null = null;
  const crossCatGroups = new Map<string, { name: string; tiles: string[]; color: Difficulty }>();

  for (const ctxId of contexts) {
    const f = deserializeFieldId(ctxId);
    const value = getFieldValue(ctxId, catMap);
    if (f.catId === primaryCatId) {
      if (f.kind === 'name') sameCatName = value;
      else sameCatTiles.push(value);
    } else {
      const cat = catMap.get(f.catId)!;
      const group = crossCatGroups.get(f.catId) ?? { name: cat.name, tiles: [], color: cat.color };
      if (f.kind === 'name') group.name = value;
      else group.tiles.push(value);
      crossCatGroups.set(f.catId, group);
    }
  }

  const primaryCat = catMap.get(primaryCatId)!;
  const difficulty = difficultyLabel(primaryCat.color);
  const catName = sameCatName ?? primaryCat.name;

  // Cross-cat context formatted for prompts.
  // Single group → inline phrase. Multiple groups → numbered list.
  function crossCatDescription(): string {
    const groups = Array.from(crossCatGroups.values());
    return groups.map((g, i) => {
      const label = g.name ? `"${g.name}"` : `a ${difficultyLabel(g.color)} category`;
      const tiles = g.tiles.length > 0 ? ` (e.g. ${g.tiles.join(', ')})` : '';
      const entry = `${label}${tiles}`;
      return groups.length === 1 ? entry : `  ${i + 1}. ${entry}`;
    }).join(groups.length === 1 ? '' : '\n');
  }

  // Names of other already-filled categories in the puzzle (for name-distinctness check).
  const otherCatNames = Array.from(catMap.values())
    .filter(c => c.id !== primaryCatId && c.name.trim())
    .map(c => `"${c.name.trim()}"`);
  const distinctNote = otherCatNames.length > 0
    ? `\n\nThe new name must feel clearly different in theme from these other categories already in the puzzle: ${otherCatNames.join(', ')}`
    : '';

  // Exclusion note appended to prompts when the user has already seen some values
  const excludeNote = exclude.length > 0
    ? `\n\nDo not use any of these values (already shown to the user): ${exclude.join(', ')}`
    : '';

  const valuesPlaceholder = (count: number) =>
    Array.from({ length: count }, (_, i) => `"value${i + 1}"`).join(', ');

  switch (promptType) {
    case 'P1': {
      const total = 1 * overfetch;
      return {
        expectedCount: total,
        prompt: `Suggest ${total} category name${total > 1 ? 's' : ''} for a "${difficulty}" difficulty NYT Connections category.

Follow the style of real NYT Connections names, for example:
• "Words that follow FIRE"
• "Types of bridges"
• "Famous Marias"
• "___ ball"
• "Things found in a kitchen"

Each name must be distinct.${distinctNote}${excludeNote}

Return: { "values": [${valuesPlaceholder(total)}] } — exactly ${total} value${total > 1 ? 's' : ''}`,
      };
    }

    case 'P2': {
      const total = 1 * overfetch;
      const tiles = sameCatTiles.map(t => `• ${t}`).join('\n');
      return {
        expectedCount: total,
        prompt: `These tiles belong to the same "${difficulty}" difficulty NYT Connections category:
${tiles}

Suggest ${total} concise category name${total > 1 ? 's' : ''} that precisely capture${total === 1 ? 's' : ''} their connection. Each name must be distinct.${distinctNote}${excludeNote}

Return: { "values": [${valuesPlaceholder(total)}] } — exactly ${total} value${total > 1 ? 's' : ''}`,
      };
    }

    case 'P3': {
      const total = n * overfetch;
      const existingNote = sameCatTiles.length > 0
        ? `\nExisting tiles in this category: ${sameCatTiles.join(', ')}`
        : '';
      const diffNote = sameCatTiles.length > 0
        ? '\nEach suggestion must be different from the existing tiles.' : '';
      return {
        expectedCount: total,
        prompt: `NYT Connections category: "${catName}" (${difficulty})${existingNote}

Suggest ${total} tile${total > 1 ? 's' : ''} that clearly belong in this category.${diffNote} All suggestions must be distinct.${excludeNote}

Return: { "values": [${valuesPlaceholder(total)}] } — exactly ${total} value${total > 1 ? 's' : ''}`,
      };
    }

    case 'P4': {
      const total = n * overfetch;
      const sameCatNote = sameCatTiles.length > 0
        ? `\nOther tiles in this category: ${sameCatTiles.join(', ')}` : '';
      const crossCatCount = crossCatGroups.size;
      const redHerringInstruction = crossCatCount > 1
        ? `Could plausibly be mistaken for a tile from at least one of these categories:\n${crossCatDescription()}\n\nEach tile only needs to mislead toward one category — focus on the most convincing individual pairing rather than trying to satisfy all categories at once.`
        : `Could plausibly be confused with tiles from: ${crossCatDescription()}`;
      return {
        expectedCount: total,
        prompt: `NYT Connections category: "${catName}" (${difficulty})${sameCatNote}

Suggest ${total} tile${total > 1 ? 's' : ''} that:
1. Genuinely belong in "${catName}"
2. ${redHerringInstruction}

All suggestions must be distinct.${excludeNote}

Return: { "values": [${valuesPlaceholder(total)}] } — exactly ${total} value${total > 1 ? 's' : ''}`,
      };
    }

    case 'P5': {
      // Build per-category counts
      const catOrder: string[] = [];
      const baseCounts = new Map<string, number>();
      for (const t of targets) {
        const catId = deserializeFieldId(t).catId;
        if (!baseCounts.has(catId)) catOrder.push(catId);
        baseCounts.set(catId, (baseCounts.get(catId) ?? 0) + 1);
      }

      const totalPerCat = catOrder.map(id => (baseCounts.get(id)! * overfetch));
      const grandTotal = totalPerCat.reduce((a, b) => a + b, 0);

      const catDescriptions = catOrder.map((catId, i) => {
        const cat = catMap.get(catId)!;
        const base = baseCounts.get(catId)!;
        const total = base * overfetch;
        const existingTiles = cat.items.filter(Boolean);
        const tilesNote = existingTiles.length > 0 ? ` — existing tiles: ${existingTiles.join(', ')}` : '';
        return `${i + 1}. "${cat.name || '(unnamed)'}" (${difficultyLabel(cat.color)})${tilesNote} → suggest ${total} tile${total > 1 ? 's' : ''}`;
      }).join('\n');

      const groupNote = catOrder.map((catId, i) =>
        `${totalPerCat[i]} for category ${i + 1}`
      ).join(', ');

      return {
        expectedCount: grandTotal,
        prompt: `Suggest tiles for ${catOrder.length} different NYT Connections categories. The tiles should be mutual red herrings — each tile genuinely belongs in its own category, but could plausibly be mistaken for a tile from at least one other category listed here.

Important: each tile only needs to mislead toward one other category — focus on the most convincing individual pairing. Do not try to make every tile confusable with all categories at once; that produces weak suggestions.

${catDescriptions}

All suggestions within each category must be distinct.${excludeNote}

Return values grouped by category (all for category 1 first, then all for category 2, etc.):
Return: { "values": [${valuesPlaceholder(grandTotal)}] } — exactly ${grandTotal} values: ${groupNote}`,
      };
    }

    case 'P6': {
      const contextNote = sameCatTiles.length > 0
        ? `\nThe category must work with these existing tiles: ${sameCatTiles.join(', ')}` : '';
      const tileTargets = targets.filter(t => deserializeFieldId(t).kind === 'tile');
      const tileCount = tileTargets.length;
      const totalValues = 1 + tileCount; // name + tiles, no overfetch
      return {
        expectedCount: totalValues,
        prompt: `Create a new NYT Connections category (${difficulty} difficulty).${contextNote}${distinctNote}

Suggest:
• Line 1: a category name
• Lines 2–${totalValues}: ${tileCount} tile${tileCount > 1 ? 's' : ''} that belong in it${sameCatTiles.length > 0 ? ' (different from the existing tiles above)' : ''}

Return: { "values": ["category name", ${valuesPlaceholder(tileCount)}] } — exactly ${totalValues} values, name first`,
      };
    }

    case 'P6v': {
      const tileTargets = targets.filter(t => deserializeFieldId(t).kind === 'tile');
      const tileCount = tileTargets.length;
      const totalValues = 1 + tileCount; // name + all tile targets, no overfetch
      const tileLines = tileCount === 1
        ? '• Line 2: the red herring tile'
        : Array.from({ length: tileCount }, (_, i) => `• Line ${i + 2}: red herring tile ${i + 1}`).join('\n');
      const crossCatCount = crossCatGroups.size;
      const tileInstruction = crossCatCount > 1
        ? `Each tile must genuinely belong in the category and be a convincing red herring for at least one of these categories (each tile only needs to fool players toward one — pick the best individual pairing):\n${crossCatDescription()}`
        : `Each tile must genuinely belong in the category but could also be confused with tiles from: ${crossCatDescription()}`;
      return {
        expectedCount: totalValues,
        prompt: `Create a new NYT Connections category (${difficulty} difficulty).${distinctNote}

${tileInstruction}

Suggest:
• Line 1: a category name
${tileLines}

Return: { "values": ["category name", ${valuesPlaceholder(tileCount)}] } — exactly ${totalValues} values, name first`,
      };
    }

    default:
      throw new Error(`Unknown prompt type: ${promptType}`);
  }
}

// ── Split AI output into suggestions (current targets) + extras (for caching) ─

function splitResults(
  promptType: string,
  targets: string[],
  values: string[],
): SuggestResult {
  const overfetch = OVERFETCH_MULTIPLIER[promptType] ?? 1;

  // ── P5: values are grouped by category ──────────────────────────────────────
  if (promptType === 'P5') {
    const catOrder: string[] = [];
    const baseCounts = new Map<string, number>();
    for (const t of targets) {
      const catId = deserializeFieldId(t).catId;
      if (!baseCounts.has(catId)) catOrder.push(catId);
      baseCounts.set(catId, (baseCounts.get(catId) ?? 0) + 1);
    }

    const suggestions: Record<string, string> = {};
    const extrasByCat: Record<string, string[]> = {};
    let offset = 0;

    for (const catId of catOrder) {
      const base = baseCounts.get(catId)!;
      const total = base * overfetch;
      const slice = values.slice(offset, offset + total).filter(Boolean);
      offset += total;

      const catTargets = targets.filter(t => deserializeFieldId(t).catId === catId);
      catTargets.forEach((t, i) => {
        if (slice[i]) suggestions[t] = slice[i];
      });

      const catExtras = slice.slice(base);
      if (catExtras.length > 0) extrasByCat[catId] = catExtras;
    }

    return {
      suggestions,
      extrasByCat: Object.keys(extrasByCat).length > 0 ? extrasByCat : undefined,
    };
  }

  // ── P6 / P6v: name first, then tiles, no overfetch ──────────────────────────
  if (promptType === 'P6' || promptType === 'P6v') {
    const nameTarget = targets.find(t => deserializeFieldId(t).kind === 'name');
    const tileTargets = targets.filter(t => deserializeFieldId(t).kind === 'tile');
    const suggestions: Record<string, string> = {};
    if (nameTarget && values[0]) suggestions[nameTarget] = values[0];
    tileTargets.forEach((t, i) => {
      if (values[i + 1]) suggestions[t] = values[i + 1];
    });
    return { suggestions };
  }

  // ── P1 / P2: single name target ─────────────────────────────────────────────
  if (promptType === 'P1' || promptType === 'P2') {
    const suggestions: Record<string, string> = {};
    if (targets[0] && values[0]) suggestions[targets[0]] = values[0];
    const extras = values.slice(1).filter(Boolean);
    return { suggestions, extras: extras.length > 0 ? extras : undefined };
  }

  // ── P3 / P4: N tile targets, values in order ─────────────────────────────────
  const suggestions: Record<string, string> = {};
  targets.forEach((t, i) => {
    if (values[i]) suggestions[t] = values[i];
  });
  // First targets.length values → current targets; remainder → extras
  const extras = values.slice(targets.length).filter(Boolean);
  return { suggestions, extras: extras.length > 0 ? extras : undefined };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Parse and validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { promptType, targets, contexts, categories, exclude } = parsed.data;

  if (targets.length === 0) {
    return NextResponse.json({ error: 'No target fields provided' }, { status: 400 });
  }

  const catMap = new Map(categories.map(c => [c.id, c]));

  try {
    const { prompt, expectedCount } = buildPrompt(promptType, targets, contexts, catMap, exclude);
    const model = pickModel(promptType);

    const { object } = await generateObject({
      model,
      schema: OutputSchema,
      system: SYSTEM,
      prompt,
    });

    const values = object.values
      .map(v => v.trim())
      .filter(Boolean)
      .slice(0, expectedCount);

    if (values.length === 0) {
      return NextResponse.json({ error: 'No suggestions returned' }, { status: 500 });
    }

    const result = splitResults(promptType, targets, values);
    return NextResponse.json(result);

  } catch (err: unknown) {
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      console.error('[/api/ai/suggest] Error:', {
        name: e.name,
        message: e.message,
        statusCode: e.statusCode,
        url: e.url,
        responseBody: e.responseBody,
        reason: e.reason,
        errors: Array.isArray(e.errors)
          ? (e.errors as Record<string, unknown>[]).map((sub) => ({
              statusCode: sub.statusCode,
              message: sub.message,
              url: sub.url,
            }))
          : undefined,
      });
    } else {
      console.error('[/api/ai/suggest] Unknown error:', err);
    }
    return NextResponse.json({ error: 'Suggestion failed' }, { status: 500 });
  }
}
