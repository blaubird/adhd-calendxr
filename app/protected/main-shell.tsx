'use client';
import React, { useState, useCallback } from 'react';
import CalendarShell from './calendar-shell';
import GamblingTab from './components/gambling/gambling-tab';
import CanvasTab from './components/canvas/canvas-tab';
import { Item } from 'app/types';
import { format } from 'date-fns';

type ActiveTab = 'calendar' | 'canvas' | 'gambling';

export default function MainShell({
  initialItems,
  initialMonth,
  userEmail,
}: {
  initialItems: Item[];
  initialMonth: string;
  userEmail: string;
}) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('calendar');

  // Shared state from Calendar → Canvas
  const [calendarDay, setCalendarDay] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [calendarMonth, setCalendarMonth] = useState(initialMonth);

  // "Open Day Canvas" handler — switches to Canvas tab in day mode for a specific day
  const openDayCanvas = useCallback((day: string) => {
    setCalendarDay(day);
    setActiveTab('canvas');
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg-root)] animate-fade-in">
      <header className="flex min-h-[38px] items-center gap-5 px-5 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 z-50 shadow-soft">
        <div className="text-xs font-bold text-white tracking-widest mr-2 select-none flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full bg-sky-500 shadow-[0_0_10px_rgba(56,189,248,0.6)]" />
          CALENDXR
        </div>
        <nav className="flex items-center gap-4">
          <button 
            onClick={() => setActiveTab('calendar')}
            className={`text-xs transition-all duration-200 uppercase tracking-wider ${activeTab === 'calendar' ? 'text-sky-400 font-semibold drop-shadow-[0_0_8px_rgba(56,189,248,0.4)]' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Calendar
          </button>
          <button 
            onClick={() => setActiveTab('canvas')}
            className={`text-xs transition-all duration-200 uppercase tracking-wider ${activeTab === 'canvas' ? 'text-sky-400 font-semibold drop-shadow-[0_0_8px_rgba(56,189,248,0.4)]' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Canvas
          </button>
          <button 
            onClick={() => setActiveTab('gambling')}
            className={`text-xs transition-all duration-200 uppercase tracking-wider ${activeTab === 'gambling' ? 'text-sky-400 font-semibold drop-shadow-[0_0_8px_rgba(56,189,248,0.4)]' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Gambling
          </button>
        </nav>
      </header>
      
      <div className="flex-1 min-h-0 overflow-auto relative">
        {activeTab === 'calendar' && (
          <CalendarShell 
            initialItems={initialItems} 
            initialMonth={initialMonth} 
            userEmail={userEmail}
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
