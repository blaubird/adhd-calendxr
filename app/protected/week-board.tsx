'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { Draft, Item, ItemKind, TaskStatus } from 'app/types';

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
  day: format(new Date(), 'yyyy-MM-dd'),
  timeStart: null,
  timeEnd: null,
  title: '',
  details: null,
  status: 'todo',
};

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
  const [start, setStart] = useState(initialStart);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ItemFormState | null>(null);
  const [showVoice, setShowVoice] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const days = useMemo(() => {
    const startDate = parseISO(start);
    return Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
  }, [start]);

  useEffect(() => {
    if (start === initialStart) return;
    setLoading(true);
    setError(null);
    const fetchItems = async () => {
      const end = format(addDays(parseISO(start), 6), 'yyyy-MM-dd');
      const res = await fetch(`/api/items?start=${start}&end=${end}`);
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
  }, [start, initialStart]);

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

  return (
    <div className="px-4 pb-10 pt-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            className="rounded-full border border-slate-200 px-3 py-2 text-sm hover:bg-white"
            onClick={() => setStart(format(addDays(parseISO(start), -7), 'yyyy-MM-dd'))}
          >
            ◀ Previous
          </button>
          <button
            className="rounded-full border border-slate-200 px-3 py-2 text-sm hover:bg-white"
            onClick={() => setStart(format(new Date(), 'yyyy-MM-dd'))}
          >
            Today
          </button>
          <button
            className="rounded-full border border-slate-200 px-3 py-2 text-sm hover:bg-white"
            onClick={() => setStart(format(addDays(parseISO(start), 7), 'yyyy-MM-dd'))}
          >
            Next ▶
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span className="text-slate-500">Signed in:</span> {userEmail}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayItems = grouped[key] || [];
          return (
            <div key={key} className="bg-card rounded-2xl shadow-soft p-4 border border-slate-100 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{format(day, 'EEE')}</p>
                  <p className="text-lg font-semibold text-slate-900">{format(day, 'MMM d')}</p>
                </div>
                <button
                  className="text-sm text-indigo-600 font-medium hover:text-indigo-500"
                  onClick={() => openNew(key)}
                >
                  + Add
                </button>
              </div>
              <div className="space-y-2">
                {loading && <p className="text-sm text-slate-400">Loading…</p>}
                {!loading && dayItems.length === 0 && (
                  <p className="text-sm text-slate-400">Nothing planned.</p>
                )}
                {dayItems.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-slate-200 px-3 py-2 bg-white hover:border-indigo-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {item.timeStart ? `${item.timeStart} ` : '• '}
                          {item.title}
                        </p>
                        {item.details && (
                          <p className="text-xs text-slate-500 mt-1 leading-tight">{item.details}</p>
                        )}
                        {item.status && item.kind === 'task' && (
                          <p className="text-[11px] text-slate-500 mt-1">Status: {item.status}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 text-xs text-indigo-600">
                        {item.kind === 'task' && (
                          <button onClick={() => markStatus(item, item.status === 'done' ? 'todo' : 'done')}>
                            {item.status === 'done' ? 'Undo' : 'Done'}
                          </button>
                        )}
                        <button onClick={() => setEditing({ ...item })}>Edit</button>
                        <button className="text-rose-600" onClick={() => removeItem(item.id)}>
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

      <div className="bg-card rounded-2xl p-4 border border-slate-200 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Voice capture</p>
            <p className="text-xs text-slate-500">Use your mic to draft an item, then confirm manually.</p>
          </div>
          <button
            className="rounded-full border border-slate-200 px-3 py-2 text-sm hover:bg-white"
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
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-semibold">Need clarification</p>
            <p className="mt-1">{draft.title}</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              {draft.questions?.map((q) => (
                <li key={q}>{q}</li>
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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-20">
      <div className="bg-white rounded-2xl shadow-soft w-full max-w-xl p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500">{local.id ? 'Edit item' : 'New item'}</p>
            <h2 className="text-xl font-semibold">{local.title || 'Untitled'}</h2>
          </div>
          <button className="text-slate-500 text-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-slate-600">Kind</span>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={local.kind}
              onChange={(e) => update('kind', e.target.value as ItemKind)}
            >
              <option value="event">Event</option>
              <option value="task">Task</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-600">Day</span>
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={local.day}
              onChange={(e) => update('day', e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-600">Start</span>
            <input
              type="time"
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={local.timeStart || ''}
              onChange={(e) => update('timeStart', e.target.value || null)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-600">End</span>
            <input
              type="time"
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={local.timeEnd || ''}
              onChange={(e) => update('timeEnd', e.target.value || null)}
            />
          </label>
          <label className="flex flex-col gap-1 col-span-2">
            <span className="text-slate-600">Title</span>
            <input
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={local.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="Dentist, call with Alex…"
            />
          </label>
          <label className="flex flex-col gap-1 col-span-2">
            <span className="text-slate-600">Details</span>
            <textarea
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={local.details || ''}
              onChange={(e) => update('details', e.target.value || null)}
              placeholder="Location, prep, notes"
              rows={3}
            />
          </label>
          {local.kind === 'task' && (
            <label className="flex flex-col gap-1">
              <span className="text-slate-600">Status</span>
              <select
                className="rounded-lg border border-slate-200 px-3 py-2"
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
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-500"
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
    recognition.lang = 'en-US';

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
  }, [listening]);

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
    <div className="mt-3 space-y-2">
      <div className="flex gap-2 items-center flex-wrap">
        <button
          className={`px-4 py-2 text-sm rounded-full border ${listening ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200'}`}
          onClick={() => {
            setTranscript('');
            setError(null);
            setListening((v) => !v);
          }}
        >
          {listening ? 'Stop capture' : 'Start capture'}
        </button>
        <button
          className="px-3 py-2 text-sm rounded-full border border-slate-200 disabled:opacity-50"
          disabled={!transcript}
          onClick={sendDraft}
        >
          Create draft
        </button>
        {transcript && <span className="text-xs text-slate-500">{transcript}</span>}
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
