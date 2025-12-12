'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import { Draft, Item, ItemKind, TaskStatus } from 'app/types';
import {
  formatDateFull,
  formatDayHeading,
  formatDayKey,
  formatTimeValue,
  parseDayKey,
  rangeEndFromAnchor,
} from 'app/lib/datetime';

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
  return formatDayKey(new Date());
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
  const [showVoice, setShowVoice] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hydrated, setHydrated] = useState(false);

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
    const end = rangeEndFromAnchor(anchor, VISIBLE_DAYS);
    setLoading(true);
    setError(null);
    const fetchItems = async () => {
      const res = await fetch(`/api/items?start=${anchor}&end=${end}`);
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
  }, [anchor, hydrated]);

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

  async function saveItem(values: ItemFormState) {
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
      return;
    }
    const data = await res.json();
    if (values.id) {
      setItems((prev) => prev.map((it) => (it.id === values.id ? data.item : it)));
    } else {
      setItems((prev) => [...prev, data.item]);
    }
    setEditing(null);
    setDraft(null);
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

  function openFromDraft(d: Draft) {
    if (!d.day) return;
    setEditing({
      ...emptyForm,
      kind: d.kind === 'clarify' ? 'task' : d.kind,
      day: d.day,
      timeStart: d.timeStart || null,
      timeEnd: d.timeEnd || null,
      title: d.title,
      details: d.details ?? null,
    });
  }

  const changeAnchor = (next: string, pinOverride?: boolean) => {
    setAnchor(next);
    const shouldPin = pinOverride ?? next !== todayKey();
    setPinned(shouldPin);
  };

  const shiftAnchor = (delta: number) => changeAnchor(formatDayKey(addDays(parseDayKey(anchor), delta)), true);
  const goToday = () => changeAnchor(todayKey(), false);

  const rangeLabel = `${formatDateFull(parseDayKey(anchor))} → ${formatDateFull(
    addDays(parseDayKey(anchor), VISIBLE_DAYS - 1),
  )}`;

  return (
    <div className="px-3 sm:px-6 pb-12 pt-6 space-y-6 max-w-screen-2xl mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
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
        <div className="flex flex-col items-end text-sm text-slate-400">
          <span className="text-slate-300">{rangeLabel}</span>
          <span className="text-slate-500">Signed in: {userEmail}</span>
        </div>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {days.map((day) => {
          const key = formatDayKey(day);
          const dayItems = grouped[key] || [];
          return (
            <div
              key={key}
              className="bg-card rounded-2xl shadow-soft p-4 border border-slate-800 flex flex-col gap-3 min-h-[420px]"
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
                        <p className="text-sm font-semibold text-slate-100 leading-snug break-words">
                          {item.timeStart ? `${formatTimeValue(item.timeStart)} ` : '• '}
                          {item.title}
                        </p>
                        {item.details && (
                          <p className="text-xs text-slate-400 leading-snug break-words">{item.details}</p>
                        )}
                        {item.status && item.kind === 'task' && (
                          <p className="text-[11px] text-slate-500">Status: {item.status}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 text-xs text-sky-300 shrink-0">
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

      <div className="bg-card rounded-2xl p-4 border border-slate-800 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Voice capture</p>
            <p className="text-xs text-slate-500">Use your mic to draft an item, then confirm manually.</p>
          </div>
          <button
            className="rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 transition-colors"
            onClick={() => setShowVoice((v) => !v)}
          >
            {showVoice ? 'Hide' : 'Open'}
          </button>
        </div>
        {showVoice && (
          <VoiceDraft
            onDraft={(d) => {
              setDraft(d);
              if (d.kind !== 'clarify') openFromDraft(d);
            }}
          />
        )}
        {draft?.kind === 'clarify' && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            <p className="font-semibold">Need clarification</p>
            <p className="mt-1 break-words">{draft.title}</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-amber-100">
              {draft.questions?.map((q) => (
                <li key={q} className="break-words">
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {editing && (
        <EditModal
          values={editing}
          onClose={() => {
            setEditing(null);
            setDraft(null);
          }}
          onSave={saveItem}
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

function VoiceDraft({ onDraft }: { onDraft: (draft: Draft) => void }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [language, setLanguage] = useState<'ru-RU' | 'en-US'>('ru-RU');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) return;
    // @ts-ignore
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition not available in this browser.');
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event: any) => {
      const interim = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join(' ');
      setTranscript(interim);
    };

    recognition.onerror = (event: any) => {
      setError(event.error || 'Speech error');
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.start();
    return () => recognition.stop();
  }, [listening, language]);

  const sendDraft = async () => {
    if (!transcript.trim()) return;
    setError(null);
    const res = await fetch('/api/agent/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: transcript }),
    });
    if (!res.ok) {
      setError('Could not parse voice note');
      return;
    }
    const draft = await res.json();
    onDraft(draft);
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="flex gap-2 items-center flex-wrap">
        <button
          className={`px-4 py-2 text-sm rounded-full border transition-colors ${
            listening
              ? 'border-rose-400 bg-rose-500/10 text-rose-100'
              : 'border-slate-700 text-slate-100 hover:bg-slate-800'
          }`}
          onClick={() => {
            setTranscript('');
            setError(null);
            setListening((v) => !v);
          }}
        >
          {listening ? 'Stop capture' : 'Start capture'}
        </button>
        <button
          className="px-3 py-2 text-sm rounded-full border border-slate-700 text-slate-100 disabled:opacity-50 hover:bg-slate-800"
          disabled={!transcript}
          onClick={sendDraft}
        >
          Create draft
        </button>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="text-slate-300">Language</span>
          <div className="flex rounded-full border border-slate-700 overflow-hidden">
            {(['ru-RU', 'en-US'] as const).map((lang) => (
              <button
                key={lang}
                className={`px-3 py-1 text-xs uppercase tracking-wide transition-colors ${
                  language === lang ? 'bg-slate-800 text-sky-200' : 'text-slate-400 hover:text-slate-200'
                }`}
                onClick={() => setLanguage(lang)}
              >
                {lang === 'ru-RU' ? 'RU' : 'EN'}
              </button>
            ))}
          </div>
        </div>
        {transcript && <span className="text-xs text-slate-400 break-words">{transcript}</span>}
      </div>
      {error && <p className="text-sm text-rose-300">{error}</p>}
    </div>
  );
}
