import { z } from 'zod';

export const DifficultySchema = z.enum(['yellow', 'green', 'blue', 'purple']);

export const CategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(60),
  color: DifficultySchema,
  items: z.tuple([
    z.string().min(1, 'Item is required').max(40),
    z.string().min(1, 'Item is required').max(40),
    z.string().min(1, 'Item is required').max(40),
    z.string().min(1, 'Item is required').max(40),
  ]),
});

export const PuzzleSchema = z.object({
  categories: z.tuple([CategorySchema, CategorySchema, CategorySchema, CategorySchema]),
});

// API request schemas

export const SuggestItemsRequestSchema = z.object({
  categoryName: z.string().min(1).max(60),
  existingItems: z.array(z.string().max(40)).max(3),
});

export const SuggestNameRequestSchema = z.object({
  items: z.tuple([
    z.string().min(1).max(40),
    z.string().min(1).max(40),
    z.string().min(1).max(40),
    z.string().min(1).max(40),
  ]),
});

export type SuggestItemsRequest = z.infer<typeof SuggestItemsRequestSchema>;
export type SuggestNameRequest = z.infer<typeof SuggestNameRequestSchema>;
