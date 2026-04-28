'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { addDays } from 'date-fns';
import { Item, TaskStatus, ItemKind } from 'app/types';
import {
  formatDayKey,
  nowInTz,
  parseDayKey,
  rangeEndFromAnchor,
  TIMEZONE,
  formatTime24,
} from 'app/lib/datetime';

export type ItemFormState = {
  id?: number;
  kind: ItemKind;
  day: string;
  timeStart: string | null;
  timeEnd: string | null;
  title: string;
  details: string | null;
  status: TaskStatus;
  planningPeriod: Item['planningPeriod'];
  planningOrder: number | null;
  color: string | null;
  order: number;
  recurrenceRule: string | null;
  recurrenceUntilDay: string | null;
  recurrenceCount: number | null;
  recurrenceExdates: string[];
  parentId: number | null;
  occurrenceDay: string | null;
  sourceId?: number;
  isOccurrence?: boolean;
  isOverride?: boolean;
};

export const emptyForm: ItemFormState = {
  kind: 'task',
  day: '',
  timeStart: null,
  timeEnd: null,
  title: '',
  details: null,
  status: 'todo',
  planningPeriod: null,
  planningOrder: null,
  color: null,
  order: 0,
  recurrenceRule: null,
  recurrenceUntilDay: null,
  recurrenceCount: null,
  recurrenceExdates: [],
  parentId: null,
  occurrenceDay: null,
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
      if (a.timeStart === b.timeStart) return String(a.id).localeCompare(String(b.id));
      return a.timeStart! < b.timeStart! ? -1 : 1;
    }
    const aOrder = a.order ?? 0;
    const bOrder = b.order ?? 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function useCalendarData(initialItems: Item[], initialStart: string) {
  const [anchor, setAnchor] = useState(initialStart);
  const [pinned, setPinned] = useState(false);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const rangeEnd = useMemo(() => rangeEndFromAnchor(anchor, VISIBLE_DAYS), [anchor]);

  const fetchItemsForRange = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/items?start=${anchor}&end=${rangeEnd}`);
    if (!res.ok) {
      setError('Could not load items');
      setLoading(false);
      return;
    }
    const data = await res.json();
    setItems(data.items);
    setLoading(false);
  }, [anchor, hydrated, rangeEnd]);

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
    fetchItemsForRange();
  }, [anchor, hydrated, rangeEnd, fetchItemsForRange]);

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

  const toPayload = (values: ItemFormState) => {
    const timeStart = formatTime24(values.timeStart) || null;
    const timeEnd = formatTime24(values.timeEnd) || null;

    return {
      kind: values.kind,
      day: values.day,
      timeStart,
      timeEnd,
      title: values.title,
      details: values.details ?? null,
      status: values.status ?? 'todo',
      planningPeriod: timeStart ? null : values.planningPeriod ?? null,
      planningOrder: timeStart ? null : values.planningOrder ?? null,
      color: values.color,
      order: values.order,
      recurrenceRule: values.recurrenceRule,
      recurrenceUntilDay: values.recurrenceUntilDay,
      recurrenceCount: values.recurrenceCount,
      recurrenceExdates: values.recurrenceExdates,
      recurrenceTz: TIMEZONE,
      parentId: values.parentId,
      occurrenceDay: values.occurrenceDay,
    } satisfies Omit<Item, 'id' | 'userId'>;
  };

  async function saveItem(values: ItemFormState): Promise<boolean> {
    setError(null);
    const payload = toPayload(values);
    const isOccurrenceEdit = Boolean(values.isOccurrence && values.sourceId);
    if (isOccurrenceEdit) {
      payload.occurrenceDay = values.day;
    }
    const method = isOccurrenceEdit ? 'POST' : values.id ? 'PUT' : 'POST';
    const url = isOccurrenceEdit
      ? `/api/items/${values.sourceId}/overrides`
      : values.id
        ? `/api/items/${values.id}`
        : '/api/items';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setError('Unable to save item');
      return false;
    }
    await fetchItemsForRange();
    return true;
  }

  async function saveSeriesItem(masterId: number, values: ItemFormState): Promise<boolean> {
    setError(null);
    // Strip occurrence-specific fields; we're updating the master
    const payload = toPayload({
      ...values,
      id: masterId,
      isOccurrence: false,
      isOverride: false,
      occurrenceDay: null,
      parentId: null,
    });
    const res = await fetch(`/api/items/${masterId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setError('Unable to update series');
      return false;
    }
    await fetchItemsForRange();
    return true;
  }

  async function removeItem(item: Item) {
    setError(null);
    if (item.isOccurrence && item.sourceId) {
      const res = await fetch(`/api/items/${item.sourceId}/exdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: item.day }),
      });
      if (!res.ok) {
        setError('Unable to delete occurrence');
        return;
      }
      if (item.isOverride && typeof item.id === 'number') {
        await fetch(`/api/items/${item.id}`, { method: 'DELETE' });
      }
      await fetchItemsForRange();
      return;
    }

    if (typeof item.id !== 'number') return;
    const res = await fetch(`/api/items/${item.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('Unable to delete item');
      return;
    }
    await fetchItemsForRange();
  }

  async function markStatus(item: Item, status: TaskStatus) {
    // We recreate toFormStateFromItem logic here inline for brevity
    const formState: ItemFormState = {
      ...emptyForm,
      ...item,
      id: typeof item.id === 'number' ? item.id : undefined,
      day: item.occurrenceDay ?? item.day,
      details: item.details ?? null,
      status: status, // the new status
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
    };
    
    await saveItem(formState);
  }

  const changeAnchor = (next: string, pinOverride?: boolean) => {
    setAnchor(next);
    const shouldPin = pinOverride ?? next !== todayKey();
    setPinned(shouldPin);
  };

  const shiftAnchor = (delta: number) => changeAnchor(formatDayKey(addDays(parseDayKey(anchor), delta)), true);
  const goToday = () => changeAnchor(todayKey(), false);

  return {
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
    markStatus
  };
}
