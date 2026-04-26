'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { CanvasElement, CanvasElementData, BoardScope, CanvasTool, UndoAction } from './canvas-types';
import { DEFAULT_ERASER_RADIUS, DEFAULT_PEN_COLOR, DEFAULT_PEN_THICKNESS } from './canvas-types';
import { CanvasToolbar } from './canvas-toolbar';
import { CanvasBoard } from './canvas-board';
import { format, addDays, subDays, addMonths, subMonths, parse } from 'date-fns';

type SaveStatus = 'saved' | 'saving' | 'error';

export default function CanvasTab({
  initialMonth,
  initialDay,
}: {
  initialMonth: string;
  initialDay?: string;
}) {
  const [mode, setMode] = useState<BoardScope>('day');
  const [dayScopeKey, setDayScopeKey] = useState(initialDay || format(new Date(), 'yyyy-MM-dd'));
  const [monthScopeKey, setMonthScopeKey] = useState(initialMonth);
  const scopeKey = mode === 'day' ? dayScopeKey : monthScopeKey;

  // Sync from parent when initialDay/initialMonth props change
  useEffect(() => {
    if (initialDay) setDayScopeKey(initialDay);
  }, [initialDay]);

  useEffect(() => {
    if (initialMonth) setMonthScopeKey(initialMonth);
  }, [initialMonth]);

  const [tool, setTool] = useState<CanvasTool>('select');
  const [penColor, setPenColor] = useState(DEFAULT_PEN_COLOR);
  const [penThickness, setPenThickness] = useState(DEFAULT_PEN_THICKNESS);
  const [eraserRadius, setEraserRadius] = useState(DEFAULT_ERASER_RADIUS);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [boardId, setBoardId] = useState<number | null>(null);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [loading, setLoading] = useState(true);

  // Undo/redo stacks
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSavesRef = useRef<Map<number, CanvasElement>>(new Map());
  const boardIdRef = useRef<number | null>(null);

  // Keep boardIdRef in sync so callbacks always have the latest
  useEffect(() => { boardIdRef.current = boardId; }, [boardId]);

  // ─── Load board ───────────────────────────────────────────
  const loadBoard = useCallback(async () => {
    // Flush pending saves before switching boards
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = Array.from(pendingSavesRef.current.values());
    pendingSavesRef.current.clear();
    if (pending.length > 0 && boardIdRef.current) {
      for (const s of pending) {
        try {
          await fetch(`/api/canvas/boards/${boardIdRef.current}/elements`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              elementId: s.id,
              updates: { x: s.x, y: s.y, width: s.width, height: s.height, zIndex: s.zIndex, data: s.data },
            }),
          });
        } catch { /* best effort */ }
      }
    }

    setLoading(true);
    setSelectedId(null);
    setUndoStack([]);
    setRedoStack([]);
    try {
      const res = await fetch(`/api/canvas/boards?scope=${mode}&scopeKey=${scopeKey}`);
      if (!res.ok) throw new Error('Failed to load board');
      const data = await res.json();
      setBoardId(data.board.id);
      setElements(data.elements || []);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    } finally {
      setLoading(false);
    }
  }, [mode, scopeKey]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  // ─── Autosave: save a single element to API ───────────────
  const saveElementToApi = useCallback(async (el: CanvasElement, isNew: boolean): Promise<CanvasElement | null> => {
    const bid = boardIdRef.current;
    if (!bid) return null;
    setSaveStatus('saving');
    try {
      if (isNew) {
        const res = await fetch(`/api/canvas/boards/${bid}/elements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: el.type,
            x: Math.round(el.x), y: Math.round(el.y),
            width: Math.round(el.width), height: Math.round(el.height),
            zIndex: el.zIndex, data: el.data,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('Canvas POST failed:', res.status, err);
          throw new Error('Save failed');
        }
        const { element } = await res.json();
        setSaveStatus('saved');
        return element as CanvasElement;
      } else {
        const res = await fetch(`/api/canvas/boards/${bid}/elements`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            elementId: el.id,
            updates: {
              x: Math.round(el.x), y: Math.round(el.y),
              width: Math.round(el.width), height: Math.round(el.height),
              zIndex: el.zIndex, data: el.data,
            },
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('Canvas PATCH failed:', res.status, err);
          throw new Error('Save failed');
        }
        const { element } = await res.json();
        setSaveStatus('saved');
        return element as CanvasElement;
      }
    } catch {
      setSaveStatus('error');
      return null;
    }
  }, []); // No deps — uses boardIdRef

  const deleteElementApi = useCallback(async (elementId: number) => {
    const bid = boardIdRef.current;
    if (!bid) return;
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/canvas/boards/${bid}/elements`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementId }),
      });
      if (!res.ok) throw new Error('Delete failed');
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }, []);

  // Debounced save for edits — flushes all pending saves after 800ms
  const flushPendingSaves = useCallback(async () => {
    const saves = Array.from(pendingSavesRef.current.values());
    pendingSavesRef.current.clear();
    for (const s of saves) {
      await saveElementToApi(s, false);
    }
  }, [saveElementToApi]);

  const debouncedSave = useCallback((el: CanvasElement) => {
    pendingSavesRef.current.set(el.id, el);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      flushPendingSaves();
    }, 800);
  }, [flushPendingSaves]);

  // ─── Element operations ───────────────────────────────────
  const addElement = useCallback(async (type: 'text' | 'checklist' | 'stroke', x: number, y: number, data: CanvasElementData, w = 200, h = 100) => {
    const maxZ = elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
    const tempId = -Date.now();
    const temp: CanvasElement = {
      id: tempId, boardId: boardIdRef.current || 0, type,
      x: Math.round(x), y: Math.round(y),
      width: w, height: h, zIndex: maxZ + 1,
      data, createdAt: new Date(), updatedAt: new Date(),
    };
    setElements(prev => [...prev, temp]);
    setSelectedId(tempId);

    const saved = await saveElementToApi(temp, true);
    if (saved) {
      setElements(prev => prev.map(e => e.id === tempId ? saved : e));
      setSelectedId(saved.id);
      setUndoStack(prev => [...prev, { type: 'create', elementId: saved.id, after: saved }]);
      setRedoStack([]);
      return saved;
    }
    return null;
  }, [elements, saveElementToApi]);

  const updateLocalElement = useCallback((id: number, updates: Partial<CanvasElement>) => {
    setElements(prev => prev.map(e => {
      if (e.id !== id) return e;
      const updated = { ...e, ...updates };
      debouncedSave(updated);
      return updated;
    }));
  }, [debouncedSave]);

  const moveElement = useCallback((id: number, x: number, y: number) => {
    setElements(prev => {
      const el = prev.find(e => e.id === id);
      if (!el) return prev;
      const updated = { ...el, x: Math.round(x), y: Math.round(y) };
      debouncedSave(updated);
      setUndoStack(u => [...u, { type: 'move', elementId: id, before: { x: el.x, y: el.y }, after: { x: updated.x, y: updated.y } }]);
      setRedoStack([]);
      return prev.map(e => e.id === id ? updated : e);
    });
  }, [debouncedSave]);

  const removeElement = useCallback(async (id: number) => {
    let found: CanvasElement | undefined;
    setElements(prev => {
      found = prev.find(e => e.id === id);
      return prev.filter(e => e.id !== id);
    });
    setSelectedId(prev => prev === id ? null : prev);
    if (found) {
      setUndoStack(prev => [...prev, { type: 'delete', elementId: id, before: found }]);
      setRedoStack([]);
    }
    // Also clear from pending saves
    pendingSavesRef.current.delete(id);
    await deleteElementApi(id);
  }, [deleteElementApi]);

  // ─── Undo / Redo ──────────────────────────────────────────
  const undo = useCallback(async () => {
    setUndoStack(prev => {
      const action = prev[prev.length - 1];
      if (!action) return prev;
      // Process action asynchronously
      (async () => {
        if (action.type === 'create') {
          setElements(p => p.filter(e => e.id !== action.elementId));
          setRedoStack(r => [...r, action]);
          await deleteElementApi(action.elementId);
        } else if (action.type === 'delete' && action.before) {
          const saved = await saveElementToApi(action.before, true);
          if (saved) {
            setElements(p => [...p, saved]);
            setRedoStack(r => [...r, { ...action, elementId: saved.id }]);
          }
        } else if (action.type === 'move' && action.before) {
          setElements(p => p.map(e => e.id === action.elementId ? { ...e, ...action.before } : e));
          setElements(p => {
            const el = p.find(e => e.id === action.elementId);
            if (el) debouncedSave(el);
            return p;
          });
          setRedoStack(r => [...r, action]);
        } else if (action.type === 'update' && action.before) {
          setElements(p => p.map(e => e.id === action.elementId ? { ...e, data: action.before } : e));
          setElements(p => {
            const el = p.find(e => e.id === action.elementId);
            if (el) debouncedSave(el);
            return p;
          });
          setRedoStack(r => [...r, action]);
        }
      })();
      return prev.slice(0, -1);
    });
  }, [deleteElementApi, saveElementToApi, debouncedSave]);

  const redo = useCallback(async () => {
    setRedoStack(prev => {
      const action = prev[prev.length - 1];
      if (!action) return prev;
      (async () => {
        if (action.type === 'create' && action.after) {
          const saved = await saveElementToApi(action.after, true);
          if (saved) {
            setElements(p => [...p, saved]);
            setUndoStack(u => [...u, { ...action, elementId: saved.id }]);
          }
        } else if (action.type === 'delete') {
          setElements(p => p.filter(e => e.id !== action.elementId));
          setUndoStack(u => [...u, action]);
          await deleteElementApi(action.elementId);
        } else if (action.type === 'move' && action.after) {
          setElements(p => p.map(e => e.id === action.elementId ? { ...e, ...action.after } : e));
          setElements(p => {
            const el = p.find(e => e.id === action.elementId);
            if (el) debouncedSave(el);
            return p;
          });
          setUndoStack(u => [...u, action]);
        } else if (action.type === 'update' && action.after) {
          setElements(p => p.map(e => e.id === action.elementId ? { ...e, data: action.after } : e));
          setElements(p => {
            const el = p.find(e => e.id === action.elementId);
            if (el) debouncedSave(el);
            return p;
          });
          setUndoStack(u => [...u, action]);
        }
      })();
      return prev.slice(0, -1);
    });
  }, [deleteElementApi, saveElementToApi, debouncedSave]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && tool === 'select') {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) return;
        e.preventDefault();
        removeElement(selectedId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, selectedId, tool, removeElement]);

  // Flush on unload
  useEffect(() => {
    const handler = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const saves = Array.from(pendingSavesRef.current.values());
      const bid = boardIdRef.current;
      if (!bid) return;
      for (const s of saves) {
        try {
          const blob = new Blob([JSON.stringify({
            elementId: s.id,
            updates: { x: Math.round(s.x), y: Math.round(s.y), data: s.data },
          })], { type: 'application/json' });
          navigator.sendBeacon?.(`/api/canvas/boards/${bid}/elements`, blob);
        } catch { /* best effort */ }
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ─── Navigation ───────────────────────────────────────────
  const goNext = () => {
    if (mode === 'day') {
      const d = parse(dayScopeKey, 'yyyy-MM-dd', new Date());
      setDayScopeKey(format(addDays(d, 1), 'yyyy-MM-dd'));
    } else {
      const d = parse(monthScopeKey + '-01', 'yyyy-MM-dd', new Date());
      setMonthScopeKey(format(addMonths(d, 1), 'yyyy-MM'));
    }
  };
  const goPrev = () => {
    if (mode === 'day') {
      const d = parse(dayScopeKey, 'yyyy-MM-dd', new Date());
      setDayScopeKey(format(subDays(d, 1), 'yyyy-MM-dd'));
    } else {
      const d = parse(monthScopeKey + '-01', 'yyyy-MM-dd', new Date());
      setMonthScopeKey(format(subMonths(d, 1), 'yyyy-MM'));
    }
  };

  const boardLabel = mode === 'day'
    ? `Day Canvas — ${format(parse(dayScopeKey, 'yyyy-MM-dd', new Date()), 'dd.MM.yyyy')}`
    : `Month Canvas — ${format(parse(monthScopeKey + '-01', 'yyyy-MM-dd', new Date()), 'MMMM yyyy')}`;

  return (
    <div className="canvas-tab">
      <CanvasToolbar
        mode={mode}
        onModeChange={(m) => { setMode(m); setSelectedId(null); }}
        tool={tool}
        onToolChange={setTool}
        penColor={penColor}
        onPenColorChange={setPenColor}
        penThickness={penThickness}
        onPenThicknessChange={setPenThickness}
        eraserRadius={eraserRadius}
        onEraserRadiusChange={setEraserRadius}
        zoom={zoom}
        onZoomChange={setZoom}
        boardLabel={boardLabel}
        onPrev={goPrev}
        onNext={goNext}
        saveStatus={saveStatus}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={undo}
        onRedo={redo}
        onDeleteSelected={() => selectedId && removeElement(selectedId)}
        hasSelection={selectedId !== null}
      />
      <CanvasBoard
        elements={elements}
        tool={tool}
        penColor={penColor}
        penThickness={penThickness}
        eraserRadius={eraserRadius}
        zoom={zoom}
        onZoomChange={setZoom}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onAddElement={addElement}
        onUpdateElement={updateLocalElement}
        onMoveElement={moveElement}
        onRemoveElement={removeElement}
        loading={loading}
        pan={pan}
        onPanChange={setPan}
      />
    </div>
  );
}
