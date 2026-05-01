'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Item, PlanningPeriod } from 'app/types';
import { parseDayKey, formatDateFull, formatTimeRange } from 'app/lib/datetime';
import { DEFAULT_ITEM_COLOR, RECURRING_ITEM_COLOR } from 'app/lib/item-colors';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';

const DONE_COLOR = '#666';

const PERIODS: Array<{ key: PlanningPeriod; start: number; end: number }> = [
  { key: 'morning', start: 0, end: 12 },
  { key: 'day', start: 12, end: 18 },
  { key: 'evening', start: 18, end: 24 },
];

const EVENT_ORDER_STEP = 1000;
const DEFAULT_TASK_ORDER_STEP = 500;

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
  if (item.isOccurrence || item.recurrenceRule) return RECURRING_ITEM_COLOR;
  return DEFAULT_ITEM_COLOR;
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

function timeOrderKey(timeStart: string) {
  const [hour, minute] = timeStart.split(':').map(Number);
  return (hour * 60 + minute) * EVENT_ORDER_STEP;
}

type PeriodRow = {
  id: string;
  item: Item;
  type: 'event' | 'task';
  orderKey: number;
};

function buildPeriodRows(items: Item[], period: PlanningPeriod, draggingId?: string | null): PeriodRow[] {
  return items
    .filter((item) => itemPeriod(item) === period)
    .filter((item) => String(item.id) !== draggingId)
    .map((item): PeriodRow => ({
      id: String(item.id),
      item,
      type: item.timeStart ? 'event' : 'task',
      orderKey: item.timeStart
        ? timeOrderKey(item.timeStart)
        : item.planningOrder ?? item.order ?? 0,
    }))
    .sort((a, b) => {
      if (a.orderKey !== b.orderKey) return a.orderKey - b.orderKey;
      if (a.type !== b.type) return a.type === 'event' ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
}

function allocateTaskOrders(rows: PeriodRow[], period: PlanningPeriod) {
  const updates: Item[] = [];
  let index = 0;

  while (index < rows.length) {
    if (rows[index].type !== 'task') {
      index += 1;
      continue;
    }

    const runStart = index;
    while (index < rows.length && rows[index].type === 'task') {
      index += 1;
    }
    const runEnd = index;
    const run = rows.slice(runStart, runEnd);
    const previousEvent = [...rows.slice(0, runStart)].reverse().find((row) => row.type === 'event');
    const nextEvent = rows.slice(runEnd).find((row) => row.type === 'event');
    const previousKey = previousEvent?.orderKey ?? ((nextEvent?.orderKey ?? 0) - (run.length + 1) * DEFAULT_TASK_ORDER_STEP);
    const nextKey = nextEvent?.orderKey ?? (previousKey + (run.length + 1) * DEFAULT_TASK_ORDER_STEP);
    const rawStep = Math.floor((nextKey - previousKey) / (run.length + 1));
    const step = rawStep > 0 ? rawStep : DEFAULT_TASK_ORDER_STEP;

    run.forEach((row, runIndex) => {
      updates.push({
        ...row.item,
        planningPeriod: period,
        planningOrder: previousKey + step * (runIndex + 1),
      });
    });
  }

  return updates;
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
  dragging,
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
  dragging?: boolean;
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

  const timeDisplay = formatTimeRange(item.timeStart, item.timeEnd);

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
        className={`day-panel-card ${isDone ? 'day-panel-card--done' : ''} ${highlighted ? 'day-panel-card--highlighted' : ''} ${dragging ? 'day-panel-card--dragging' : ''}`}
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
              aria-label="Drag task"
              title="Drag task"
              type="button"
              onClick={(event) => event.stopPropagation()}
              {...dragHandleProps}
            >
              <span className="day-panel-drag-handle-mark" aria-hidden="true" />
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

function DraggableItemCard(props: React.ComponentProps<typeof ItemCard>) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(props.item.id),
    disabled: !isEditableNormalItem(props.item) || Boolean(props.item.timeStart),
  });

  const style = {
    transition: 'opacity 140ms ease',
    zIndex: isDragging ? 10 : 0,
    position: 'relative' as const,
  };
  void transform;

  return (
    <div ref={setNodeRef} style={style}>
      <ItemCard {...props} dragging={isDragging} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function DropSlot({ id, active }: { id: string; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`day-panel-drop-slot ${active ? 'day-panel-drop-slot--active' : ''} ${isOver ? 'day-panel-drop-slot--over' : ''}`}
    >
      <span>Place here</span>
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
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overSlotId, setOverSlotId] = useState<string | null>(null);

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
    () => sortTasksByPlanningOrder(
      visibleItems.filter((item) => !item.timeStart && !item.planningPeriod)
    ),
    [visibleItems]
  );
  const periodRows = useMemo(
    () => Object.fromEntries(PERIODS.map((period) => [period.key, buildPeriodRows(visibleItems, period.key)])) as Record<PlanningPeriod, PeriodRow[]>,
    [visibleItems]
  );
  const activeDragItem = useMemo(
    () => items.find((item) => String(item.id) === activeDragId) ?? null,
    [items, activeDragId]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const id = event.over ? String(event.over.id) : null;
    const next = id?.startsWith('slot:') ? id : null;
    setOverSlotId((current) => current === next ? current : next);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    setOverSlotId(null);
    if (!over) return;
    const activeItem = items.find((item) => String(item.id) === String(active.id));
    if (!activeItem || activeItem.timeStart || !isEditableNormalItem(activeItem)) return;

    const overId = String(over.id);
    const sectionIds = ['unplanned', ...PERIODS.map((period) => period.key)];
    const isSectionDrop = sectionIds.includes(overId);
    if (!overId.startsWith('slot:') && !isSectionDrop) return;
    const [, slotPeriod, slotIndex] = overId.split(':');
    const rawPeriod = isSectionDrop ? overId : slotPeriod;
    const targetPeriod = rawPeriod === 'unplanned' ? null : rawPeriod as PlanningPeriod;
    const visualIndex = isSectionDrop ? Number.MAX_SAFE_INTEGER : Number(slotIndex);
    const sourcePeriod = activeItem.planningPeriod ?? null;
    let targetIndex = visualIndex;
    if (!isSectionDrop && targetPeriod === sourcePeriod) {
      const visualRows = targetPeriod
        ? buildPeriodRows(items, targetPeriod)
        : sortTasksByPlanningOrder(items.filter((item) => !item.timeStart && !item.planningPeriod));
      const activeVisualIndex = visualRows.findIndex((rowOrItem) => String(rowOrItem.id) === String(active.id));
      if (activeVisualIndex >= 0 && visualIndex > activeVisualIndex) {
        targetIndex = visualIndex - 1;
      }
    }
    if (!Number.isInteger(targetIndex) || targetIndex < 0) return;

    if (!targetPeriod) {
      const targetTasks = sortTasksByPlanningOrder(
        items.filter((item) => !item.timeStart && !item.planningPeriod && isEditableNormalItem(item) && String(item.id) !== String(active.id))
      );
      const nextTasks = [...targetTasks];
      nextTasks.splice(Math.min(targetIndex, nextTasks.length), 0, {
        ...activeItem,
        planningPeriod: null,
        planningOrder: targetIndex,
      });
      await onPlanItems(nextTasks.map((item, index) => ({ ...item, planningPeriod: null, planningOrder: index })));
      return;
    }

    const rows = buildPeriodRows(items, targetPeriod, String(active.id));
    const nextRows = [...rows];
    nextRows.splice(Math.min(targetIndex, nextRows.length), 0, {
      id: String(activeItem.id),
      item: { ...activeItem, kind: 'task', planningPeriod: targetPeriod, timeStart: null, timeEnd: null },
      type: 'task',
      orderKey: 0,
    });

    await onPlanItems(allocateTaskOrders(nextRows, targetPeriod));
  };

  const dayDate = parseDayKey(selectedDay);
  const dayLabel = formatDateFull(dayDate);
  const dayOfWeek = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(dayDate);

  const renderCard = (item: Item, draggable = false) => {
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
    return draggable
      ? <DraggableItemCard key={String(item.id)} {...common} />
      : <ItemCard key={String(item.id)} {...common} />;
  };

  return (
    <div className="day-panel">
      <div className="day-panel-header">
        <div className="day-panel-header-copy">
          <p className="day-panel-weekday">{dayOfWeek}</p>
          <div className="day-panel-title-row">
            <h2 className="day-panel-date">{dayLabel}</h2>
            <button className="day-panel-toggle-btn" onClick={() => setShowDone((value) => !value)} type="button">
              {showDone ? 'Hide done' : 'Show done'}
            </button>
          </div>
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

      <div key={selectedDay} className="day-panel-items animate-fade-in">
        {loading && <p className="day-panel-empty">Loading...</p>}
        {!loading && visibleItems.length === 0 && (
          <p className="day-panel-empty">{items.length ? 'Done items are hidden.' : 'Nothing planned for this day.'}</p>
        )}

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveDragId(null);
            setOverSlotId(null);
          }}
        >
          {unplannedTasks.length > 0 && (
            <DroppableSection
              id="unplanned"
              className={`day-panel-section ${overSlotId?.startsWith('slot:unplanned:') ? 'day-panel-section--slot-over' : ''}`}
            >
              <div className="day-panel-section-header">
                <p className="day-panel-section-title">Tasks</p>
                <span>{unplannedTasks.length}</span>
              </div>
              <div className="day-panel-section-list">
                <DropSlot id="slot:unplanned:0" active={Boolean(activeDragId)} />
                {unplannedTasks.map((item, index) => (
                  <React.Fragment key={String(item.id)}>
                    {renderCard(item, isEditableNormalItem(item))}
                    <DropSlot id={`slot:unplanned:${index + 1}`} active={Boolean(activeDragId)} />
                  </React.Fragment>
                ))}
              </div>
            </DroppableSection>
          )}

          {PERIODS.map((period) => {
            const rows = periodRows[period.key];
            const hasRows = rows.length > 0;
            return (
              <DroppableSection
                key={period.key}
                id={period.key}
                className={`day-panel-section day-panel-period-section ${overSlotId?.startsWith(`slot:${period.key}:`) ? 'day-panel-section--slot-over' : ''}`}
              >
                <div className="day-panel-section-header">
                  <p className="day-panel-section-title">{labels[period.key]}</p>
                </div>
                <div className="day-panel-section-list">
                  {activeDragId && !hasRows && <p className="day-panel-section-empty">Drop tasks here.</p>}
                  <DropSlot id={`slot:${period.key}:0`} active={Boolean(activeDragId)} />
                  {rows.map((row, index) => (
                    <React.Fragment key={row.id}>
                      {renderCard(row.item, row.type === 'task' && isEditableNormalItem(row.item))}
                      <DropSlot id={`slot:${period.key}:${index + 1}`} active={Boolean(activeDragId)} />
                    </React.Fragment>
                  ))}
                </div>
              </DroppableSection>
            );
          })}
          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
            {activeDragItem ? (
              <div className="day-panel-drag-overlay">
                <ItemCard
                  item={activeDragItem}
                  onEdit={() => undefined}
                  onMove={() => undefined}
                  onDelete={() => undefined}
                  onDeleteSeries={() => undefined}
                  onToggleDone={() => undefined}
                  onInlineUpdate={async () => false}
                  dragging
                />
              </div>
            ) : null}
          </DragOverlay>
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
