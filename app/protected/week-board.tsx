'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import { Draft, Item, ItemKind, TaskStatus } from 'app/types';
import {
  formatDateFull,
  formatDayHeading,
  formatDayKey,
  formatTimeRange,
  formatTimeValue,
  nowInTz,
  parseDayKey,
  rangeEndFromAnchor,
  TIMEZONE,
} from 'app/lib/datetime';
import { useSpeechToText } from 'app/lib/use-speech-to-text';

type ItemFormState = {
  id?: number;
  kind: ItemKind;
  day: string;
  timeStart: string | null;
  timeEnd: string | null;
  title: string;
  details: string | null;
  status: TaskStatus;
};

const emptyForm: ItemFormState = {
  kind: 'task',
  day: formatDayKey(new Date()),
  timeStart: null,
  timeEnd: null,
  title: '',
  details: null,
  status: 'todo',
};

const VISIBLE_DAYS = 4;
const ANCHOR_STORAGE_KEY = 'calendar-anchor';
const PIN_STORAGE_KEY = 'calendar-anchor-pinned';
const LAST_SEEN_DAY_KEY = 'calendar-last-seen';

function todayKey() {
  return formatDayKey(nowInTz(new Date()));
}

function sortItems(items: Item[]) {
  return [...items].sort((a, b) => {
    const aTimed = !!a.timeStart;
    const bTimed = !!b.timeStart;
    if (aTimed !== bTimed) return aTimed ? -1 : 1;
    if (aTimed && bTimed) {
      if (a.timeStart === b.timeStart) return a.id - b.id;
      return a.timeStart! < b.timeStart! ? -1 : 1;
    }
    return a.id - b.id;
  });
}

export default function WeekBoard({
  initialItems,
  initialStart,
  userEmail,
}: {
  initialItems: Item[];
  initialStart: string;
  userEmail: string;
}) {
  const [anchor, setAnchor] = useState(initialStart);
  const [pinned, setPinned] = useState(false);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ItemFormState | null>(null);
  const [pendingDrafts, setPendingDrafts] = useState<Draft[]>([]);
  const [clarifications, setClarifications] = useState<string[] | null>(null);
  const [chatMessages, setChatMessages] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([
    {
      role: 'assistant',
      content: 'Describe what to schedule (RU/EN). I will create drafts for you to confirm.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [confirmingDraft, setConfirmingDraft] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [voiceLang, setVoiceLang] = useState<'ru-RU' | 'en-GB'>('ru-RU');
  const [speechText, setSpeechText] = useState('');

  const speech = useSpeechToText({
    language: voiceLang,
    onFinal: (text) => {
      setSpeechText('');
      setChatInput((prev) => (prev ? `${prev} ${text}` : text));
    },
    onInterim: setSpeechText,
  });

  const rangeEnd = useMemo(() => rangeEndFromAnchor(anchor, VISIBLE_DAYS), [anchor]);

  useEffect(() => {
    const savedAnchor = typeof window !== 'undefined' ? localStorage.getItem(ANCHOR_STORAGE_KEY) : null;
    const savedPinned = typeof window !== 'undefined' ? localStorage.getItem(PIN_STORAGE_KEY) : null;
    if (savedAnchor) setAnchor(savedAnchor);
    if (savedPinned) setPinned(savedPinned === '1');
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAST_SEEN_DAY_KEY, todayKey());
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setLoading(true);
    setError(null);
    const fetchItems = async () => {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[items] fetching range', { anchor, end: rangeEnd });
      }
      const res = await fetch(`/api/items?start=${anchor}&end=${rangeEnd}`);
      if (!res.ok) {
        setError('Could not load items');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setItems(data.items);
      setLoading(false);
    };
    fetchItems();
  }, [anchor, hydrated, rangeEnd]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(ANCHOR_STORAGE_KEY, anchor);
    localStorage.setItem(PIN_STORAGE_KEY, pinned ? '1' : '0');
  }, [anchor, pinned, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const checkDayRollover = () => {
      const current = todayKey();
      const lastSeen = localStorage.getItem(LAST_SEEN_DAY_KEY);
      if (lastSeen !== current) {
        localStorage.setItem(LAST_SEEN_DAY_KEY, current);
        if (!pinned) {
          setAnchor(current);
        }
      }
    };
    const id = setInterval(checkDayRollover, 60 * 1000);
    checkDayRollover();
    return () => clearInterval(id);
  }, [pinned, hydrated]);

  const days = useMemo(() => {
    const startDate = parseDayKey(anchor);
    return Array.from({ length: VISIBLE_DAYS }, (_, i) => addDays(startDate, i));
  }, [anchor]);

  const grouped = useMemo(() => {
    const map: Record<string, Item[]> = {};
    for (const item of items) {
      map[item.day] = map[item.day] || [];
      map[item.day].push(item);
    }
    Object.keys(map).forEach((day) => (map[day] = sortItems(map[day])));
    return map;
  }, [items]);

  async function saveItem(values: ItemFormState): Promise<boolean> {
    setError(null);
    const payload = { ...values } as any;
    if (payload.kind === 'event') payload.status = null;
    if (!payload.timeStart) payload.timeStart = null;
    if (!payload.timeEnd) payload.timeEnd = null;
    const method = values.id ? 'PUT' : 'POST';
    const url = values.id ? `/api/items/${values.id}` : '/api/items';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setError('Unable to save item');
      return false;
    }
    const data = await res.json();
    if (values.id) {
      setItems((prev) => prev.map((it) => (it.id === values.id ? data.item : it)));
    } else {
      setItems((prev) => [...prev, data.item]);
    }
    setEditing(null);
    return true;
  }

  async function removeItem(id: number) {
    setError(null);
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('Unable to delete item');
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function markStatus(item: Item, status: TaskStatus) {
    await saveItem({ ...item, status });
  }

  function openNew(day: string) {
    setEditing({ ...emptyForm, day });
  }

  const draftToFormState = (d: Draft): ItemFormState => ({
    ...emptyForm,
    kind: d.kind,
    day: d.day,
    timeStart: d.timeStart ?? null,
    timeEnd: d.timeEnd ?? null,
    title: d.title,
    details: d.details ?? null,
    status: d.kind === 'task' ? d.status ?? 'todo' : 'todo',
  });

  function openFromDraft(d: Draft) {
    setEditing(draftToFormState(d));
  }

  const changeAnchor = (next: string, pinOverride?: boolean) => {
    setAnchor(next);
    const shouldPin = pinOverride ?? next !== todayKey();
    setPinned(shouldPin);
  };

  const shiftAnchor = (delta: number) => changeAnchor(formatDayKey(addDays(parseDayKey(anchor), delta)), true);
  const goToday = () => changeAnchor(todayKey(), false);

  const rangeLabel = `${formatDateFull(parseDayKey(anchor))} → ${formatDateFull(parseDayKey(rangeEnd))}`;

  async function confirmDraft(index: number, draft: Draft) {
    setConfirmingDraft(index);
    const success = await saveItem(draftToFormState(draft));
    if (success) {
      setPendingDrafts((prev) => prev.filter((_, i) => i !== index));
    }
    setConfirmingDraft(null);
  }

  async function sendChatMessage() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const userMessage = { role: 'user' as const, content: text };
    const history = [...chatMessages, userMessage];
    setChatMessages(history);
    setChatInput('');
    setChatError(null);
    setChatLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, range: { start: anchor, end: rangeEnd } }),
      });

      if (!res.ok) {
        setChatError('AI is unavailable right now. Please try again.');
        setChatMessages((msgs) => [
          ...msgs,
          { role: 'assistant', content: 'Sorry, I could not reach the planner AI right now.' },
        ]);
        return;
      }

      const data = await res.json();
      if (data.needClarification) {
        setClarifications(data.questions || []);
        setPendingDrafts([]);
        setChatMessages((msgs) => [
          ...msgs,
          {
            role: 'assistant',
            content: `Need clarification:\n${(data.questions || []).join('\n')}`,
          },
        ]);
        return;
      }

      if (data.drafts && Array.isArray(data.drafts)) {
        setPendingDrafts(data.drafts);
        setClarifications(null);
        setChatMessages((msgs) => [
          ...msgs,
          {
            role: 'assistant',
            content: `Created ${data.drafts.length} draft(s). Review and confirm below.`,
          },
        ]);
        return;
      }

      setChatMessages((msgs) => [
        ...msgs,
        { role: 'assistant', content: 'I could not produce drafts from that input.' },
      ]);
    } catch (e) {
      setChatError('Could not reach the AI right now.');
      setChatMessages((msgs) => [
        ...msgs,
        { role: 'assistant', content: 'Something went wrong while talking to the AI.' },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="px-3 sm:px-6 pb-12 pt-6 space-y-6 max-w-6xl mx-auto w-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 transition-colors"
              onClick={() => shiftAnchor(-1)}
            >
              ◀ Previous
            </button>
            <button
              className="rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 transition-colors"
              onClick={goToday}
            >
              Today
            </button>
            <button
              className="rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 transition-colors"
              onClick={() => shiftAnchor(1)}
            >
              Next ▶
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

      <div className="overflow-x-auto pb-2">
        <div className="grid grid-flow-col auto-cols-[minmax(300px,1fr)] gap-4 min-w-full">
          {days.map((day) => {
            const key = formatDayKey(day);
            const dayItems = grouped[key] || [];
            return (
              <div
                key={key}
                className="bg-card rounded-2xl shadow-soft p-4 border border-slate-800 flex flex-col gap-3 min-h-[440px]"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{formatDayHeading(day)}</p>
                    <p className="text-lg font-semibold text-white">{formatDateFull(day)}</p>
                  </div>
                  <button
                    className="text-sm text-sky-300 font-medium hover:text-sky-200"
                    onClick={() => openNew(key)}
                  >
                    + Add
                  </button>
                </div>
                <div className="space-y-2 flex-1 overflow-hidden">
                  {loading && <p className="text-sm text-slate-500">Loading…</p>}
                  {!loading && dayItems.length === 0 && (
                    <p className="text-sm text-slate-500">Nothing planned.</p>
                  )}
                  {dayItems.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-xl border border-slate-700 px-3 py-2 bg-slate-900 hover:border-sky-500/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-[13px] font-semibold text-slate-100 leading-snug break-words">
                            {item.timeStart ? `${formatTimeValue(item.timeStart)} ` : '• '}
                            {item.title}
                          </p>
                          {item.details && (
                            <p className="text-[11px] text-slate-400 leading-snug break-words whitespace-pre-wrap">
                              {item.details}
                            </p>
                          )}
                          {item.status && item.kind === 'task' && (
                            <p className="text-[10px] text-slate-500">Status: {item.status}</p>
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
                          <button className="hover:text-sky-100" onClick={() => setEditing({ ...item })}>
                            Edit
                          </button>
                          <button className="text-rose-300 hover:text-rose-200" onClick={() => removeItem(item.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card rounded-2xl p-4 border border-slate-800 shadow-soft space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-white">AI chat drafts</p>
            <p className="text-xs text-slate-500">Describe plans in RU/EN. Confirm drafts before saving.</p>
          </div>
          <span className="text-[11px] text-slate-500">Server-side OpenRouter</span>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
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
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  speech.listening
                    ? 'border-amber-400 text-amber-200 bg-amber-500/10'
                    : 'border-slate-700 text-slate-100 hover:bg-slate-800'
                }`}
                onClick={() => (speech.listening ? speech.stop() : speech.start())}
                disabled={!speech.supported}
                title={speech.supported ? 'Voice input' : 'Voice unavailable'}
              >
                {speech.listening ? 'Stop mic' : '🎙️ Speak'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <label className="flex items-center gap-2">
                <span>Voice language</span>
                <select
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
                  value={voiceLang}
                  onChange={(e) => setVoiceLang(e.target.value as 'ru-RU' | 'en-GB')}
                >
                  <option value="ru-RU">RU</option>
                  <option value="en-GB">EN</option>
                </select>
              </label>
              {speechText && <span className="text-amber-200">Interim: {speechText}</span>}
              {!speech.supported && <span className="text-rose-300">Speech recognition not supported in this browser.</span>}
              {speech.error && <span className="text-rose-300">{speech.error}</span>}
            </div>
          </div>
          <button
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed"
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
                      <div className="text-slate-500">{draft.status || 'todo'}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
                    {formatTimeRange(draft.timeStart, draft.timeEnd) && (
                      <span className="rounded-full bg-slate-800 px-2 py-1 border border-slate-700">
                        {formatTimeRange(draft.timeStart, draft.timeEnd)}
                      </span>
                    )}
                    <span className="rounded-full bg-slate-800 px-2 py-1 border border-slate-700">{formatDayKey(parseDayKey(draft.day))}</span>
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
            await saveItem(values);
          }}
        />
      )}
    </div>
  );
}

function EditModal({
  values,
  onClose,
  onSave,
}: {
  values: ItemFormState;
  onClose: () => void;
  onSave: (values: ItemFormState) => Promise<void>;
}) {
  const [local, setLocal] = useState(values);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setLocal(values), [values]);

  const update = (key: keyof ItemFormState, value: any) =>
    setLocal((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSave(local);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-4 z-20">
      <div className="bg-slate-900 rounded-2xl shadow-soft w-full max-w-xl p-5 space-y-4 border border-slate-700">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-400">{local.id ? 'Edit item' : 'New item'}</p>
            <h2 className="text-xl font-semibold text-white">{local.title || 'Untitled'}</h2>
          </div>
          <button className="text-slate-400 text-sm hover:text-slate-200" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">Kind</span>
            <select
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={local.kind}
              onChange={(e) => update('kind', e.target.value as ItemKind)}
            >
              <option value="event">Event</option>
              <option value="task">Task</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">Day</span>
            <input
              type="date"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={local.day}
              onChange={(e) => update('day', e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">Start</span>
            <input
              type="time"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={formatTimeValue(local.timeStart)}
              onChange={(e) => update('timeStart', e.target.value || null)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">End</span>
            <input
              type="time"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={formatTimeValue(local.timeEnd)}
              onChange={(e) => update('timeEnd', e.target.value || null)}
            />
          </label>
          <label className="flex flex-col gap-1 col-span-2">
            <span className="text-slate-300">Title</span>
            <input
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={local.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="Dentist, call with Alex…"
            />
          </label>
          <label className="flex flex-col gap-1 col-span-2">
            <span className="text-slate-300">Details</span>
            <textarea
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={local.details || ''}
              onChange={(e) => update('details', e.target.value || null)}
              placeholder="Location, prep, notes"
              rows={3}
            />
          </label>
          {local.kind === 'task' && (
            <label className="flex flex-col gap-1">
              <span className="text-slate-300">Status</span>
              <select
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                value={local.status || 'todo'}
                onChange={(e) => update('status', e.target.value as TaskStatus)}
              >
                <option value="todo">To-do</option>
                <option value="done">Done</option>
                <option value="canceled">Canceled</option>
              </select>
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 text-sm rounded-lg border border-slate-700 text-slate-100 hover:bg-slate-800"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-60"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {local.id ? 'Save changes' : 'Add item'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: TIMEZONE,
  }).format(now);
  const date = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: TIMEZONE,
  }).format(now);

  return (
    <div className="text-right">
      <p className="text-3xl font-semibold text-white leading-tight">{time}</p>
      <p className="text-sm text-slate-400">{date}</p>
    </div>
  );
}
