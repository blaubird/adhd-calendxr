'use client';
import React, { useState } from 'react';
import CalendarShell from './calendar-shell';
import GamblingTab from './components/gambling/gambling-tab';
import { Item } from 'app/types';

export default function MainShell({
  initialItems,
  initialMonth,
  userEmail,
}: {
  initialItems: Item[];
  initialMonth: string;
  userEmail: string;
}) {
  const [activeTab, setActiveTab] = useState<'calendar' | 'canvas' | 'gambling'>('calendar');

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg-root)] animate-fade-in">
      <header className="flex items-center gap-8 px-8 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 z-50 shadow-soft">
        <div className="text-sm font-bold text-white tracking-widest mr-4 select-none flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-sky-500 shadow-[0_0_10px_rgba(56,189,248,0.6)]" />
          CALENDXR
        </div>
        <nav className="flex items-center gap-6">
          <button 
            onClick={() => setActiveTab('calendar')}
            className={`text-sm transition-all duration-200 uppercase tracking-wider ${activeTab === 'calendar' ? 'text-sky-400 font-semibold drop-shadow-[0_0_8px_rgba(56,189,248,0.4)]' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Calendar
          </button>
          <button 
            className="text-sm text-slate-700 cursor-not-allowed uppercase tracking-wider"
          >
            Canvas
          </button>
          <button 
            onClick={() => setActiveTab('gambling')}
            className={`text-sm transition-all duration-200 uppercase tracking-wider ${activeTab === 'gambling' ? 'text-sky-400 font-semibold drop-shadow-[0_0_8px_rgba(56,189,248,0.4)]' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Gambling
          </button>
        </nav>
      </header>
      
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'calendar' && (
          <CalendarShell 
            initialItems={initialItems} 
            initialMonth={initialMonth} 
            userEmail={userEmail} 
          />
        )}
        {activeTab === 'gambling' && <GamblingTab />}
      </div>
    </div>
  );
}
