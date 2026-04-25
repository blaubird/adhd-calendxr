'use client';

import React from 'react';
import { Item } from 'app/types';
import { formatDayKey, nowInTz } from 'app/lib/datetime';

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Default colors for dots */
const DEFAULT_COLOR = '#ff96f5';
const RECURRING_COLOR = '#67eb67';
const DONE_COLOR = '#555';

function getItemDotColor(item: Item): string {
  // Done items are always grey
  const isDone = item.status === 'done';
  if (isDone) return DONE_COLOR;

  if (item.color) return item.color;
  if (item.isOccurrence || item.recurrenceRule) return RECURRING_COLOR;
  return DEFAULT_COLOR;
}

function DayCell({
  dayNum,
  dayKey,
  items,
  isToday,
  isSelected,
  onSelect,
}: {
  dayNum: number;
  dayKey: string;
  items: Item[];
  isToday: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  // Show all dots
  const visibleItems = items;
  const overflowCount = 0;

  return (
    <button
      className={`month-cell ${isToday ? 'month-cell--today' : ''} ${isSelected ? 'month-cell--selected' : ''}`}
      onClick={onSelect}
      aria-label={`Select ${dayKey}`}
      type="button"
    >
      <span className={`month-cell-number ${isToday ? 'month-cell-number--today' : ''}`}>
        {dayNum}
      </span>
      {visibleItems.length > 0 && (
        <div className="month-cell-dots">
          {visibleItems.map((item, i) => (
            <span
              key={String(item.id)}
              className={`month-dot ${item.status === 'done' ? 'month-dot--done' : ''}`}
              style={{ backgroundColor: getItemDotColor(item) }}
              title={item.title}
            />
          ))}
          {overflowCount > 0 && (
            <span className="month-dot-overflow">+{overflowCount}</span>
          )}
        </div>
      )}
    </button>
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
}) {
  const todayStr = formatDayKey(nowInTz(new Date()));

  return (
    <div className="month-grid-wrapper animate-fade-in">
      {/* Weekday headers */}
      <div className="month-weekday-headers">
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
            />
          );
        })}
      </div>
    </div>
  );
}
