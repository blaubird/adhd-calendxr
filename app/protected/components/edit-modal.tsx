'use client';
import React, { useState, useEffect } from 'react';
import { ItemKind, TaskStatus } from 'app/types';
import { formatDayEU, parseDayEU, parseDayKey } from 'app/lib/datetime';
import { DEFAULT_ITEM_COLOR, ITEM_COLOR_PALETTE, RECURRING_ITEM_COLOR } from 'app/lib/item-colors';
import { TimeField } from './form-fields';
import { ItemFormState } from '../hooks/use-calendar-data';

export type RecurrenceOption = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type EditScope = 'occurrence' | 'series';

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const RECURRENCE_LABELS = {
  en: { none: 'None', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' },
  fr: { none: 'Aucun', daily: 'Quotidien', weekly: 'Hebdomadaire', monthly: 'Mensuel', yearly: 'Annuel' },
  uk: { none: 'Немає', daily: 'Щодня', weekly: 'Щотижня', monthly: 'Щомісяця', yearly: 'Щороку' },
  ru: { none: 'Нет', daily: 'Ежедневно', weekly: 'Еженедельно', monthly: 'Ежемесячно', yearly: 'Ежегодно' },
} satisfies Record<string, Record<RecurrenceOption, string>>;

type RecurrenceLanguage = keyof typeof RECURRENCE_LABELS;

function browserRecurrenceLanguage(): RecurrenceLanguage {
  if (typeof navigator === 'undefined') return 'en';
  const code = navigator.language.toLowerCase();
  if (code.startsWith('fr')) return 'fr';
  if (code.startsWith('uk')) return 'uk';
  if (code.startsWith('ru')) return 'ru';
  return 'en';
}

function isPaletteColor(color: string | null | undefined) {
  return Boolean(color && ITEM_COLOR_PALETTE.some((entry) => entry === color));
}

export function deriveRecurrenceOption(rule: string | null | undefined): RecurrenceOption {
  if (!rule) return 'none';
  if (rule.startsWith('FREQ=DAILY')) return 'daily';
  if (rule.startsWith('FREQ=WEEKLY')) return 'weekly';
  if (rule.startsWith('FREQ=MONTHLY')) return 'monthly';
  if (rule.startsWith('FREQ=YEARLY')) return 'yearly';
  return 'none';
}

export function buildRecurrenceRule(option: RecurrenceOption, dayKey: string): string | null {
  const day = parseDayKey(dayKey);
  switch (option) {
    case 'daily':
      return 'FREQ=DAILY;INTERVAL=1';
    case 'weekly': {
      const code = WEEKDAY_CODES[day.getUTCDay()] ?? 'MO';
      return `FREQ=WEEKLY;INTERVAL=1;BYDAY=${code}`;
    }
    case 'monthly': {
      const dayNumber = day.getUTCDate();
      return `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=${dayNumber}`;
    }
    case 'yearly': {
      const month = day.getUTCMonth() + 1;
      const dayNumber = day.getUTCDate();
      return `FREQ=YEARLY;INTERVAL=1;BYMONTH=${month};BYMONTHDAY=${dayNumber}`;
    }
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────
// Scope picker shown when user edits an occurrence of a series
// ────────────────────────────────────────────────────────────
function OccurrenceScopePicker({
  onPick,
  onClose,
}: {
  onPick: (scope: EditScope) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-30 animate-modal-overlay">
      <div className="bg-slate-900 rounded-2xl shadow-soft w-full max-w-sm p-5 space-y-4 border border-slate-700 animate-modal-content">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Recurring item</p>
          <h2 className="text-lg font-semibold text-white">What do you want to edit?</h2>
        </div>
        <div className="space-y-2">
          <button
            className="w-full text-left rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-100 hover:bg-slate-800 hover:border-sky-500/40 transition-colors"
            onClick={() => onPick('occurrence')}
          >
            <span className="font-medium">This occurrence only</span>
            <p className="text-[11px] text-slate-500 mt-0.5">Changes apply only to this specific date.</p>
          </button>
          <button
            className="w-full text-left rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-100 hover:bg-slate-800 hover:border-sky-500/40 transition-colors"
            onClick={() => onPick('series')}
          >
            <span className="font-medium">Entire series</span>
            <p className="text-[11px] text-slate-500 mt-0.5">Changes apply to the master and all future occurrences.</p>
          </button>
        </div>
        <button
          className="w-full text-sm text-slate-500 hover:text-slate-300 transition-colors pt-1"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main edit modal
// ────────────────────────────────────────────────────────────
export function EditModal({
  values,
  onClose,
  onSave,
  onSaveSeries,
}: {
  values: ItemFormState;
  onClose: () => void;
  onSave: (values: ItemFormState) => Promise<void>;
  /** Called when user picks "edit series" — receives the master's id and new values */
  onSaveSeries?: (masterId: number, values: ItemFormState) => Promise<void>;
}) {
  const isOccurrence = Boolean(values.isOccurrence);
  const hasSeries = isOccurrence && Boolean(values.sourceId);

  // Scope picker state — only shown for occurrences when hasSeries
  const [scopePickerOpen, setScopePickerOpen] = useState(hasSeries);
  const [editScope, setEditScope] = useState<EditScope | null>(hasSeries ? null : 'occurrence');

  const [local, setLocal] = useState(values);
  const [dayInput, setDayInput] = useState(formatDayEU(values.day));
  const [dayError, setDayError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recurrenceOption, setRecurrenceOption] = useState<RecurrenceOption>(
    deriveRecurrenceOption(values.recurrenceRule)
  );
  const [untilInput, setUntilInput] = useState(
    values.recurrenceUntilDay ? formatDayEU(values.recurrenceUntilDay) : ''
  );
  const [untilError, setUntilError] = useState<string | null>(null);
  const [countInput, setCountInput] = useState(
    values.recurrenceCount != null ? String(values.recurrenceCount) : ''
  );
  const [recurrenceLanguage, setRecurrenceLanguage] = useState<RecurrenceLanguage>('en');

  // Recurrence controls are disabled when editing a single occurrence
  const recurrenceDisabled = editScope === 'occurrence' && Boolean(local.isOccurrence || local.parentId);
  const currentColor = local.color || (local.recurrenceRule ? RECURRING_ITEM_COLOR : DEFAULT_ITEM_COLOR);
  const hasCustomColor = Boolean(local.color && !isPaletteColor(local.color));

  useEffect(() => {
    setLocal(values);
    setDayInput(formatDayEU(values.day));
    setDayError(null);
    setRecurrenceOption(deriveRecurrenceOption(values.recurrenceRule));
    setUntilInput(values.recurrenceUntilDay ? formatDayEU(values.recurrenceUntilDay) : '');
    setUntilError(null);
    setCountInput(values.recurrenceCount != null ? String(values.recurrenceCount) : '');
    const isocc = Boolean(values.isOccurrence);
    const series = isocc && Boolean(values.sourceId);
    setScopePickerOpen(series);
    setEditScope(series ? null : 'occurrence');
  }, [values]);

  useEffect(() => {
    setRecurrenceLanguage(browserRecurrenceLanguage());
  }, []);

  const update = (key: keyof ItemFormState, value: any) =>
    setLocal((prev) => ({ ...prev, [key]: value }));
  const recurrenceLabels = RECURRENCE_LABELS[recurrenceLanguage] ?? RECURRENCE_LABELS.en;

  const handleDayChange = (value: string) => {
    setDayInput(value);
    const parsed = parseDayEU(value);
    if (parsed) {
      setDayError(null);
      update('day', parsed);
      if (recurrenceOption !== 'none') {
        update('recurrenceRule', buildRecurrenceRule(recurrenceOption, parsed));
      }
    } else {
      setDayError('Use DD.MM.YYYY');
    }
  };

  const handleRecurrenceChange = (option: RecurrenceOption) => {
    setRecurrenceOption(option);
    update('recurrenceRule', buildRecurrenceRule(option, local.day));
    if (option === 'none') {
      update('recurrenceUntilDay', null);
      update('recurrenceCount', null);
      setUntilInput('');
      setCountInput('');
    }
  };

  const handleUntilChange = (value: string) => {
    setUntilInput(value);
    if (!value.trim()) {
      setUntilError(null);
      update('recurrenceUntilDay', null);
      return;
    }
    const parsed = parseDayEU(value);
    if (parsed) {
      setUntilError(null);
      update('recurrenceUntilDay', parsed);
    } else {
      setUntilError('Use DD.MM.YYYY');
    }
  };

  const handleCountChange = (value: string) => {
    setCountInput(value);
    if (!value.trim()) {
      update('recurrenceCount', null);
      return;
    }
    const n = parseInt(value, 10);
    if (!isNaN(n) && n > 0) {
      update('recurrenceCount', n);
    } else {
      update('recurrenceCount', null);
    }
  };

  const handleScopePick = (scope: EditScope) => {
    setScopePickerOpen(false);
    setEditScope(scope);
    if (scope === 'series' && values.sourceId) {
      // Switch local state to master: clear occurrence flags
      setLocal((prev) => ({
        ...prev,
        id: values.sourceId,
        isOccurrence: false,
        isOverride: false,
        occurrenceDay: null,
        parentId: null,
        day: values.occurrenceDay ?? values.day,
        recurrenceRule: values.recurrenceRule,
        recurrenceUntilDay: values.recurrenceUntilDay,
        recurrenceCount: values.recurrenceCount,
        recurrenceExdates: values.recurrenceExdates,
      }));
      setDayInput(formatDayEU(values.occurrenceDay ?? values.day));
      setRecurrenceOption(deriveRecurrenceOption(values.recurrenceRule));
      setUntilInput(values.recurrenceUntilDay ? formatDayEU(values.recurrenceUntilDay) : '');
      setCountInput(values.recurrenceCount != null ? String(values.recurrenceCount) : '');
    }
  };

  const handleSubmit = async () => {
    const parsedDay = parseDayEU(dayInput);
    if (!parsedDay) {
      setDayError('Use DD.MM.YYYY');
      return;
    }
    if (untilError) return;

    const nextValues = { ...local, day: parsedDay };
    setLocal(nextValues);
    setSubmitting(true);

    if (editScope === 'series' && values.sourceId && onSaveSeries) {
      await onSaveSeries(values.sourceId, nextValues);
    } else {
      await onSave(nextValues);
    }
    setSubmitting(false);
  };

  return (
    <>
      {scopePickerOpen && (
        <OccurrenceScopePicker onPick={handleScopePick} onClose={onClose} />
      )}

      {!scopePickerOpen && editScope && (
        <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-4 z-20 animate-modal-overlay">
          <div className="bg-slate-900 rounded-2xl shadow-soft w-full max-w-xl p-5 space-y-4 border border-slate-700 animate-modal-content">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-400">
                  {local.id
                    ? editScope === 'series'
                      ? 'Edit series'
                      : local.isOccurrence
                        ? 'Edit occurrence'
                        : 'Edit item'
                    : 'New item'}
                </p>
                <h2 className="text-xl font-semibold text-white">{local.title || 'Untitled'}</h2>
              </div>
              <button className="text-slate-400 text-sm hover:text-slate-200" onClick={onClose}>
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex flex-col gap-1">
                <span className="text-slate-300">Color</span>
                <div className="item-color-palette" role="radiogroup" aria-label="Item color">
                  {ITEM_COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`item-color-swatch ${currentColor === color ? 'item-color-swatch--active' : ''}`}
                      style={{ backgroundColor: color }}
                      title={color}
                      aria-label={`Use color ${color}`}
                      aria-checked={currentColor === color}
                      role="radio"
                      onClick={() => update('color', color)}
                    />
                  ))}
                  {hasCustomColor && local.color && (
                    <button
                      type="button"
                      className="item-color-swatch item-color-swatch--active item-color-swatch--custom"
                      style={{ backgroundColor: local.color }}
                      title={`Current custom color ${local.color}`}
                      aria-label={`Current custom color ${local.color}`}
                      aria-checked="true"
                      role="radio"
                      onClick={() => update('color', local.color)}
                    />
                  )}
                </div>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-slate-300">Day</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{2}\.\d{2}\.\d{4}"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                  placeholder="DD.MM.YYYY"
                  value={dayInput}
                  onChange={(e) => handleDayChange(e.target.value)}
                />
                {dayError && <span className="text-[11px] text-rose-300">{dayError}</span>}
              </label>
              <TimeField label="Start" value={local.timeStart} onChange={(v) => update('timeStart', v)} />
              <TimeField label="End" value={local.timeEnd} onChange={(v) => update('timeEnd', v)} />

              {/* ── Recurrence ── */}
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-slate-300">Recurrence</span>
                <select
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 disabled:opacity-50"
                  value={recurrenceOption}
                  disabled={recurrenceDisabled}
                  onChange={(e) => handleRecurrenceChange(e.target.value as RecurrenceOption)}
                >
                  <option value="none">{recurrenceLabels.none}</option>
                  <option value="daily">{recurrenceLabels.daily}</option>
                  <option value="weekly">{recurrenceLabels.weekly}</option>
                  <option value="monthly">{recurrenceLabels.monthly}</option>
                  <option value="yearly">{recurrenceLabels.yearly}</option>
                </select>
                {recurrenceDisabled && (
                  <span className="text-[11px] text-slate-500">
                    Editing a single occurrence — recurrence is locked
                  </span>
                )}
              </label>

              {/* UNTIL / COUNT — only shown when recurrence is active and not editing single occurrence */}
              {recurrenceOption !== 'none' && !recurrenceDisabled && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-300">Until (optional)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d{2}\.\d{2}\.\d{4}"
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                      placeholder="DD.MM.YYYY"
                      value={untilInput}
                      onChange={(e) => handleUntilChange(e.target.value)}
                    />
                    {untilError && <span className="text-[11px] text-rose-300">{untilError}</span>}
                    <span className="text-[10px] text-slate-600">Last day of recurrence</span>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-300">Count (optional)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                      placeholder="e.g. 10"
                      value={countInput}
                      onChange={(e) => handleCountChange(e.target.value)}
                    />
                    <span className="text-[10px] text-slate-600">Number of occurrences</span>
                  </label>
                </>
              )}

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
              {/* Status input removed per unified item model */}
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
                disabled={submitting || !!dayError || !!untilError}
              >
                {submitting
                  ? 'Saving…'
                  : local.id
                    ? editScope === 'series'
                      ? 'Save series'
                      : 'Save changes'
                    : 'Add item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
