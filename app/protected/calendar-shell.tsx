'use client';

import React, { useState } from 'react';
import { Draft, Item } from 'app/types';
import { formatDateFull, parseDayKey, formatDayEU, formatTimeRange } from 'app/lib/datetime';

import { useMonthCalendar } from './hooks/use-month-calendar';
import { useAgentChat } from './hooks/use-agent-chat';
import { ItemFormState, emptyForm } from './hooks/use-calendar-data';

import { Sidebar } from './components/sidebar';
import { MonthGrid } from './components/month-grid';
import { DayPanel } from './components/day-panel';
import { EditModal } from './components/edit-modal';

export default function CalendarShell({
  initialItems,
  initialMonth,
  userEmail,
}: {
  initialItems: Item[];
  initialMonth: string;
  userEmail: string;
}) {
  const cal = useMonthCalendar(initialItems, initialMonth);

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

  // ── Item → FormState converters ──

  const toFormState = (item: Item): ItemFormState => ({
    ...emptyForm,
    ...item,
    id: typeof item.id === 'number' ? item.id : undefined,
    day: item.occurrenceDay ?? item.day,
    details: item.details ?? null,
    status: item.status ?? 'todo',
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
  });

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
        onDelete={(item) => cal.removeItem(item)}
        onDeleteSeries={(item) => cal.removeSeriesItem(item)}
        onToggleDone={(item) =>
          cal.markStatus(item, item.status === 'done' ? 'todo' : 'done')
        }
        onReorderUntimed={(newOrder) => cal.saveItemsOrder(newOrder)}
        onAddNew={openNew}
        chatSection={chatSection}
      />

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
