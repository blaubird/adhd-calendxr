'use client';

import React from 'react';
import { LiveClock } from './live-clock';
import { WeatherWidget } from './weather-widget';
import { MoonPhase } from './moon-phase';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April',
  'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
];

export function Sidebar({
  year,
  month,
  onPrev,
  onNext,
  onToday,
  userEmail,
}: {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  userEmail: string;
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
