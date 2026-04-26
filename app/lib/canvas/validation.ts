import { z } from 'zod';
import {
  MAX_TEXT_LENGTH,
  MAX_CHECKLIST_ITEMS,
  MAX_STROKE_POINTS,
} from './types';

// ─── Board scoping ──────────────────────────────────────────

export const boardScopeSchema = z.enum(['day', 'month']);

export const scopeKeySchema = z.string().refine(
  (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{4}-\d{2}$/.test(v),
  { message: 'scopeKey must be YYYY-MM-DD or YYYY-MM' }
);

export const dayScopeKeySchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Day scope key must be YYYY-MM-DD'
);

export const monthScopeKeySchema = z.string().regex(
  /^\d{4}-\d{2}$/,
  'Month scope key must be YYYY-MM'
);

export const getBoardSchema = z.object({
  scope: boardScopeSchema,
  scopeKey: scopeKeySchema,
}).refine(
  (v) => {
    if (v.scope === 'day') return /^\d{4}-\d{2}-\d{2}$/.test(v.scopeKey);
    return /^\d{4}-\d{2}$/.test(v.scopeKey);
  },
  { message: 'scopeKey format must match scope (day=YYYY-MM-DD, month=YYYY-MM)' }
);

// ─── Element data ───────────────────────────────────────────

const textDataSchema = z.object({
  text: z.string().max(MAX_TEXT_LENGTH),
});

const checklistItemSchema = z.object({
  id: z.string(),
  text: z.string().max(1000),
  done: z.boolean(),
});

const checklistDataSchema = z.object({
  title: z.string().max(500),
  items: z.array(checklistItemSchema).max(MAX_CHECKLIST_ITEMS),
});

const strokePointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const strokeDataSchema = z.object({
  points: z.array(strokePointSchema).max(MAX_STROKE_POINTS),
  color: z.string().max(30),
  thickness: z.number().min(1).max(50),
});

// ─── Element CRUD ───────────────────────────────────────────

export const elementTypeSchema = z.enum(['text', 'checklist', 'stroke']);

const dataSchema = z.union([textDataSchema, checklistDataSchema, strokeDataSchema]);

export const createElementSchema = z.object({
  type: elementTypeSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(0),
  height: z.number().finite().min(0),
  zIndex: z.number().int(),
  data: dataSchema,
});

export const updateElementSchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().finite().min(0).optional(),
  height: z.number().finite().min(0).optional(),
  zIndex: z.number().int().optional(),
  data: dataSchema.optional(),
});

export const bulkSaveSchema = z.object({
  elements: z.array(
    z.object({
      id: z.number().int().optional(),
      type: elementTypeSchema,
      x: z.number().finite(),
      y: z.number().finite(),
      width: z.number().finite().min(0),
      height: z.number().finite().min(0),
      zIndex: z.number().int(),
      data: dataSchema,
    })
  ).max(500),
  deletedIds: z.array(z.number().int()).max(500).optional(),
});
