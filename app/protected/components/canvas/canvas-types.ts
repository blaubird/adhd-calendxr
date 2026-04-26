export type { 
  BoardScope, CanvasElementType, CanvasTool, CanvasBoard, 
  CanvasElement, CanvasElementData, TextData, ChecklistData, 
  ChecklistItem, StrokeData, StrokePoint, CreateElementPayload, UpdateElementPayload 
} from 'app/lib/canvas/types';

export { 
  CANVAS_WIDTH, CANVAS_HEIGHT, MIN_ZOOM, MAX_ZOOM, DEFAULT_ZOOM,
  CANVAS_GRID_SIZE,
  PEN_COLORS, DEFAULT_PEN_COLOR, PEN_THICKNESSES, DEFAULT_PEN_THICKNESS,
  ERASER_SIZES, DEFAULT_ERASER_RADIUS
} from 'app/lib/canvas/types';

// ─── Undo/Redo ──────────────────────────────────────────────
export type UndoAction = {
  type: 'create' | 'delete' | 'update' | 'move';
  elementId: number;
  before?: any;
  after?: any;
};
