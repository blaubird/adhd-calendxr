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

function getUpcomingTimedItemOffset(item: Item, now: Date) {
  if (!item.timeStart) return null;
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const itemDay = item.occurrenceDay ?? item.day;
  const itemDate = parseDayKey(itemDay);
  const dayOffset = Math.round((itemDate.getTime() - todayStart) / DAY_MS);
  const [hour, minute] = item.timeStart.split(':').map(Number);
  return dayOffset * 1440 + hour * 60 + minute - nowMinutes;
}

type NextUpResult = {
  item: Item;
  totalMinutes: number;
};

function SidebarNextUp({ items, onPick }: { items: Item[]; onPick?: (item: Item) => void }) {
  const [now, setNow] = useState(() => nowInTz(new Date()));
  const [serverNextUp, setServerNextUp] = useState<NextUpResult | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(nowInTz(new Date())), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchNextUp() {
      try {
        const res = await fetch('/api/items/next-up');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setServerNextUp(data.nextUp ?? null);
      } catch {
        if (!cancelled) setServerNextUp(null);
      }
    }
    fetchNextUp();
    const id = window.setInterval(fetchNextUp, 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [items]);

  const localNextUp = useMemo(() => getNextUpcomingTimedItem(items, now), [items, now]);
  const currentServerNextUp = useMemo(() => {
    if (!serverNextUp) return null;
    const totalMinutes = getUpcomingTimedItemOffset(serverNextUp.item, now);
    return totalMinutes == null || totalMinutes < 0 ? null : { item: serverNextUp.item, totalMinutes };
  }, [serverNextUp, now]);
  const nextUp = currentServerNextUp ?? localNextUp;

  if (nextUp) {
    const day = nextUp.item.occurrenceDay ?? nextUp.item.day;
    return (
      <div className="sidebar-card">
        <button
          className="sidebar-next-up sidebar-next-up--button"
          onClick={() => onPick?.(nextUp.item)}
          type="button"
        >
          <span className="sidebar-next-up-kicker">NEXT UP</span>
          <span className="sidebar-next-up-title">
            <span>{formatTimeValue(nextUp.item.timeStart)}</span>
            {nextUp.item.title}
          </span>
          <span className="sidebar-next-up-meta">
            {relativeMinutesLabel(nextUp.totalMinutes)}
            {' · '}
            {dayKeyFromZonedDate(now) === day ? 'Today' : day}
          </span>
          <span className="sidebar-next-up-tz">{TIMEZONE}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar-card">
      <section className="sidebar-next-up">
        <p className="sidebar-next-up-kicker">NEXT UP</p>
        <p className="sidebar-next-up-empty">No upcoming timed items.</p>
        <p className="sidebar-next-up-tz">{TIMEZONE}</p>
      </section>
    </div>
  );
}

export function Sidebar({
  year,
  month,
  onPrev,
  onNext,
  onToday,
  items,
  onPickNextUp,
}: {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  userEmail: string;
  onSignOut: () => Promise<void>;
  items: Item[];
  onPickNextUp?: (item: Item) => void;
}) {
  const monthName = MONTH_NAMES[month - 1] ?? '';

  return (
    <aside className="sidebar">
      {/* Month Nav Card */}
      <div className="sidebar-card">
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
            Today <span className="sidebar-today-icon" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Moon Phase Card */}
      <div className="sidebar-card">
        <MoonPhase />
      </div>

      {/* Weather Card */}
      <div className="sidebar-card">
        <WeatherWidget />
      </div>

      {/* Clock Card */}
      <div className="sidebar-card">
        <div className="sidebar-clock-section">
          <LiveClock />
        </div>
      </div>

      {/* Next Up Card */}
      <SidebarNextUp items={items} onPick={onPickNextUp} />
    </aside>
  );
}
