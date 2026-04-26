// ─── Canvas Types ───────────────────────────────────────────
export type BoardScope = 'day' | 'month';
export type CanvasElementType = 'text' | 'checklist' | 'stroke';
export type CanvasTool = 'select' | 'text' | 'checklist' | 'pen' | 'eraser';

// ─── Board ──────────────────────────────────────────────────
export type CanvasBoard = {
  id: number;
  userId: number;
  scope: BoardScope;
  scopeKey: string; // "YYYY-MM-DD" or "YYYY-MM"
  createdAt: Date;
  updatedAt: Date;
};

// ─── Element data payloads ──────────────────────────────────
export type TextData = {
  text: string;
};

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type ChecklistData = {
  title: string;
  items: ChecklistItem[];
};

export type StrokePoint = {
  x: number;
  y: number;
};

export type StrokeData = {
  points: StrokePoint[];
  color: string;
  thickness: number;
};

export type CanvasElementData = TextData | ChecklistData | StrokeData;

// ─── Element ────────────────────────────────────────────────
export type CanvasElement = {
  id: number;
  boardId: number;
  type: CanvasElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  data: CanvasElementData;
  createdAt: Date;
  updatedAt: Date;
};

// ─── API payloads ───────────────────────────────────────────
export type CreateElementPayload = {
  type: CanvasElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  data: CanvasElementData;
};

export type UpdateElementPayload = Partial<{
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  data: CanvasElementData;
}>;

// ─── Canvas constants ───────────────────────────────────────
export const CANVAS_WIDTH = 5000;
export const CANVAS_HEIGHT = 5000;
export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 2;
export const DEFAULT_ZOOM = 1;
export const CANVAS_GRID_SIZE = 28;

export const PEN_COLORS = [
  '#ffffff',   // white
  '#ff96f5',   // pink
  '#67eb67',   // green
  '#38bdf8',   // cyan
  '#fbbf24',   // yellow
  '#c084fc',   // purple
] as const;

export const DEFAULT_PEN_COLOR = '#ff96f5';
export const PEN_THICKNESSES = [2, 4, 8] as const;
export const DEFAULT_PEN_THICKNESS = 4;
export const ERASER_SIZES = [
  { label: 'S', radius: 7 },
  { label: 'M', radius: 11 },
  { label: 'L', radius: 16 },
] as const;
export const DEFAULT_ERASER_RADIUS = 7;

// ─── Safety limits ──────────────────────────────────────────
export const MAX_TEXT_LENGTH = 10000;
export const MAX_CHECKLIST_ITEMS = 100;
export const MAX_STROKE_POINTS = 5000;
export const MAX_ELEMENTS_PER_BOARD = 500;
