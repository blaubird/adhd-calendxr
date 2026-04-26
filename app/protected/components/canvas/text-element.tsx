'use client';

import React, { useRef, useEffect } from 'react';
import type { CanvasElement, CanvasTool, TextData } from './canvas-types';

type Props = {
  element: CanvasElement;
  selected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onUpdate: (data: TextData) => void;
  tool: CanvasTool;
};

export function TextElement({ element, selected, onSelect, onDragStart, onUpdate, tool }: Props) {
  const data = element.data as TextData;
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (selected && textRef.current && (tool === 'select' || tool === 'text')) {
      textRef.current.focus();
    }
  }, [selected, tool]);

  return (
    <div
      className={`cv-element cv-text-element ${selected ? 'cv-element--selected' : ''}`}
      style={{
        left: element.x,
        top: element.y,
        zIndex: element.zIndex,
        minWidth: 160,
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      <div
        className="cv-text-drag-handle"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onDragStart(e);
        }}
      >
        <span className="cv-drag-dots">⋮⋮</span>
      </div>
      <textarea
        ref={textRef}
        className="cv-text-input"
        value={data.text}
        placeholder="Write something…"
        onChange={(e) => onUpdate({ text: e.target.value })}
        rows={Math.max(2, (data.text || '').split('\n').length)}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
