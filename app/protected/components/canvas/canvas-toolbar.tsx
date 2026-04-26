'use client';

import React from 'react';
import type { BoardScope, CanvasTool } from './canvas-types';
import { ERASER_SIZES, PEN_COLORS, PEN_THICKNESSES, MIN_ZOOM, MAX_ZOOM } from './canvas-types';

type Props = {
  mode: BoardScope;
  onModeChange: (m: BoardScope) => void;
  tool: CanvasTool;
  onToolChange: (t: CanvasTool) => void;
  penColor: string;
  onPenColorChange: (c: string) => void;
  penThickness: number;
  onPenThicknessChange: (t: number) => void;
  eraserRadius: number;
  onEraserRadiusChange: (radius: number) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  boardLabel: string;
  onPrev: () => void;
  onNext: () => void;
  saveStatus: 'saved' | 'saving' | 'error';
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelected: () => void;
  hasSelection: boolean;
};

const TOOLS: { id: CanvasTool; label: string; icon: string }[] = [
  { id: 'select', label: 'Select', icon: '⊹' },
  { id: 'text', label: 'Text', icon: 'T' },
  { id: 'checklist', label: 'Check', icon: '☑' },
  { id: 'pen', label: 'Pen', icon: '✎' },
  { id: 'eraser', label: 'Erase', icon: '◎' },
];

export function CanvasToolbar(props: Props) {
  const zoomPct = Math.round(props.zoom * 100);
  const statusText = props.saveStatus === 'saving' ? 'Saving…' : props.saveStatus === 'error' ? 'Error saving' : 'Saved';
  const statusClass = `cv-save-status cv-save-status--${props.saveStatus}`;
  const isCustomColor = !(PEN_COLORS as readonly string[]).includes(props.penColor);

  return (
    <div className="cv-toolbar">
      {/* Mode switcher */}
      <div className="cv-toolbar-group">
        <button
          className={`cv-mode-btn ${props.mode === 'day' ? 'cv-mode-btn--active' : ''}`}
          onClick={() => props.onModeChange('day')}
        >Day</button>
        <button
          className={`cv-mode-btn ${props.mode === 'month' ? 'cv-mode-btn--active' : ''}`}
          onClick={() => props.onModeChange('month')}
        >Month</button>
      </div>

      {/* Navigation */}
      <div className="cv-toolbar-group">
        <button className="cv-nav-btn" onClick={props.onPrev}>◂</button>
        <span className="cv-board-label">{props.boardLabel}</span>
        <button className="cv-nav-btn" onClick={props.onNext}>▸</button>
      </div>

      {/* Tools */}
      <div className="cv-toolbar-group">
        {TOOLS.map(t => (
          <button
            key={t.id}
            className={`cv-tool-btn ${props.tool === t.id ? 'cv-tool-btn--active' : ''}`}
            onClick={() => props.onToolChange(t.id)}
            title={t.label}
          >
            <span className="cv-tool-icon">{t.icon}</span>
            <span className="cv-tool-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Pen controls — color presets + picker + thickness */}
      {(props.tool === 'pen') && (
        <div className="cv-toolbar-group cv-pen-controls">
          <div className="cv-color-row">
            {PEN_COLORS.map(c => (
              <button
                key={c}
                className={`cv-color-dot ${props.penColor === c ? 'cv-color-dot--active' : ''}`}
                style={{ background: c }}
                onClick={() => props.onPenColorChange(c)}
              />
            ))}
            {/* Custom color picker */}
            <label className={`cv-color-picker-wrap ${isCustomColor ? 'cv-color-dot--active' : ''}`} title="Custom color">
              <input
                type="color"
                className="cv-color-picker-input"
                value={props.penColor}
                onChange={(e) => props.onPenColorChange(e.target.value)}
              />
              <span className="cv-color-picker-swatch" style={{ background: isCustomColor ? props.penColor : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }} />
            </label>
          </div>
          <div className="cv-thickness-row">
            {PEN_THICKNESSES.map(t => (
              <button
                key={t}
                className={`cv-thickness-btn ${props.penThickness === t ? 'cv-thickness-btn--active' : ''}`}
                onClick={() => props.onPenThicknessChange(t)}
              >
                <span className="cv-thickness-preview" style={{ width: t * 2 + 4, height: t * 2 + 4 }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {props.tool === 'eraser' && (
        <div className="cv-toolbar-group cv-eraser-controls" aria-label="Eraser size">
          {ERASER_SIZES.map(size => (
            <button
              key={size.radius}
              className={`cv-size-btn ${props.eraserRadius === size.radius ? 'cv-size-btn--active' : ''}`}
              onClick={() => props.onEraserRadiusChange(size.radius)}
              title={`Eraser ${size.label}`}
            >
              {size.label}
            </button>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="cv-toolbar-group">
        <button className="cv-action-btn" onClick={props.onUndo} disabled={!props.canUndo} title="Undo (Ctrl+Z)">↩</button>
        <button className="cv-action-btn" onClick={props.onRedo} disabled={!props.canRedo} title="Redo (Ctrl+Y)">↪</button>
        <button className="cv-action-btn cv-action-btn--danger" onClick={props.onDeleteSelected} disabled={!props.hasSelection} title="Delete selected">✕</button>
      </div>

      {/* Zoom */}
      <div className="cv-toolbar-group">
        <button className="cv-zoom-btn" onClick={() => props.onZoomChange(Math.max(MIN_ZOOM, props.zoom - 0.15))}>−</button>
        <span className="cv-zoom-label">{zoomPct}%</span>
        <button className="cv-zoom-btn" onClick={() => props.onZoomChange(Math.min(MAX_ZOOM, props.zoom + 0.15))}>+</button>
        <button className="cv-zoom-btn" onClick={() => props.onZoomChange(1)} title="Reset">⊙</button>
      </div>

      {/* Save status */}
      <div className="cv-toolbar-group cv-toolbar-right">
        <span className={statusClass}>{statusText}</span>
      </div>
    </div>
  );
}
