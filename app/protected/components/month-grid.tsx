'use client';

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Item } from 'app/types';
import { formatDayKey, formatTimeValue, nowInTz } from 'app/lib/datetime';
import { DEFAULT_ITEM_COLOR, RECURRING_ITEM_COLOR } from 'app/lib/item-colors';

const WEEKDAY_HEADERS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const GRID_COLUMNS = 7;
const GRID_ROWS = 6;
const DEFAULT_CELL_SIZE = 96;

/** Default colors for dots */
const DONE_COLOR = '#555';
const MAX_VISIBLE_DOTS = 8;

function getItemDotColor(item: Item): string {
  const isDone = item.status === 'done';
  if (isDone) return DONE_COLOR;

  if (item.color) return item.color;
  if (item.isOccurrence || item.recurrenceRule) return RECURRING_ITEM_COLOR;
  return DEFAULT_ITEM_COLOR;
}

function dotLabel(item: Item) {
  const time = item.timeStart ? `${formatTimeValue(item.timeStart)} · ` : '';
  return `${time}${item.title}`;
}

function DayCell({
  dayNum,
  dayKey,
  items,
  isToday,
  isSelected,
  onSelect,
  onPickItem,
}: {
  dayNum: number;
  dayKey: string;
  items: Item[];
  isToday: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onPickItem: (item: Item) => void;
}) {
  const overflowCount = Math.max(0, items.length - MAX_VISIBLE_DOTS);
  const visibleLimit = overflowCount > 0 ? MAX_VISIBLE_DOTS - 1 : MAX_VISIBLE_DOTS;
  const visibleItems = items.slice(0, visibleLimit);

  return (
    <div
      className={`month-cell ${isToday ? 'month-cell--today' : ''} ${isSelected ? 'month-cell--selected' : ''}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      aria-label={`Select ${dayKey}`}
      role="button"
      tabIndex={0}
    >
      {/* Inner glass background layer — clips to border-radius, sits behind dots */}
      <div className="month-cell-bg" />
      <span className={`month-cell-number ${isToday ? 'month-cell-number--today' : ''}`}>
        {dayNum}
      </span>
      {visibleItems.length > 0 && (
        <div className="month-cell-dots">
          {visibleItems.map((item) => {
            const color = getItemDotColor(item);
            const isDone = item.status === 'done';
            return (
              <button
                key={String(item.id)}
                className={`month-dot ${isDone ? 'month-dot--done' : ''}`}
                style={{
                  '--dot-color': color,
                  background: isDone
                    ? color
                    : `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.65), ${color} 42%, color-mix(in srgb, ${color} 60%, #001018) 100%)`,
                  boxShadow: isDone
                    ? '0 1px 3px rgba(0,0,0,0.5)'
                    : `0 0 7px color-mix(in srgb, ${color} 60%, transparent), 0 0 16px color-mix(in srgb, ${color} 28%, transparent)`,
                } as React.CSSProperties}
                title={dotLabel(item)}
                aria-label={`Open ${dotLabel(item)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onPickItem(item);
                }}
                onKeyDown={(event) => event.stopPropagation()}
                type="button"
              />
            );
          })}
          {overflowCount > 0 && (
            <span className="month-dot-overflow">+{overflowCount}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function MonthGrid({
  year,
  month,
  daysInMonth,
  firstDayWeekday,
  dayNumbers,
  dayKeyFn,
  grouped,
  selectedDay,
  onSelectDay,
  onPickItem,
}: {
  year: number;
  month: number;
  daysInMonth: number;
  firstDayWeekday: number;
  dayNumbers: number[];
  dayKeyFn: (dayNum: number) => string;
  grouped: Record<string, Item[]>;
  selectedDay: string;
  onSelectDay: (day: string) => void;
  onPickItem: (item: Item) => void;
}) {
  const todayStr = formatDayKey(nowInTz(new Date()));
  const stageRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [cellSize, setCellSize] = useState(DEFAULT_CELL_SIZE);
  const trailingEmptyCount = Math.max(0, (GRID_COLUMNS * GRID_ROWS) - firstDayWeekday - daysInMonth);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let frame = 0;
    const updateCellSize = () => {
      const styles = window.getComputedStyle(stage);
      const gap = Number.parseFloat(styles.getPropertyValue('--month-grid-gap')) || 5;
      const headerGap = Number.parseFloat(styles.getPropertyValue('--month-header-gap')) || gap;
      const maxCell = Number.parseFloat(styles.getPropertyValue('--calendar-cell-max')) || 170;
      const minCell = Number.parseFloat(styles.getPropertyValue('--calendar-cell-min')) || 44;
      const { width, height } = stage.getBoundingClientRect();
      const paddingX = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
      const paddingY = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
      const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0;
      const availableWidth = width - paddingX - gap * (GRID_COLUMNS - 1);
      const availableHeight = height - paddingY - headerHeight - headerGap - gap * (GRID_ROWS - 1);
      const next = Math.floor(Math.min(
        availableWidth / GRID_COLUMNS,
        availableHeight / GRID_ROWS,
        maxCell
      ));
      const bounded = Math.max(minCell, Number.isFinite(next) ? next : DEFAULT_CELL_SIZE);
      setCellSize((current) => Math.abs(current - bounded) > 1 ? bounded : current);
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateCellSize);
    };

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(stage);
    if (headerRef.current) observer.observe(headerRef.current);
    updateCellSize();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const gridStyle = useMemo(
    () => ({ '--calendar-cell-size': `${cellSize}px` }) as React.CSSProperties,
    [cellSize]
  );

  return (
    <div
      className="month-grid-wrapper animate-fade-in"
      ref={stageRef}
      style={gridStyle}
    >
      <div className="month-grid-stage">
        {/* Weekday headers */}
        <div className="month-weekday-headers" ref={headerRef}>
          {WEEKDAY_HEADERS.map((d) => (
            <div key={d} className="month-weekday-header">{d}</div>
          ))}
        </div>

        {/* Day cells grid */}
        <div className="month-grid">
          {/* Empty cells before the 1st */}
          {Array.from({ length: firstDayWeekday }).map((_, i) => (
            <div key={`empty-${i}`} className="month-cell month-cell--empty" />
          ))}

          {/* Actual day cells */}
          {dayNumbers.map((dayNum) => {
            const key = dayKeyFn(dayNum);
            const dayItems = grouped[key] || [];
            return (
              <DayCell
                key={dayNum}
                dayNum={dayNum}
                dayKey={key}
                items={dayItems}
                isToday={key === todayStr}
                isSelected={key === selectedDay}
                onSelect={() => onSelectDay(key)}
                onPickItem={onPickItem}
              />
            );
          })}

          {Array.from({ length: trailingEmptyCount }).map((_, i) => (
            <div key={`trailing-empty-${i}`} className="month-cell month-cell--empty" />
          ))}
        </div>
      </div>
    </div>
  );
}
