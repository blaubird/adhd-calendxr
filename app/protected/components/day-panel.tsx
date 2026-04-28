'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Item, PlanningPeriod } from 'app/types';
import { parseDayKey, formatTimeValue, formatDateFull, formatTimeRange, formatDayKey, nowInTz } from 'app/lib/datetime';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const DEFAULT_COLOR = '#ff96f5';
const RECURRING_COLOR = '#67eb67';
const DONE_COLOR = '#666';

const PERIODS: Array<{ key: PlanningPeriod; start: number; end: number }> = [
  { key: 'morning', start: 0, end: 12 },
  { key: 'day', start: 12, end: 18 },
  { key: 'evening', start: 18, end: 24 },
];

const PERIOD_LABELS = {
  en: { morning: 'Morning', day: 'Day', evening: 'Evening' },
  fr: { morning: 'Matin', day: 'Journée', evening: 'Soir' },
  uk: { morning: 'Ранок', day: 'День', evening: 'Вечір' },
  ru: { morning: 'Утро', day: 'День', evening: 'Вечер' },
} satisfies Record<string, Record<PlanningPeriod, string>>;

type PeriodLanguage = keyof typeof PERIOD_LABELS;

function browserLanguage(): PeriodLanguage {
  if (typeof navigator === 'undefined') return 'en';
  const code = navigator.language.toLowerCase();
  if (code.startsWith('fr')) return 'fr';
  if (code.startsWith('uk')) return 'uk';
  if (code.startsWith('ru')) return 'ru';
  return 'en';
}

function getItemAccentColor(item: Item): string {
  if (item.status === 'done') return DONE_COLOR;
  if (item.color) return item.color;
  if (item.isOccurrence || item.recurrenceRule) return RECURRING_COLOR;
  return DEFAULT_COLOR;
}

function itemPeriod(item: Item): PlanningPeriod | null {
  if (!item.timeStart) return item.planningPeriod ?? null;
  const hour = Number(item.timeStart.slice(0, 2));
  if (hour < 12) return 'morning';
  if (hour < 18) return 'day';
  return 'evening';
}

function isEditableNormalItem(item: Item) {
  return typeof item.id === 'number' && !item.isOccurrence;
}

function sortTasksByPlanningOrder(items: Item[]) {
  return [...items].sort((a, b) => {
    const orderCompare = (a.planningOrder ?? a.order ?? 0) - (b.planningOrder ?? b.order ?? 0);
    if (orderCompare !== 0) return orderCompare;
    return String(a.id).localeCompare(String(b.id));
  });
}

function sortTimed(items: Item[]) {
  return [...items].sort((a, b) => {
    const timeCompare = (a.timeStart || '').localeCompare(b.timeStart || '');
    if (timeCompare !== 0) return timeCompare;
    return String(a.id).localeCompare(String(b.id));
  });
}

function parseTimeEdit(value: string): { timeStart: string | null; timeEnd: string | null } | null {
  const trimmed = value.trim();
  if (!trimmed) return { timeStart: null, timeEnd: null };
  const [start, end] = trimmed.split(/\s*[-–]\s*/);
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!valid.test(start || '')) return null;
  if (end && !valid.test(end)) return null;
  return { timeStart: start, timeEnd: end || null };
}

/** Minimal scope picker for recurring item delete */
function DeleteScopePicker({
  onDeleteOccurrence,
  onDeleteSeries,
  onClose,
}: {
  onDeleteOccurrence: () => void;
  onDeleteSeries: () => void;
  onClose: () => void;
}) {
  return (
    <div className="delete-scope-overlay">
      <div className="delete-scope-dialog">
        <div>
          <p className="delete-scope-label">Recurring item</p>
          <h3 className="delete-scope-heading">What do you want to delete?</h3>
        </div>
        <div className="delete-scope-options">
          <button className="delete-scope-btn" onClick={onDeleteOccurrence} type="button">
            <span className="delete-scope-btn-title">This occurrence only</span>
            <span className="delete-scope-btn-desc">Remove only this specific date.</span>
          </button>
          <button className="delete-scope-btn delete-scope-btn--danger" onClick={onDeleteSeries} type="button">
            <span className="delete-scope-btn-title">Entire series</span>
            <span className="delete-scope-btn-desc">Delete the recurring item and all its occurrences.</span>
          </button>
        </div>
        <button className="delete-scope-cancel" onClick={onClose} type="button">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  onEdit,
  onMove,
  onDelete,
  onDeleteSeries,
  onToggleDone,
  onInlineUpdate,
  dragHandleProps,
  highlighted,
}: {
  item: Item;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
  onDeleteSeries: () => void;
  onToggleDone: () => void;
  onInlineUpdate: (item: Item, patch: Partial<Item>) => Promise<boolean>;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  highlighted?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deletePickerOpen, setDeletePickerOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(item.title);
  const [editingTime, setEditingTime] = useState(false);
  const [timeValue, setTimeValue] = useState(formatTimeRange(item.timeStart, item.timeEnd) || '');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const isDone = item.status === 'done';
  const accentColor = getItemAccentColor(item);
  const isRecurring = Boolean(item.isOccurrence || item.recurrenceRule);
  const inlineDisabled = !isEditableNormalItem(item);

  const timeDisplay = formatTimeRange(item.timeStart, item.timeEnd) || (inlineDisabled ? null : 'No time');

  useEffect(() => {
    setTitleValue(item.title);
    setTimeValue(formatTimeRange(item.timeStart, item.timeEnd) || '');
    setInlineError(null);
  }, [item]);

  useEffect(() => {
    if (!highlighted) return;
    cardRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlighted]);

  const saveTitle = async () => {
    const nextTitle = titleValue.trim();
    if (!nextTitle) {
      setInlineError('Title cannot be empty.');
      return;
    }
    if (nextTitle === item.title) {
      setEditingTitle(false);
      return;
    }
    const success = await onInlineUpdate(item, { title: nextTitle });
    if (success) setEditingTitle(false);
  };

  const saveTime = async () => {
    const parsed = parseTimeEdit(timeValue);
    if (!parsed) {
      setInlineError('Use HH:mm or HH:mm-HH:mm.');
      return;
    }
    const success = await onInlineUpdate(item, {
      ...parsed,
      kind: parsed.timeStart ? 'event' : 'task',
      planningPeriod: parsed.timeStart ? null : item.planningPeriod ?? null,
      planningOrder: parsed.timeStart ? null : item.planningOrder ?? null,
    });
    if (success) setEditingTime(false);
  };

  const handleDeleteClick = () => {
    if (isRecurring) {
      setDeletePickerOpen(true);
    } else {
      onDelete();
    }
  };

  return (
    <>
      <article
        ref={cardRef}
        className={`day-panel-card ${isDone ? 'day-panel-card--done' : ''} ${highlighted ? 'day-panel-card--highlighted' : ''}`}
        style={{ borderLeftColor: accentColor }}
      >
        <div
          className="day-panel-card-main"
          onClick={() => setExpanded(!expanded)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpanded(!expanded);
            }
          }}
        >
          {dragHandleProps && (
            <button
              className="day-panel-drag-handle"
              title="Drag task"
              type="button"
              onClick={(event) => event.stopPropagation()}
              {...dragHandleProps}
            >
              ::
            </button>
          )}
          <div className="day-panel-card-content">
            <div className="day-panel-card-title-row">
              {timeDisplay && !editingTime && (
                <button
                  className={`day-panel-card-time ${isDone ? 'day-panel-card-time--done' : ''}`}
                  disabled={inlineDisabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!inlineDisabled) setEditingTime(true);
                  }}
                  type="button"
                  title={inlineDisabled ? 'Use full edit for recurring occurrences' : 'Edit time'}
                >
                  {timeDisplay}
                </button>
              )}
              {editingTime && (
                <input
                  autoFocus
                  className="day-panel-inline-input day-panel-inline-time"
                  placeholder="09:00-10:00"
                  value={timeValue}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setTimeValue(event.target.value)}
                  onBlur={saveTime}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      saveTime();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setTimeValue(formatTimeRange(item.timeStart, item.timeEnd) || '');
                      setEditingTime(false);
                      setInlineError(null);
                    }
                  }}
                />
              )}
              {!editingTitle && (
                <button
                  className={`day-panel-card-title ${isDone ? 'day-panel-card-title--done' : ''}`}
                  disabled={inlineDisabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!inlineDisabled) setEditingTitle(true);
                  }}
                  type="button"
                  title={inlineDisabled ? 'Use full edit for recurring occurrences' : 'Edit title'}
                >
                  {item.title}
                </button>
              )}
              {editingTitle && (
                <input
                  autoFocus
                  className="day-panel-inline-input day-panel-inline-title"
                  value={titleValue}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setTitleValue(event.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      saveTitle();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setTitleValue(item.title);
                      setEditingTitle(false);
                      setInlineError(null);
                    }
                  }}
                />
              )}
            </div>
            {inlineError && <p className="day-panel-inline-error">{inlineError}</p>}
          </div>
          <div className="day-panel-card-actions">
            <button
              className="day-panel-action-btn day-panel-action-btn--done"
              onClick={(e) => { e.stopPropagation(); onToggleDone(); }}
              title={isDone ? 'Mark undone' : 'Mark done'}
              type="button"
            >
              {isDone ? '<' : '✓'}
            </button>
            <button className="day-panel-action-btn" onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Edit" type="button">
              ✎
            </button>
            <button className="day-panel-action-btn" onClick={(e) => { e.stopPropagation(); onMove(); }} title="Move" type="button">
              ↷
            </button>
            <button className="day-panel-action-btn day-panel-action-btn--delete" onClick={(e) => { e.stopPropagation(); handleDeleteClick(); }} title="Delete" type="button">
              ✕
            </button>
          </div>
        </div>

        {expanded && item.details && (
          <div className="day-panel-card-details">
            <p>{item.details}</p>
          </div>
        )}
        {expanded && !item.details && (
          <div className="day-panel-card-details day-panel-card-details--empty">
            <p>No details.</p>
          </div>
        )}
      </article>

      {deletePickerOpen && (
        <DeleteScopePicker
          onDeleteOccurrence={() => {
            setDeletePickerOpen(false);
            onDelete();
          }}
          onDeleteSeries={() => {
            setDeletePickerOpen(false);
            onDeleteSeries();
          }}
          onClose={() => setDeletePickerOpen(false)}
        />
      )}
    </>
  );
}

function MoveItemDialog({
  item,
  onMove,
  onClose,
}: {
  item: Item;
  onMove: (item: Item, values: { day: string; timeStart: string | null; timeEnd: string | null }) => Promise<void>;
  onClose: () => void;
}) {
  const isRecurring = Boolean(item.isOccurrence || item.recurrenceRule);
  const [day, setDay] = useState(item.occurrenceDay ?? item.day);
  const [timeStart, setTimeStart] = useState(item.timeStart ?? '');
  const [timeEnd, setTimeEnd] = useState(item.timeEnd ?? '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (isRecurring) return;
    setSubmitting(true);
    await onMove(item, {
      day,
      timeStart: timeStart || null,
      timeEnd: timeEnd || null,
    });
    setSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-4 z-30 animate-modal-overlay">
      <div className="bg-slate-900 rounded-2xl shadow-soft w-full max-w-sm p-5 space-y-4 border border-slate-700 animate-modal-content">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Move</p>
            <h2 className="text-lg font-semibold text-white">{item.title}</h2>
          </div>
          <button className="text-slate-400 text-sm hover:text-slate-200" onClick={onClose} type="button">
            Close
          </button>
        </div>

        {isRecurring ? (
          <p className="text-sm text-slate-300">Recurring occurrences cannot be moved safely yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-slate-300">Date</span>
              <input className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-300">Start</span>
              <input className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100" type="time" value={timeStart} onChange={(event) => setTimeStart(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-300">End</span>
              <input className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100" type="time" value={timeEnd} onChange={(event) => setTimeEnd(event.target.value)} />
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="px-4 py-2 text-sm rounded-lg border border-slate-700 text-slate-100 hover:bg-slate-800" onClick={onClose} disabled={submitting} type="button">
            Cancel
          </button>
          {!isRecurring && (
            <button className="px-4 py-2 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-60" onClick={handleSubmit} disabled={submitting || !day} type="button">
              {submitting ? 'Moving...' : 'Move'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SortableItemCard(props: React.ComponentProps<typeof ItemCard>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(props.item.id),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : 0,
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ItemCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function DroppableSection({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} className={`${className ?? ''} ${isOver ? 'day-panel-section--over' : ''}`}>
      {children}
    </section>
  );
}

function buildNextUp(items: Item[], selectedDay: string) {
  const active = items.filter((item) => item.status !== 'done' && item.status !== 'canceled');
  const timed = sortTimed(active.filter((item) => item.timeStart));
  const now = nowInTz(new Date());
  const today = formatDayKey(now);
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const upcomingTimed = timed.find((item) => {
    if (selectedDay !== today) return true;
    const [h, m] = item.timeStart!.split(':').map(Number);
    return h * 60 + m >= nowMinutes;
  });
  const item = upcomingTimed ?? active.find((candidate) => !candidate.timeStart);
  if (!item) return null;
  if (!item.timeStart) return { item, relative: 'task' };
  const [hour, minute] = item.timeStart.split(':').map(Number);
  const diffMinutes = selectedDay === today ? hour * 60 + minute - nowMinutes : null;
  const relative = diffMinutes == null
    ? formatDateFull(parseDayKey(selectedDay))
    : diffMinutes <= 0
      ? 'now'
      : `in ${Math.floor(diffMinutes / 60) ? `${Math.floor(diffMinutes / 60)}h ` : ''}${diffMinutes % 60}m`;
  return { item, relative };
}

export function DayPanel({
  selectedDay,
  items,
  loading,
  onEdit,
  onMove,
  onDelete,
  onDeleteSeries,
  onToggleDone,
  onInlineUpdate,
  onPlanItems,
  onAddNew,
  onOpenSearch,
  onOpenDayCanvas,
  highlightedItemId,
  chatSection,
}: {
  selectedDay: string;
  items: Item[];
  loading: boolean;
  onEdit: (item: Item) => void;
  onMove: (item: Item, values: { day: string; timeStart: string | null; timeEnd: string | null }) => Promise<void>;
  onDelete: (item: Item) => void;
  onDeleteSeries: (item: Item) => void;
  onToggleDone: (item: Item) => void;
  onInlineUpdate: (item: Item, patch: Partial<Item>) => Promise<boolean>;
  onPlanItems: (items: Item[]) => Promise<boolean>;
  onAddNew: (day: string) => void;
  onOpenSearch: () => void;
  onOpenDayCanvas?: (day: string) => void;
  highlightedItemId?: string | null;
  chatSection: React.ReactNode;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  const [movingItem, setMovingItem] = useState<Item | null>(null);
  const [showDone, setShowDone] = useState(true);
  const [language, setLanguage] = useState<PeriodLanguage>('en');

  useEffect(() => {
    setShowDone(true);
  }, [selectedDay]);

  useEffect(() => {
    setLanguage(browserLanguage());
  }, []);

  const labels = PERIOD_LABELS[language] ?? PERIOD_LABELS.en;
  const visibleItems = useMemo(
    () => showDone ? items : items.filter((item) => item.status !== 'done'),
    [items, showDone]
  );
  const unplannedTasks = useMemo(
    () => sortTasksByPlanningOrder(visibleItems.filter((item) => !item.timeStart && !item.planningPeriod)),
    [visibleItems]
  );
  const nextUp = useMemo(() => buildNextUp(items, selectedDay), [items, selectedDay]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeItem = items.find((item) => String(item.id) === String(active.id));
    if (!activeItem || activeItem.timeStart || !isEditableNormalItem(activeItem)) return;

    const allTasks = items.filter((item) => !item.timeStart && isEditableNormalItem(item));
    const overId = String(over.id);
    const periodIds = ['unplanned', ...PERIODS.map((period) => period.key)];
    const overItem = allTasks.find((item) => String(item.id) === overId);
    const targetPeriod = periodIds.includes(overId)
      ? (overId === 'unplanned' ? null : overId as PlanningPeriod)
      : overItem?.planningPeriod ?? null;
    const sourcePeriod = activeItem.planningPeriod ?? null;
    const sourceList = sortTasksByPlanningOrder(allTasks.filter((item) => (item.planningPeriod ?? null) === sourcePeriod && String(item.id) !== String(active.id)));
    const targetListBase = sortTasksByPlanningOrder(allTasks.filter((item) => (item.planningPeriod ?? null) === targetPeriod && String(item.id) !== String(active.id)));
    const overIndex = overItem ? targetListBase.findIndex((item) => String(item.id) === String(overItem.id)) : -1;
    const targetIndex = overIndex >= 0 ? overIndex : targetListBase.length;
    const targetList = [...targetListBase];
    targetList.splice(targetIndex, 0, { ...activeItem, planningPeriod: targetPeriod, planningOrder: targetIndex });

    const updatedTarget = targetList.map((item, index) => ({
        ...item,
        planningPeriod: targetPeriod,
        planningOrder: index,
      }));
    const affected = sourcePeriod === targetPeriod
      ? updatedTarget
      : [
          ...sourceList.map((item, index) => ({ ...item, planningOrder: index })),
          ...updatedTarget,
        ];

    await onPlanItems(affected);
  };

  const dayDate = parseDayKey(selectedDay);
  const dayLabel = formatDateFull(dayDate);
  const dayOfWeek = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(dayDate);

  const renderCard = (item: Item, sortable = false) => {
    const common = {
      item,
      onEdit: () => onEdit(item),
      onMove: () => setMovingItem(item),
      onDelete: () => onDelete(item),
      onDeleteSeries: () => onDeleteSeries(item),
      onToggleDone: () => onToggleDone(item),
      onInlineUpdate,
      highlighted: highlightedItemId === String(item.id),
    };
    return sortable
      ? <SortableItemCard key={String(item.id)} {...common} />
      : <ItemCard key={String(item.id)} {...common} />;
  };

  return (
    <div className="day-panel">
      <div className="day-panel-header">
        <div className="day-panel-header-copy">
          <p className="day-panel-weekday">{dayOfWeek}</p>
          <h2 className="day-panel-date">{dayLabel}</h2>
        </div>
        <div className="day-panel-header-actions">
          <button className="day-panel-canvas-btn" onClick={onOpenSearch} type="button" title="Search">
            Search
          </button>
          {onOpenDayCanvas && (
            <button className="day-panel-canvas-btn" onClick={() => onOpenDayCanvas(selectedDay)} type="button" title="Open Day Canvas">
              Canvas
            </button>
          )}
          <button className="day-panel-add-btn" onClick={() => onAddNew(selectedDay)} type="button">
            + Add
          </button>
        </div>
      </div>

      <div className="day-panel-status-row">
        <button className="day-panel-toggle-btn" onClick={() => setShowDone((value) => !value)} type="button">
          {showDone ? 'Hide done' : 'Show done'}
        </button>
      </div>

      {nextUp && (
        <div className="day-panel-next-up">
          <p className="day-panel-section-kicker">Next up</p>
          <p className="day-panel-next-title">
            {nextUp.item.timeStart ? `${formatTimeValue(nextUp.item.timeStart)} ` : ''}
            {nextUp.item.title}
          </p>
          <p className="day-panel-next-meta">{nextUp.relative}</p>
        </div>
      )}

      <div key={selectedDay} className="day-panel-items animate-fade-in">
        {loading && <p className="day-panel-empty">Loading...</p>}
        {!loading && visibleItems.length === 0 && (
          <p className="day-panel-empty">{items.length ? 'Done items are hidden.' : 'Nothing planned for this day.'}</p>
        )}

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <DroppableSection id="unplanned" className="day-panel-section">
            <div className="day-panel-section-header">
              <p className="day-panel-section-title">Tasks</p>
              <span>{unplannedTasks.length}</span>
            </div>
            <SortableContext items={unplannedTasks.map((item) => String(item.id))} strategy={verticalListSortingStrategy}>
              <div className="day-panel-section-list">
                {unplannedTasks.length === 0 && <p className="day-panel-section-empty">No unplanned tasks.</p>}
                {unplannedTasks.map((item) => renderCard(item, isEditableNormalItem(item)))}
              </div>
            </SortableContext>
          </DroppableSection>

          {PERIODS.map((period) => {
            const periodTasks = sortTasksByPlanningOrder(visibleItems.filter((item) => !item.timeStart && item.planningPeriod === period.key));
            const periodTimed = sortTimed(visibleItems.filter((item) => item.timeStart && itemPeriod(item) === period.key));
            return (
              <DroppableSection key={period.key} id={period.key} className="day-panel-section day-panel-period-section">
                <div className="day-panel-section-header">
                  <p className="day-panel-section-title">{labels[period.key]}</p>
                  <span>{period.start}:00-{period.end}:00</span>
                </div>
                <SortableContext items={periodTasks.map((item) => String(item.id))} strategy={verticalListSortingStrategy}>
                  <div className="day-panel-section-list">
                    {periodTimed.length === 0 && periodTasks.length === 0 && (
                      <p className="day-panel-section-empty">Drop tasks here.</p>
                    )}
                    {periodTimed.map((item) => renderCard(item))}
                    {periodTasks.map((item) => renderCard(item, isEditableNormalItem(item)))}
                  </div>
                </SortableContext>
              </DroppableSection>
            );
          })}
        </DndContext>
      </div>

      <div className="p-2 border-t border-slate-800 shrink-0">
        <button
          onClick={() => setAiOpen(!aiOpen)}
          className="w-full py-1.5 px-2.5 rounded-lg border border-slate-700 bg-slate-900/50 hover:bg-slate-800 text-slate-200 text-xs font-medium flex justify-between items-center transition-all shadow-sm"
          type="button"
        >
          <span className="flex items-center gap-2"><span className="text-sky-400">*</span> AI Drafts</span>
          <span className="text-slate-500 text-xs">{aiOpen ? 'Hide' : 'Open'}</span>
        </button>
      </div>

      {aiOpen && (
        <div className="day-panel-ai-section bg-slate-900/30 border-t border-slate-800 animate-slide-up overflow-y-auto shrink-0" style={{ maxHeight: '34vh' }}>
          {chatSection}
        </div>
      )}

      {movingItem && <MoveItemDialog item={movingItem} onMove={onMove} onClose={() => setMovingItem(null)} />}
    </div>
  );
}
