'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Item } from 'app/types';
import { TIMEZONE, formatTimeValue, nowInTz, parseDayKey } from 'app/lib/datetime';
import { LiveClock } from './live-clock';
import { WeatherWidget } from './weather-widget';
import { MoonPhase } from './moon-phase';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April',
  'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
];

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKeyFromZonedDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function relativeMinutesLabel(minutes: number) {
  if (minutes <= 0) return 'now';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `in ${hours}h ${mins}m`;
  if (hours) return `in ${hours}h`;
  return `in ${mins}m`;
}

function getNextUpcomingTimedItem(items: Item[], now: Date) {
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  return items
    .filter((item) => item.timeStart && item.status !== 'done' && item.status !== 'canceled')
    .map((item) => {
      const itemDay = item.occurrenceDay ?? item.day;
      const itemDate = parseDayKey(itemDay);
      const dayOffset = Math.round((itemDate.getTime() - todayStart) / DAY_MS);
      const [hour, minute] = item.timeStart!.split(':').map(Number);
      const totalMinutes = dayOffset * 1440 + hour * 60 + minute - nowMinutes;
      return { item, totalMinutes };
    })
    .filter((candidate) => candidate.totalMinutes >= 0)
    .sort((a, b) => a.totalMinutes - b.totalMinutes)[0] ?? null;
}

function SidebarNextUp({ items }: { items: Item[] }) {
  const [now, setNow] = useState(() => nowInTz(new Date()));

  useEffect(() => {
    const id = window.setInterval(() => setNow(nowInTz(new Date())), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const nextUp = useMemo(() => getNextUpcomingTimedItem(items, now), [items, now]);

  return (
    <section className="sidebar-next-up">
      <p className="sidebar-next-up-kicker">Next up</p>
      {nextUp ? (
        <>
          <p className="sidebar-next-up-title">
            <span>{formatTimeValue(nextUp.item.timeStart)}</span>
            {nextUp.item.title}
          </p>
          <p className="sidebar-next-up-meta">
            {relativeMinutesLabel(nextUp.totalMinutes)}
            {' · '}
            {dayKeyFromZonedDate(now) === (nextUp.item.occurrenceDay ?? nextUp.item.day)
              ? 'Today'
              : nextUp.item.occurrenceDay ?? nextUp.item.day}
          </p>
        </>
      ) : (
        <p className="sidebar-next-up-empty">No upcoming timed items.</p>
      )}
      <p className="sidebar-next-up-tz">{TIMEZONE}</p>
    </section>
  );
}

export function Sidebar({
  year,
  month,
  onPrev,
  onNext,
  onToday,
  userEmail,
  items,
}: {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  userEmail: string;
  items: Item[];
}) {
  const monthName = MONTH_NAMES[month - 1] ?? '';

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-month-nav">
          <button
            className="sidebar-nav-btn"
            onClick={onPrev}
            aria-label="Previous month"
          >
            ‹
          </button>
          <div className="sidebar-month-label">
            <span className="sidebar-month-name">{monthName}</span>
            <span className="sidebar-year">{year}</span>
          </div>
          <button
            className="sidebar-nav-btn"
            onClick={onNext}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
        <button className="sidebar-today-btn" onClick={onToday}>
          Today
        </button>
      </div>

      <div className="sidebar-clock-section">
        <LiveClock />
      </div>

      {/* Weather & Moon */}
      <WeatherWidget />
      <MoonPhase />
      <SidebarNextUp items={items} />
      <div className="sidebar-placeholder" />

      <div className="sidebar-footer">
        <span className="sidebar-email">{userEmail}</span>
        <form
          action={async () => {
            // Sign out is handled by the server action passed from the page
          }}
        >
        </form>
      </div>
    </aside>
  );
}
