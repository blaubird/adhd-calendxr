'use client';

import React from 'react';
import { Item } from 'app/types';
import { formatDayKey, formatTimeValue, nowInTz } from 'app/lib/datetime';
import { DEFAULT_ITEM_COLOR, RECURRING_ITEM_COLOR } from 'app/lib/item-colors';

const WEEKDAY_HEADERS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** Default colors for dots */
const DONE_COLOR = '#555';
const MAX_VISIBLE_DOTS = 8;

function getItemDotColor(item: Item): string {
  // Done items are always grey
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
                  backgroundColor: color,
                  boxShadow: isDone
                    ? '0 1px 2px rgba(0,0,0,0.4)'
                    : `0 0 6px ${color}88, 0 0 12px ${color}44, 0 1px 3px rgba(0,0,0,0.5)`,
                }}
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
              onPickItem={onPickItem}
            />
          );
        })}
      </div>
    </div>
  );
}
