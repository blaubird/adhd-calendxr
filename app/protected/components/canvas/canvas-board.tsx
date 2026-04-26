'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { CanvasElement, CanvasElementData, CanvasTool, StrokeData, StrokePoint } from './canvas-types';
import { CANVAS_GRID_SIZE, MIN_ZOOM, MAX_ZOOM } from './canvas-types';
import { TextElement } from './text-element';
import { ChecklistElement } from './checklist-element';
import { StrokeLayer } from './stroke-layer';

type Props = {
  elements: CanvasElement[];
  tool: CanvasTool;
  penColor: string;
  penThickness: number;
  eraserRadius: number;
  zoom: number;
  onZoomChange: (z: number) => void;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onAddElement: (type: 'text' | 'checklist' | 'stroke', x: number, y: number, data: CanvasElementData, w?: number, h?: number) => Promise<CanvasElement | null>;
  onUpdateElement: (id: number, updates: Partial<CanvasElement>) => void;
  onMoveElement: (id: number, x: number, y: number) => void;
  onRemoveElement: (id: number) => void;
  onSplitStroke?: (id: number, segments: StrokeData[]) => void;
  loading: boolean;
  pan: { x: number; y: number };
  onPanChange: (pan: { x: number; y: number }) => void;
};

export function CanvasBoard(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Drawing state
  const [drawingPoints, setDrawingPoints] = useState<StrokePoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // Eraser state
  const [isErasing, setIsErasing] = useState(false);
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number } | null>(null);
  const erasedStrokeIds = useRef<Set<number>>(new Set());

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, elX: 0, elY: 0 });
  const dragElementId = useRef<number | null>(null);

  const { pan } = props;

  // Convert screen coords to board coords
  const screenToBoard = useCallback((screenX: number, screenY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (screenX - rect.left - pan.x) / props.zoom,
      y: (screenY - rect.top - pan.y) / props.zoom,
    };
  }, [pan, props.zoom]);

  // Wheel zoom — centered on pointer
  const { zoom, onZoomChange, onPanChange } = props;
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const delta = Math.max(-120, Math.min(120, e.deltaY));
      const scaleDelta = Math.exp(-delta * 0.0018);
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * scaleDelta));
      if (newZoom === zoom) return;

      // Adjust pan so the point under the cursor stays fixed
      const scale = newZoom / zoom;
      const newPanX = mx - (mx - pan.x) * scale;
      const newPanY = my - (my - pan.y) * scale;

      onZoomChange(newZoom);
      onPanChange({ x: newPanX, y: newPanY });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [zoom, onZoomChange, pan, onPanChange]);

  // ─── Partial eraser helpers ────────────────────────────────
  const { elements: allElements, onRemoveElement, onUpdateElement, onAddElement, eraserRadius } = props;
  const eraseAtPoint = useCallback((boardPt: StrokePoint) => {
    const strokes = allElements.filter(el => el.type === 'stroke');
    for (const stroke of strokes) {
      if (erasedStrokeIds.current.has(stroke.id)) continue;
      const sd = stroke.data as StrokeData;
      const segments = splitStrokeByEraser(sd.points, boardPt, eraserRadius);
      if (segments.length === 1 && segments[0].length === sd.points.length) continue;

      const remainingPointCount = segments.reduce((total, segment) => total + segment.length, 0);
      if (remainingPointCount < 2) {
        // Stroke too short — delete entirely
        erasedStrokeIds.current.add(stroke.id);
        onRemoveElement(stroke.id);
        continue;
      }

      if (segments.length === 0) {
        erasedStrokeIds.current.add(stroke.id);
        onRemoveElement(stroke.id);
      } else if (segments.length === 1) {
        // Update in place
        onUpdateElement(stroke.id, {
          data: { ...sd, points: segments[0] } as StrokeData,
        });
      } else {
        // Replace with first segment, add rest as new strokes
        erasedStrokeIds.current.add(stroke.id);
        onUpdateElement(stroke.id, {
          data: { ...sd, points: segments[0] } as StrokeData,
        });
        for (let i = 1; i < segments.length; i++) {
          onAddElement('stroke', 0, 0, {
            points: segments[i], color: sd.color, thickness: sd.thickness,
          } as StrokeData, 0, 0);
        }
      }
    }
  }, [allElements, onRemoveElement, onUpdateElement, onAddElement, eraserRadius]);

  // ─── Pointer handlers ─────────────────────────────────────
  const updateEraserCursor = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setEraserCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.cv-element')) return;

    const boardPos = screenToBoard(e.clientX, e.clientY);

    if (e.button === 1 || e.shiftKey) {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      return;
    }

    if (props.tool === 'pen') {
      setIsDrawing(true);
      setDrawingPoints([boardPos]);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      return;
    }

    if (props.tool === 'eraser') {
      updateEraserCursor(e);
      setIsErasing(true);
      erasedStrokeIds.current.clear();
      eraseAtPoint(boardPos);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      return;
    }

    if (props.tool === 'text') {
      props.onAddElement('text', boardPos.x, boardPos.y, { text: '' }, 220, 40);
      return;
    }

    if (props.tool === 'checklist') {
      props.onAddElement('checklist', boardPos.x, boardPos.y, {
        title: 'Checklist',
        items: [{ id: crypto.randomUUID(), text: '', done: false }],
      }, 240, 120);
      return;
    }

    // Select mode: pan
    if (props.tool === 'select') {
      props.onSelect(null);
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (props.tool === 'eraser') updateEraserCursor(e);

    if (isPanning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      props.onPanChange({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
      return;
    }

    if (isDrawing && props.tool === 'pen') {
      const pt = screenToBoard(e.clientX, e.clientY);
      setDrawingPoints(prev => [...prev, pt]);
      return;
    }

    if (isErasing && props.tool === 'eraser') {
      const pt = screenToBoard(e.clientX, e.clientY);
      eraseAtPoint(pt);
      return;
    }

    if (isDragging && dragElementId.current !== null) {
      const boardPos = screenToBoard(e.clientX, e.clientY);
      const dx = boardPos.x - dragStart.current.x;
      const dy = boardPos.y - dragStart.current.y;
      const newX = dragStart.current.elX + dx;
      const newY = dragStart.current.elY + dy;
      props.onUpdateElement(dragElementId.current, { x: newX, y: newY });
    }
  };

  const handlePointerUp = async () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isErasing) {
      setIsErasing(false);
      erasedStrokeIds.current.clear();
      return;
    }

    if (isDrawing && props.tool === 'pen' && drawingPoints.length > 1) {
      setIsDrawing(false);
      const strokeData: StrokeData = {
        points: drawingPoints,
        color: props.penColor,
        thickness: props.penThickness,
      };
      await props.onAddElement('stroke', 0, 0, strokeData, 0, 0);
      setDrawingPoints([]);
      return;
    }
    setIsDrawing(false);
    setDrawingPoints([]);

    if (isDragging && dragElementId.current !== null) {
      const el = props.elements.find(e => e.id === dragElementId.current);
      if (el) {
        props.onMoveElement(el.id, el.x, el.y);
      }
      setIsDragging(false);
      dragElementId.current = null;
    }
  };

  // ─── Element drag start — works in ALL tool modes ─────────
  const { elements: currentElements, onSelect: selectHandler } = props;
  const handleElementDragStart = useCallback((id: number, e: React.PointerEvent) => {
    // Drag via handle always works — handle stopPropagation prevents tool conflicts
    const el = currentElements.find(el => el.id === id);
    if (!el) return;
    selectHandler(id);
    setIsDragging(true);
    dragElementId.current = id;
    const boardPos = screenToBoard(e.clientX, e.clientY);
    dragStart.current = { x: boardPos.x, y: boardPos.y, elX: el.x, elY: el.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [currentElements, selectHandler, screenToBoard]);

  const textElements = props.elements.filter(e => e.type === 'text');
  const checklistElements = props.elements.filter(e => e.type === 'checklist');
  const strokeElements = props.elements.filter(e => e.type === 'stroke');

  const cursorClass = props.tool === 'pen' ? 'cv-cursor-pen' :
    props.tool === 'eraser' ? 'cv-cursor-eraser' :
    props.tool === 'text' ? 'cv-cursor-text' :
    props.tool === 'checklist' ? 'cv-cursor-checklist' : '';
  const eraserSize = Math.max(8, props.eraserRadius * props.zoom * 2);
  const viewportStyle = {
    '--cv-grid-size': `${CANVAS_GRID_SIZE * props.zoom}px`,
    '--cv-grid-x': `${pan.x}px`,
    '--cv-grid-y': `${pan.y}px`,
  } as React.CSSProperties;

  return (
    <div
      ref={containerRef}
      className={`cv-board-viewport ${cursorClass}`}
      style={viewportStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => setEraserCursor(null)}
    >
      {props.loading && (
        <div className="cv-loading">Loading canvas…</div>
      )}
      <div
        className="cv-board"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${props.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <StrokeLayer
          strokes={strokeElements}
          drawingPoints={drawingPoints}
          drawingColor={props.penColor}
          drawingThickness={props.penThickness}
          isDrawing={isDrawing}
        />

        {textElements.map(el => (
          <TextElement
            key={el.id}
            element={el}
            selected={props.selectedId === el.id}
            onSelect={() => props.onSelect(el.id)}
            onDragStart={(e) => handleElementDragStart(el.id, e)}
            onUpdate={(data) => props.onUpdateElement(el.id, { data })}
            tool={props.tool}
          />
        ))}

        {checklistElements.map(el => (
          <ChecklistElement
            key={el.id}
            element={el}
            selected={props.selectedId === el.id}
            onSelect={() => props.onSelect(el.id)}
            onDragStart={(e) => handleElementDragStart(el.id, e)}
            onUpdate={(data) => props.onUpdateElement(el.id, { data })}
            tool={props.tool}
          />
        ))}
      </div>
      {props.tool === 'eraser' && eraserCursor && (
        <div
          className="cv-eraser-cursor"
          style={{
            width: eraserSize,
            height: eraserSize,
            transform: `translate(${eraserCursor.x - eraserSize / 2}px, ${eraserCursor.y - eraserSize / 2}px)`,
          }}
        />
      )}
    </div>
  );
}

// ─── Geometry helpers ───────────────────────────────────────
function splitStrokeByEraser(points: StrokePoint[], center: StrokePoint, radius: number): StrokePoint[][] {
  if (points.length < 2) return [];

  const segments: StrokePoint[][] = [];
  let current: StrokePoint[] = [];

  const startSegment = (point: StrokePoint) => {
    current = [point];
  };

  if (Math.hypot(points[0].x - center.x, points[0].y - center.y) > radius) {
    startSegment(points[0]);
  }

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const point = points[i];
    const pointHit = Math.hypot(point.x - center.x, point.y - center.y) <= radius;
    const segmentHit = distToSegment(center, prev, point) <= radius;

    if (pointHit || segmentHit) {
      if (current.length >= 2) segments.push(current);
      current = [];
      if (!pointHit) startSegment(point);
      continue;
    }

    if (current.length === 0) {
      const prevHit = Math.hypot(prev.x - center.x, prev.y - center.y) <= radius;
      if (!prevHit) current.push(prev);
    }
    current.push(point);
  }

  if (current.length >= 2) segments.push(current);
  return segments;
}

function distToSegment(p: StrokePoint, a: StrokePoint, b: StrokePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
