'use client';

import React, { useRef, useEffect } from 'react';
import type { CanvasElement, CanvasTool, ChecklistData, ChecklistItem } from './canvas-types';

type Props = {
  element: CanvasElement;
  selected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onUpdate: (data: ChecklistData) => void;
  tool: CanvasTool;
};

export function ChecklistElement({ element, selected, onSelect, onDragStart, onUpdate, tool }: Props) {
  const data = element.data as ChecklistData;
  const itemRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const focusNextId = useRef<string | null>(null);

  // Focus newly created item
  useEffect(() => {
    if (focusNextId.current) {
      const input = itemRefs.current.get(focusNextId.current);
      if (input) input.focus();
      focusNextId.current = null;
    }
  });

  const updateItem = (itemId: string, updates: Partial<ChecklistItem>) => {
    onUpdate({
      ...data,
      items: data.items.map(i => i.id === itemId ? { ...i, ...updates } : i),
    });
  };

  const addItemAfter = (afterId: string) => {
    const idx = data.items.findIndex(i => i.id === afterId);
    const newId = crypto.randomUUID();
    const newItems = [...data.items];
    newItems.splice(idx + 1, 0, { id: newId, text: '', done: false });
    focusNextId.current = newId;
    onUpdate({ ...data, items: newItems });
  };

  const addItem = () => {
    const newId = crypto.randomUUID();
    focusNextId.current = newId;
    onUpdate({
      ...data,
      items: [...data.items, { id: newId, text: '', done: false }],
    });
  };

  const removeItem = (itemId: string) => {
    const idx = data.items.findIndex(i => i.id === itemId);
    const newItems = data.items.filter(i => i.id !== itemId);
    // Focus previous item if available
    if (idx > 0 && newItems.length > 0) {
      const prevId = newItems[Math.min(idx - 1, newItems.length - 1)].id;
      setTimeout(() => {
        const input = itemRefs.current.get(prevId);
        if (input) input.focus();
      }, 0);
    }
    onUpdate({ ...data, items: newItems });
  };

  const handleItemKeyDown = (e: React.KeyboardEvent, item: ChecklistItem) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Don't create duplicate empty if current is empty and next is also empty
      const idx = data.items.findIndex(i => i.id === item.id);
      const next = data.items[idx + 1];
      if (item.text === '' && next && next.text === '') return;
      addItemAfter(item.id);
    }
    if (e.key === 'Backspace' && item.text === '') {
      e.preventDefault();
      if (data.items.length > 1) {
        removeItem(item.id);
      }
    }
  };

  return (
    <div
      className={`cv-element cv-checklist-element ${selected ? 'cv-element--selected' : ''}`}
      style={{
        left: element.x,
        top: element.y,
        zIndex: element.zIndex,
        minWidth: 200,
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      <div
        className="cv-checklist-header"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('input')) return;
          e.stopPropagation();
          e.preventDefault();
          onDragStart(e);
        }}
      >
        <span
          className="cv-drag-dots"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDragStart(e);
          }}
        >⋮⋮</span>
        <input
          className="cv-checklist-title-input"
          value={data.title}
          placeholder="Checklist title"
          onChange={(e) => onUpdate({ ...data, title: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </div>
      <div className="cv-checklist-items">
        {data.items.map(item => (
          <div key={item.id} className={`cv-checklist-item ${item.done ? 'cv-checklist-item--done' : ''}`}>
            <button
              className="cv-checklist-toggle"
              onClick={(e) => { e.stopPropagation(); updateItem(item.id, { done: !item.done }); }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {item.done ? '☑' : '☐'}
            </button>
            <input
              ref={(el) => { if (el) itemRefs.current.set(item.id, el); else itemRefs.current.delete(item.id); }}
              className="cv-checklist-item-input"
              value={item.text}
              placeholder="Item…"
              onChange={(e) => updateItem(item.id, { text: e.target.value })}
              onKeyDown={(e) => handleItemKeyDown(e, item)}
              onPointerDown={(e) => e.stopPropagation()}
            />
            <button
              className="cv-checklist-remove"
              onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
              onPointerDown={(e) => e.stopPropagation()}
            >×</button>
          </div>
        ))}
      </div>
      <button
        className="cv-checklist-add"
        onClick={(e) => { e.stopPropagation(); addItem(); }}
        onPointerDown={(e) => e.stopPropagation()}
      >+ Add item</button>
    </div>
  );
}
