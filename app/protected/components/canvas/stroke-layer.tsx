'use client';

import React from 'react';
import type { CanvasElement, StrokeData, StrokePoint } from './canvas-types';

type Props = {
  strokes: CanvasElement[];
  drawingPoints: StrokePoint[];
  drawingColor: string;
  drawingThickness: number;
  isDrawing: boolean;
};

function pointsToPath(points: StrokePoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const mx = (prev.x + curr.x) / 2;
    const my = (prev.y + curr.y) / 2;
    d += ` Q ${prev.x} ${prev.y} ${mx} ${my}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export function StrokeLayer({ strokes, drawingPoints, drawingColor, drawingThickness, isDrawing }: Props) {
  return (
    <svg className="cv-stroke-layer" width="1" height="1">
      {strokes.map(el => {
        const sd = el.data as StrokeData;
        return (
          <path
            key={el.id}
            d={pointsToPath(sd.points)}
            stroke={sd.color}
            strokeWidth={sd.thickness}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.9}
          />
        );
      })}
      {isDrawing && drawingPoints.length > 0 && (
        <path
          d={pointsToPath(drawingPoints)}
          stroke={drawingColor}
          strokeWidth={drawingThickness}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.7}
        />
      )}
    </svg>
  );
}
