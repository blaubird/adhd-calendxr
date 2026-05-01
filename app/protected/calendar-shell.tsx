'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Draft, Item } from 'app/types';
import { formatDateFull, parseDayKey, formatDayEU, formatTimeRange, formatTimeValue } from 'app/lib/datetime';

import { useMonthCalendar } from './hooks/use-month-calendar';
import { useAgentChat } from './hooks/use-agent-chat';
import { ItemFormState, emptyForm } from './hooks/use-calendar-data';

import { Sidebar } from './components/sidebar';
import { MonthGrid } from './components/month-grid';
import { DayPanel } from './components/day-panel';
import { EditModal } from './components/edit-modal';

type UndoToast = {
  message: string;
  onUndo: () => Promise<void>;
};

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function SearchOverlay({
  open,
  query,
  results,
  loading,
  error,
  onQueryChange,
  onClose,
  onPick,
}: {
  open: boolean;
  query: string;
  results: Item[];
  loading: boolean;
  error: string | null;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onPick: (item: Item) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

  return (
    <div className="search-overlay" role="dialog" aria-modal="true">
      <div className="search-panel">
        <div className="search-input-row">
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Search title"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
            }}
          />
          <button className="search-close-btn" onClick={onClose} type="button">Close</button>
        </div>
        <div className="search-results">
          {!query.trim() && <p className="search-empty">Type to search titles.</p>}
          {query.trim() && loading && <p className="search-empty">Searching...</p>}
          {query.trim() && error && <p className="search-empty">{error}</p>}
          {query.trim() && !loading && !error && results.length === 0 && <p className="search-empty">No matching items.</p>}
          {results.map((item) => (
            <button key={String(item.id)} className="search-result-row" onClick={() => onPick(item)} type="button">
              <span className="search-result-title">{item.title}</span>
              <span className="search-result-meta">
                {formatDayEU(item.occurrenceDay ?? item.day)}
                {item.timeStart ? ` · ${formatTimeValue(item.timeStart)}` : ''}
                {' · '}
                {item.timeStart ? 'Event' : 'Task'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CalendarShell({
  initialItems,
  initialMonth,
  userEmail,
  onSelectedDayChange,
  onMonthChange,
  onOpenDayCanvas,
}: {
  initialItems: Item[];
  initialMonth: string;
  userEmail: string;
  onSelectedDayChange?: (day: string) => void;
  onMonthChange?: (month: string) => void;
  onOpenDayCanvas?: (day: string) => void;
}) {
  const cal = useMonthCalendar(initialItems, initialMonth);

  // Sync selected day and month to parent
  useEffect(() => {
    onSelectedDayChange?.(cal.selectedDay);
  }, [cal.selectedDay, onSelectedDayChange]);

  useEffect(() => {
    onMonthChange?.(cal.monthKey);
  }, [cal.monthKey, onMonthChange]);

  const {
    pendingDrafts,
    setPendingDrafts,
    clarifications,
    chatMessages,
    chatInput,
    setChatInput,
    chatLoading,
    chatError,
    sendChatMessage,
  } = useAgentChat(cal.startKey, cal.endKey);

  const [editing, setEditing] = useState<ItemFormState | null>(null);
  const [editingDraftIndex, setEditingDraftIndex] = useState<number | null>(null);
  const [confirmingDraft, setConfirmingDraft] = useState<number | null>(null);
  const [undoToast, setUndoToast] = useState<UndoToast | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Item[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === '/' || (event.ctrlKey && event.key.toLowerCase() === 'k')) {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const res = await fetch(`/api/items/search?q=${encodeURIComponent(query)}&limit=30`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setSearchError('Search failed.');
          setSearchResults([]);
          return;
        }
        const data = await res.json();
        setSearchResults(Array.isArray(data.items) ? data.items : []);
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          setSearchError('Search failed.');
          setSearchResults([]);
        }
      } finally {
        setSearchLoading(false);
      }
    }, 240);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [searchOpen, searchQuery]);

  function highlightIdForItem(item: Item) {
    const day = item.occurrenceDay ?? item.day;
    if (item.isOccurrence) return String(item.id);
    if (item.recurrenceRule && typeof item.id === 'number') return `r:${item.id}:${day}`;
    return String(item.id);
  }

  function navigateAndHighlight(item: Item) {
    const day = item.occurrenceDay ?? item.day;
    cal.selectDay(day);
    setHighlightedItemId(highlightIdForItem(item));
    window.setTimeout(() => setHighlightedItemId(null), 2200);
  }

  // ── Item → FormState converters ──

  const toFormState = (item: Item): ItemFormState => ({
    ...emptyForm,
    ...item,
    id: typeof item.id === 'number' ? item.id : undefined,
    day: item.occurrenceDay ?? item.day,
    details: item.details ?? null,
    status: item.status ?? 'todo',
    planningPeriod: item.planningPeriod ?? null,
    planningOrder: item.planningOrder ?? null,
    color: item.color ?? null,
    order: item.order ?? 0,
    recurrenceRule: item.recurrenceRule ?? null,
    recurrenceUntilDay: item.recurrenceUntilDay ?? null,
    recurrenceCount: item.recurrenceCount ?? null,
    recurrenceExdates: item.recurrenceExdates ?? [],
    parentId: item.parentId ?? null,
    occurrenceDay: item.occurrenceDay ?? (item.isOccurrence ? item.day : null),
    sourceId: item.sourceId,
    isOccurrence: item.isOccurrence,
    isOverride: item.isOverride,
  });

  const draftToFormState = (d: Draft): ItemFormState => ({
    ...emptyForm,
    kind: d.kind,
    day: d.day,
    timeStart: d.timeStart ?? null,
    timeEnd: d.timeEnd ?? null,
    title: d.title,
    details: d.details ?? null,
    status: d.status ?? 'todo',
    color: null,
    order: 0,
    recurrenceRule: d.recurrenceRule ?? null,
    recurrenceUntilDay: d.recurrenceUntilDay ?? null,
    recurrenceCount: d.recurrenceCount ?? null,
    planningPeriod: null,
    planningOrder: null,
  });

  function showUndo(message: string, onUndo: () => Promise<void>) {
    setUndoToast({ message, onUndo });
  }

  async function runUndo() {
    const current = undoToast;
    if (!current) return;
    setUndoToast(null);
    await current.onUndo();
  }

  async function restoreItemSnapshot(item: Item) {
    const values = {
      ...toFormState(item),
      id: undefined,
      sourceId: undefined,
      isOccurrence: false,
      isOverride: false,
      parentId: null,
      occurrenceDay: null,
    };
    await cal.saveItem(values);
  }

  async function updateItemInline(item: Item, patch: Partial<Item>) {
    const nextTimeStart = Object.prototype.hasOwnProperty.call(patch, 'timeStart')
      ? patch.timeStart ?? null
      : item.timeStart;
    const next = {
      ...toFormState(item),
      kind: nextTimeStart ? 'event' as const : 'task' as const,
      planningPeriod: nextTimeStart ? null : patch.planningPeriod ?? item.planningPeriod ?? null,
      planningOrder: nextTimeStart ? null : patch.planningOrder ?? item.planningOrder ?? null,
    };
    if (patch.title !== undefined) next.title = patch.title;
    if (Object.prototype.hasOwnProperty.call(patch, 'timeStart')) next.timeStart = patch.timeStart ?? null;
    if (Object.prototype.hasOwnProperty.call(patch, 'timeEnd')) next.timeEnd = patch.timeEnd ?? null;
    return cal.saveItem(next);
  }

  async function deleteWithUndo(item: Item) {
    const success = await cal.removeItem(item);
    if (success && typeof item.id === 'number' && !item.isOccurrence) {
      showUndo('Deleted', () => restoreItemSnapshot(item));
    }
  }

  async function moveWithUndo(item: Item, values: { day: string; timeStart: string | null; timeEnd: string | null }) {
    const previous = toFormState(item);
    const success = await cal.saveItem({
      ...previous,
      day: values.day,
      timeStart: values.timeStart,
      timeEnd: values.timeEnd,
      kind: values.timeStart ? 'event' : 'task',
      planningPeriod: values.timeStart ? null : previous.planningPeriod,
      planningOrder: values.timeStart ? null : previous.planningOrder,
    });
    if (success && typeof item.id === 'number' && !item.isOccurrence) {
      showUndo('Moved', async () => {
        await cal.saveItem(previous);
      });
    }
  }

  async function toggleDoneWithUndo(item: Item) {
    const previous = toFormState(item);
    const success = await cal.markStatus(item, item.status === 'done' ? 'todo' : 'done');
    if (success && typeof item.id === 'number' && !item.isOccurrence) {
      showUndo('Updated', async () => {
        await cal.saveItem(previous);
      });
    }
  }

  async function planItemsWithUndo(nextItems: Item[]) {
    const previous = nextItems
      .map((item) => cal.items.find((candidate) => String(candidate.id) === String(item.id)))
      .filter((item): item is Item => Boolean(item));
    const success = await cal.saveItemsOrder(nextItems);
    if (success && previous.length) {
      showUndo('Moved', async () => {
        await cal.saveItemsOrder(previous);
      });
    }
    return success;
  }

  function openNew(day: string) {
    setEditingDraftIndex(null);
    setEditing({ ...emptyForm, day });
  }

  function openFromDraft(d: Draft, index: number) {
    setEditingDraftIndex(index);
    setEditing(draftToFormState(d));
  }

  async function confirmDraft(index: number, draft: Draft) {
    setConfirmingDraft(index);
    const success = await cal.saveItem(draftToFormState(draft));
    if (success) {
      setPendingDrafts((prev) => prev.filter((_, i) => i !== index));
    }
    setConfirmingDraft(null);
  }

  // ── AI Chat section rendered inside DayPanel ──

  const chatSection = (
    <div className="ai-chat-section">
      <div className="ai-chat-header">
        <p className="ai-chat-title">AI Drafts</p>
        <p className="ai-chat-subtitle">Describe plans in RU/EN. Confirm drafts before saving.</p>
      </div>

      <div className="ai-chat-messages">
        {chatMessages.map((msg, idx) => (
          <div
            key={`${msg.role}-${idx}-${msg.content.slice(0, 12)}`}
            className={`ai-chat-bubble ${msg.role === 'user' ? 'ai-chat-bubble--user' : 'ai-chat-bubble--assistant'}`}
          >
            <p className="ai-chat-bubble-role">
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </p>
            <p className="ai-chat-bubble-content">{msg.content}</p>
          </div>
        ))}
      </div>
      {chatError && <p className="ai-chat-error">{chatError}</p>}

      <div className="ai-chat-input-row">
        <input
          className="ai-chat-input"
          placeholder="Сегодня 18:00 рамен / Today 18:00 ramen"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendChatMessage();
            }
          }}
        />
        <button
          className="ai-chat-send-btn"
          onClick={sendChatMessage}
          disabled={chatLoading || !chatInput.trim()}
          type="button"
        >
          {chatLoading ? '…' : 'Send'}
        </button>
      </div>

      {clarifications && (
        <div className="ai-chat-clarification">
          <p className="ai-chat-clarification-title">Need clarification</p>
          <ul>
            {clarifications.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {pendingDrafts.length > 0 && (
        <div className="ai-drafts-list">
          <p className="ai-drafts-heading">Draft proposals</p>
          {pendingDrafts.map((draft, idx) => (
            <div key={`${draft.day}-${draft.title}-${idx}`} className="ai-draft-card">
              <div className="ai-draft-card-top">
                <div>
                  <p className="ai-draft-card-date">{formatDateFull(parseDayKey(draft.day))}</p>
                  <p className="ai-draft-card-title">{draft.title}</p>
                  {draft.details && (
                    <p className="ai-draft-card-details">{draft.details}</p>
                  )}
                </div>
                <div className="ai-draft-card-meta">
                  <span className="ai-draft-card-kind">{draft.kind}</span>
                  {draft.recurrenceRule && (
                    <span className="ai-draft-card-recurrence">↻ Recurring</span>
                  )}
                  <span className="ai-draft-card-status">{draft.status || 'todo'}</span>
                </div>
              </div>
              <div className="ai-draft-card-time">
                {formatTimeRange(draft.timeStart, draft.timeEnd) && (
                  <span className="ai-draft-card-time-badge">
                    {formatTimeRange(draft.timeStart, draft.timeEnd)}
                  </span>
                )}
                <span className="ai-draft-card-day-badge">{formatDayEU(draft.day)}</span>
              </div>
              <div className="ai-draft-card-actions">
                <button
                  className="ai-draft-edit-btn"
                  onClick={() => openFromDraft(draft, idx)}
                  type="button"
                >
                  Edit draft
                </button>
                <button
                  className="ai-draft-confirm-btn"
                  disabled={confirmingDraft === idx}
                  onClick={() => confirmDraft(idx, draft)}
                  type="button"
                >
                  {confirmingDraft === idx ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="calendar-layout">
      <Sidebar
        year={cal.year}
        month={cal.month}
        onPrev={cal.goPrevMonth}
        onNext={cal.goNextMonth}
        onToday={cal.goToday}
        userEmail={userEmail}
        items={cal.items}
        onPickNextUp={navigateAndHighlight}
      />

      <main className="calendar-center">
        {cal.error && <p className="calendar-error">{cal.error}</p>}
        <MonthGrid
          key={cal.monthKey}
          year={cal.year}
          month={cal.month}
          daysInMonth={cal.daysInMonth}
          firstDayWeekday={cal.firstDayWeekday}
          dayNumbers={cal.dayNumbers}
          dayKeyFn={cal.dayKey}
          grouped={cal.grouped}
          selectedDay={cal.selectedDay}
          onSelectDay={cal.selectDay}
          onPickItem={navigateAndHighlight}
        />
      </main>

      <DayPanel
        selectedDay={cal.selectedDay}
        items={cal.selectedDayItems}
        loading={cal.loading}
        onEdit={(item) => {
          setEditingDraftIndex(null);
          setEditing(toFormState(item));
        }}
        onDelete={deleteWithUndo}
        onDeleteSeries={(item) => cal.removeSeriesItem(item)}
        onMove={moveWithUndo}
        onToggleDone={toggleDoneWithUndo}
        onInlineUpdate={updateItemInline}
        onPlanItems={planItemsWithUndo}
        onAddNew={openNew}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenDayCanvas={onOpenDayCanvas}
        highlightedItemId={highlightedItemId}
        chatSection={chatSection}
      />

      <SearchOverlay
        open={searchOpen}
        query={searchQuery}
        results={searchResults}
        loading={searchLoading}
        error={searchError}
        onQueryChange={setSearchQuery}
        onClose={() => setSearchOpen(false)}
        onPick={(item) => {
          navigateAndHighlight(item);
          setSearchOpen(false);
          setSearchQuery('');
        }}
      />

      {undoToast && (
        <div className="calendar-toast">
          <span>{undoToast.message}</span>
          <button onClick={runUndo} type="button">Undo</button>
        </div>
      )}

      {editing && (
        <EditModal
          values={editing}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const success = await cal.saveItem(values);
            if (success) {
              // If this save came from editing a draft, remove it from pending
              if (editingDraftIndex !== null) {
                setPendingDrafts((prev) => prev.filter((_, i) => i !== editingDraftIndex));
                setEditingDraftIndex(null);
              }
              setEditing(null);
            }
          }}
          onSaveSeries={async (masterId, values) => {
            const success = await cal.saveSeriesItem(masterId, values);
            if (success) setEditing(null);
          }}
        />
      )}
    </div>
  );
}
