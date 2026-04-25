'use client';

import React, { useState } from 'react';
import { Draft, Item } from 'app/types';
import {
  formatDateFull,
  formatDayEU,
  formatDayHeading,
  formatDayKey,
  formatTimeRange,
  formatTimeValue,
  parseDayKey,
} from 'app/lib/datetime';

import { useCalendarData, ItemFormState, emptyForm } from './hooks/use-calendar-data';
import { useAgentChat } from './hooks/use-agent-chat';
import { LiveClock } from './components/live-clock';
import { EditModal } from './components/edit-modal';

export default function WeekBoard({
  initialItems,
  initialStart,
  userEmail,
}: {
  initialItems: Item[];
  initialStart: string;
  userEmail: string;
}) {
  const {
    anchor,
    rangeEnd,
    days,
    grouped,
    loading,
    error,
    shiftAnchor,
    goToday,
    saveItem,
    saveSeriesItem,
    removeItem,
    markStatus,
  } = useCalendarData(initialItems, initialStart);

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
  } = useAgentChat(anchor, rangeEnd);

  const [editing, setEditing] = useState<ItemFormState | null>(null);
  const [confirmingDraft, setConfirmingDraft] = useState<number | null>(null);

  const rangeLabel = `${formatDateFull(parseDayKey(anchor))} → ${formatDateFull(parseDayKey(rangeEnd))}`;

  function openNew(day: string) {
    setEditing({ ...emptyForm, day });
  }

  const toFormStateFromItem = (item: Item): ItemFormState => ({
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
    status: d.kind === 'task' ? d.status ?? 'todo' : 'todo',
    recurrenceRule: d.recurrenceRule ?? null,
    recurrenceUntilDay: d.recurrenceUntilDay ?? null,
    recurrenceCount: d.recurrenceCount ?? null,
  });

  function openFromDraft(d: Draft) {
    setEditing(draftToFormState(d));
  }

  async function confirmDraft(index: number, draft: Draft) {
    setConfirmingDraft(index);
    const success = await saveItem(draftToFormState(draft));
    if (success) {
      setPendingDrafts((prev) => prev.filter((_, i) => i !== index));
    }
    setConfirmingDraft(null);
  }

  return (
    <div className="w-full max-w-[90vw] mx-auto px-3 sm:px-6 pb-12 pt-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 transition-colors"
              onClick={() => shiftAnchor(-1)}
            >
              <span className="text-xl leading-none w-4 text-center relative -top-px">&lt;</span>
              <span className="leading-none">Previous</span>
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 transition-colors"
              onClick={goToday}
            >
              Today
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 transition-colors"
              onClick={() => shiftAnchor(1)}
            >
              <span className="leading-none">Next</span>
              <span className="text-xl leading-none w-4 text-center relative -top-px">&gt;</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <span className="text-slate-300">{rangeLabel}</span>
            <span className="text-slate-500">Signed in: {userEmail}</span>
          </div>
        </div>
        <LiveClock />
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="pb-2 max-w-[90vw] mx-auto px-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full min-w-0">
          {days.map((day) => {
            const key = formatDayKey(day);
            const dayItems = grouped[key] || [];
            return (
              <div
                key={key}
                className="bg-card rounded-2xl shadow-soft p-4 border border-slate-800 flex flex-col gap-3 min-h-[440px] min-w-0"
              >
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{formatDayHeading(day)}</p>
                    <p className="text-lg font-semibold text-white break-words">{formatDateFull(day)}</p>
                  </div>
                  <button
                    className="text-sm text-sky-300 font-medium hover:text-sky-200 shrink-0"
                    onClick={() => openNew(key)}
                  >
                    + Add
                  </button>
                </div>
                <div className="space-y-2 flex-1 overflow-hidden min-w-0">
                  {loading && <p className="text-sm text-slate-500">Loading…</p>}
                  {!loading && dayItems.length === 0 && (
                    <p className="text-sm text-slate-500">Nothing planned.</p>
                  )}
                  {dayItems.map((item) => {
                    const isDone = item.kind === 'task' && item.status === 'done';
                    return (
                    <article
                      key={item.id}
                      className="rounded-xl border border-slate-700 px-3 py-2 bg-slate-900 hover:border-sky-500/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 space-y-1">
                          <p
                            className={`text-[13px] font-semibold leading-snug break-words ${
                              isDone ? 'line-through text-slate-400' : 'text-slate-100'
                            }`}
                          >
                            {item.timeStart ? `${formatTimeValue(item.timeStart)} ` : '• '}
                            {item.title}
                          </p>
                          {item.isOccurrence && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 text-[10px] px-2 py-1 text-sky-200 border border-slate-700">
                              <span className="text-xs">↻</span>
                              <span>{item.isOverride ? 'Edited occurrence' : 'Recurring'}</span>
                            </span>
                          )}
                          {item.details && (
                            <p
                              className={`text-[11px] leading-snug break-words whitespace-pre-wrap ${
                                isDone ? 'line-through text-slate-500 opacity-80' : 'text-slate-400'
                              }`}
                            >
                              {item.details}
                            </p>
                          )}
                          {item.status && item.kind === 'task' && (
                            <p
                              className={`text-[10px] ${
                                isDone ? 'text-slate-500 line-through opacity-80' : 'text-slate-500'
                              }`}
                            >
                              Status: {item.status}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 text-[11px] text-sky-300 shrink-0 items-end">
                          {item.kind === 'task' && (
                            <button
                              className="hover:text-sky-100"
                              onClick={() => markStatus(item, item.status === 'done' ? 'todo' : 'done')}
                            >
                              {item.status === 'done' ? 'Undo' : 'Done'}
                            </button>
                          )}
                          <button
                            className="hover:text-sky-100"
                            onClick={() => setEditing(toFormStateFromItem(item))}
                          >
                            {item.isOccurrence ? 'Edit occurrence' : 'Edit'}
                          </button>
                          <button
                            className="text-rose-300 hover:text-rose-200"
                            onClick={() => removeItem(item)}
                          >
                            {item.isOccurrence ? 'Delete occurrence' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card rounded-2xl p-4 border border-slate-800 shadow-soft space-y-4">
        <div>
          <p className="text-sm font-semibold text-white">AI drafts</p>
          <p className="text-xs text-slate-500">Describe plans in RU/EN. Confirm drafts before saving.</p>
        </div>

        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          {chatMessages.map((msg, idx) => (
            <div
              key={`${msg.role}-${idx}-${msg.content.slice(0, 12)}`}
              className={`w-fit max-w-full rounded-xl px-3 py-2 text-sm leading-relaxed break-words ${
                msg.role === 'user'
                  ? 'self-end bg-sky-900/60 text-sky-50 border border-sky-800'
                  : 'self-start bg-slate-900 text-slate-100 border border-slate-800'
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                {msg.role === 'user' ? 'You' : 'Assistant'}
              </p>
              <p className="whitespace-pre-wrap text-[13px]">{msg.content}</p>
            </div>
          ))}
        </div>
        {chatError && <p className="text-sm text-rose-300">{chatError}</p>}

        <div className="flex items-center gap-2 w-full min-w-0">
          <input
            className="flex-1 min-w-0 h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            placeholder="Сегодня 18:00 покушать рамен / Today 18:00 ramen"
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
            className="shrink-0 inline-flex items-center justify-center h-10 px-4 rounded-lg bg-sky-600 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={sendChatMessage}
            disabled={chatLoading || !chatInput.trim()}
          >
            {chatLoading ? 'Sending…' : 'Send'}
          </button>
        </div>

        {clarifications && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200 space-y-2">
            <p className="font-semibold">Need clarification</p>
            <ul className="list-disc list-inside space-y-1 text-amber-100">
              {clarifications.map((q) => (
                <li key={q} className="break-words">
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {pendingDrafts.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">Draft proposals</p>
            <div className="grid gap-3 md:grid-cols-2">
              {pendingDrafts.map((draft, idx) => (
                <div
                  key={`${draft.day}-${draft.title}-${idx}`}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">{formatDateFull(parseDayKey(draft.day))}</p>
                      <p className="text-[13px] font-semibold text-white break-words leading-snug">{draft.title}</p>
                      {draft.details && (
                         <p className="text-[11px] text-slate-400 whitespace-pre-wrap break-words">{draft.details}</p>
                      )}
                    </div>
                    <div className="text-right text-[11px] text-slate-400 space-y-1">
                      <span className="inline-flex rounded-full border border-slate-700 px-2 py-1 text-[10px] uppercase tracking-wide">
                        {draft.kind}
                      </span>
                      {draft.recurrenceRule && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 text-[10px] px-2 py-1 text-sky-200 border border-slate-700">
                          <span className="text-xs">↻</span>
                          <span>Recurring</span>
                        </span>
                      )}
                      <div className="text-slate-500">{draft.status || 'todo'}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
                    {formatTimeRange(draft.timeStart, draft.timeEnd) && (
                      <span className="rounded-full bg-slate-800 px-2 py-1 border border-slate-700">
                        {formatTimeRange(draft.timeStart, draft.timeEnd)}
                      </span>
                    )}
                    <span className="rounded-full bg-slate-800 px-2 py-1 border border-slate-700">{formatDayEU(draft.day)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
                      onClick={() => openFromDraft(draft)}
                    >
                      Edit draft
                    </button>
                    <button
                      className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
                      disabled={confirmingDraft === idx}
                      onClick={() => confirmDraft(idx, draft)}
                    >
                      {confirmingDraft === idx ? 'Saving…' : 'Confirm'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <EditModal
          values={editing}
          onClose={() => {
            setEditing(null);
          }}
          onSave={async (values) => {
            const success = await saveItem(values);
            if (success) setEditing(null);
          }}
          onSaveSeries={async (masterId, values) => {
            const success = await saveSeriesItem(masterId, values);
            if (success) setEditing(null);
          }}
        />
      )}
    </div>
  );
}
