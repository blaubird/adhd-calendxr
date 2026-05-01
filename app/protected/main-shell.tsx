'use client';
import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import CalendarShell from './calendar-shell';
import { Item } from 'app/types';
import { format } from 'date-fns';

type ActiveTab = 'calendar' | 'canvas' | 'gambling';

const CanvasTab = dynamic(() => import('./components/canvas/canvas-tab'), {
  loading: () => <div className="tab-loading">Loading Canvas...</div>,
});

const GamblingTab = dynamic(() => import('./components/gambling/gambling-tab'), {
  loading: () => <div className="tab-loading">Loading Gambling...</div>,
});

export default function MainShell({
  initialItems,
  initialMonth,
  userEmail,
  onSignOut,
}: {
  initialItems: Item[];
  initialMonth: string;
  userEmail: string;
  onSignOut: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('calendar');
  const accountLabel = userEmail?.split('@')[0] || 'Account';
  const accountInitial = accountLabel.charAt(0).toUpperCase() || 'A';

  // Shared state from Calendar → Canvas
  const [calendarDay, setCalendarDay] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [calendarMonth, setCalendarMonth] = useState(initialMonth);

  // "Open Day Canvas" handler — switches to Canvas tab in day mode for a specific day
  const openDayCanvas = useCallback((day: string) => {
    setCalendarDay(day);
    setActiveTab('canvas');
  }, []);

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden="true" />
          <span>CALENDXR</span>
        </div>
        <nav className="app-tabs" aria-label="Primary">
          <button 
            onClick={() => setActiveTab('calendar')}
            className={`app-tab ${activeTab === 'calendar' ? 'app-tab--active' : ''}`}
          >
            Calendar
          </button>
          <button 
            onClick={() => setActiveTab('canvas')}
            className={`app-tab ${activeTab === 'canvas' ? 'app-tab--active' : ''}`}
          >
            Canvas
          </button>
          <button 
            onClick={() => setActiveTab('gambling')}
            className={`app-tab ${activeTab === 'gambling' ? 'app-tab--active' : ''}`}
          >
            Gambling
          </button>
        </nav>
        <div className="app-topbar-actions">
          <button className="app-icon-btn app-icon-btn--search" type="button" aria-label="Search" onClick={() => setActiveTab('calendar')} />
          <button className="app-icon-btn app-icon-btn--settings" type="button" aria-label="Settings" />
          <button className="app-icon-btn app-icon-btn--notifications" type="button" aria-label="Notifications">
            <span className="app-notification-dot" />
          </button>
          <div className="app-user-chip" title={userEmail}>
            <span className="app-user-avatar">{accountInitial}</span>
            <span className="app-user-name">{accountLabel}</span>
            <span className="app-user-chevron" aria-hidden="true" />
          </div>
        </div>
      </header>
      
      <div className="app-content">
        {activeTab === 'calendar' && (
          <CalendarShell 
            initialItems={initialItems} 
            initialMonth={initialMonth} 
            userEmail={userEmail}
            onSignOut={onSignOut}
            onSelectedDayChange={setCalendarDay}
            onMonthChange={setCalendarMonth}
            onOpenDayCanvas={openDayCanvas}
          />
        )}
        {activeTab === 'canvas' && (
          <CanvasTab
            initialMonth={calendarMonth}
            initialDay={calendarDay}
          />
        )}
        {activeTab === 'gambling' && <GamblingTab />}
      </div>
    </div>
  );
}
