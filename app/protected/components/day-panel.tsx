'use client';

import React, { useState, useEffect } from 'react';
import { Item } from 'app/types';
import { parseDayKey, formatTimeValue, formatDateFull } from 'app/lib/datetime';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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

function getItemAccentColor(item: Item): string {
  if (item.status === 'done') return DONE_COLOR;
  if (item.color) return item.color;
  if (item.isOccurrence || item.recurrenceRule) return RECURRING_COLOR;
  return DEFAULT_COLOR;
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
          <button
            className="delete-scope-btn"
            onClick={onDeleteOccurrence}
            type="button"
          >
            <span className="delete-scope-btn-title">This occurrence only</span>
            <span className="delete-scope-btn-desc">Remove only this specific date.</span>
          </button>
          <button
            className="delete-scope-btn delete-scope-btn--danger"
            onClick={onDeleteSeries}
            type="button"
          >
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
  onDelete,
  onDeleteSeries,
  onToggleDone,
}: {
  item: Item;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteSeries: () => void;
  onToggleDone: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deletePickerOpen, setDeletePickerOpen] = useState(false);
  const isDone = item.status === 'done';
  const accentColor = getItemAccentColor(item);
  const isRecurring = Boolean(item.isOccurrence || item.recurrenceRule);

  const timeDisplay = (() => {
    if (item.timeStart && item.timeEnd) {
      return `${formatTimeValue(item.timeStart)}–${formatTimeValue(item.timeEnd)}`;
    }
    if (item.timeStart) {
      return formatTimeValue(item.timeStart);
    }
    return null;
  })();

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
        className={`day-panel-card ${isDone ? 'day-panel-card--done' : ''}`}
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
          <div className="day-panel-card-content">
            <div className="day-panel-card-title-row">
              {timeDisplay && (
                <span className={`day-panel-card-time ${isDone ? 'day-panel-card-time--done' : ''}`}>
                  {timeDisplay}
                </span>
              )}
              <span className={`day-panel-card-title ${isDone ? 'day-panel-card-title--done' : ''}`}>
                {item.title}
              </span>
            </div>
          </div>
          <div className="day-panel-card-actions">
            <button
              className="day-panel-action-btn day-panel-action-btn--done"
              onClick={(e) => { e.stopPropagation(); onToggleDone(); }}
              title={isDone ? 'Mark undone' : 'Mark done'}
              type="button"
            >
              {isDone ? '↩' : '✓'}
            </button>
            <button
              className="day-panel-action-btn"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              title="Edit"
              type="button"
            >
              ✎
            </button>
            <button
              className="day-panel-action-btn day-panel-action-btn--delete"
              onClick={(e) => { e.stopPropagation(); handleDeleteClick(); }}
              title="Delete"
              type="button"
            >
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

function SortableItemCard(props: any) {
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
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ItemCard {...props} />
    </div>
  );
}

export function DayPanel({
  selectedDay,
  items,
  loading,
  onEdit,
  onDelete,
  onDeleteSeries,
  onToggleDone,
  onReorderUntimed,
  onAddNew,
  onOpenDayCanvas,
  chatSection,
}: {
  selectedDay: string;
  items: Item[];
  loading: boolean;
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => void;
  onDeleteSeries: (item: Item) => void;
  onToggleDone: (item: Item) => void;
  onReorderUntimed?: (items: Item[]) => void;
  onAddNew: (day: string) => void;
  onOpenDayCanvas?: (day: string) => void;
  chatSection: React.ReactNode;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  
  const untimedItems = React.useMemo(() => items.filter((i) => !i.timeStart), [items]);
  const timedItems = React.useMemo(() => items.filter((i) => !!i.timeStart), [items]);
  
  const [localUntimed, setLocalUntimed] = useState(untimedItems);
  
  useEffect(() => {
    setLocalUntimed(untimedItems);
  }, [untimedItems]); // Update when items change

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localUntimed.findIndex((i) => String(i.id) === active.id);
      const newIndex = localUntimed.findIndex((i) => String(i.id) === over.id);
      
      const newArray = [...localUntimed];
      const [moved] = newArray.splice(oldIndex, 1);
      newArray.splice(newIndex, 0, moved);
      
      const reorderedItems = newArray.map((item, index) => ({
        ...item,
        order: index,
      }));
      
      setLocalUntimed(reorderedItems);
      if (onReorderUntimed) {
        onReorderUntimed(reorderedItems);
      }
    }
  };
  
  const dayDate = parseDayKey(selectedDay);
  const dayLabel = formatDateFull(dayDate);

  const dayOfWeek = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(dayDate);

  return (
    <div className="day-panel">
      <div className="day-panel-header">
        <div className="day-panel-header-copy">
          <p className="day-panel-weekday">{dayOfWeek}</p>
          <h2 className="day-panel-date">{dayLabel}</h2>
        </div>
        <div className="day-panel-header-actions">
          {onOpenDayCanvas && (
            <button
              className="day-panel-canvas-btn"
              onClick={() => onOpenDayCanvas(selectedDay)}
              type="button"
              title="Open Day Canvas"
            >
              ✎ Canvas
            </button>
          )}
          <button
            className="day-panel-add-btn"
            onClick={() => onAddNew(selectedDay)}
            type="button"
          >
            + Add
          </button>
        </div>
      </div>

      <div key={selectedDay} className="day-panel-items animate-fade-in">
        {loading && <p className="day-panel-empty">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="day-panel-empty">Nothing planned for this day.</p>
        )}
        
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localUntimed.map(i => String(i.id))} strategy={verticalListSortingStrategy}>
            {localUntimed.map((item) => (
              <SortableItemCard
                key={String(item.id)}
                item={item}
                onEdit={() => onEdit(item)}
                onDelete={() => onDelete(item)}
                onDeleteSeries={() => onDeleteSeries(item)}
                onToggleDone={() => onToggleDone(item)}
              />
            ))}
          </SortableContext>
        </DndContext>
        
        {timedItems.length > 0 && localUntimed.length > 0 && (
          <div className="h-px bg-slate-800 my-2" />
        )}
        
        {timedItems.map((item) => (
          <ItemCard
            key={String(item.id)}
            item={item}
            onEdit={() => onEdit(item)}
            onDelete={() => onDelete(item)}
            onDeleteSeries={() => onDeleteSeries(item)}
            onToggleDone={() => onToggleDone(item)}
          />
        ))}
      </div>

      {/* AI Draft section placeholder / actual chat */}
      <div className="p-2 border-t border-slate-800 shrink-0">
        <button 
          onClick={() => setAiOpen(!aiOpen)}
          className="w-full py-1.5 px-2.5 rounded-lg border border-slate-700 bg-slate-900/50 hover:bg-slate-800 text-slate-200 text-xs font-medium flex justify-between items-center transition-all shadow-sm"
          type="button"
        >
          <span className="flex items-center gap-2"><span className="text-sky-400">✨</span> AI Drafts</span>
          <span className="text-slate-500 text-xs">{aiOpen ? 'Hide' : 'Open'}</span>
        </button>
      </div>

      {aiOpen && (
        <div className="day-panel-ai-section bg-slate-900/30 border-t border-slate-800 animate-slide-up overflow-y-auto shrink-0" style={{ maxHeight: '34vh' }}>
          {chatSection}
        </div>
      )}
    </div>
  );
}
