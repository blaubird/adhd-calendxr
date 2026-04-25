'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';

import { Item, TaskStatus } from 'app/types';
import {
  formatDayKey,
  nowInTz,
  parseDayKey,
  formatTime24,
  TIMEZONE,
} from 'app/lib/datetime';
import { ItemFormState, emptyForm } from './use-calendar-data';

const MONTH_STORAGE_KEY = 'calendar-month';
const SELECTED_DAY_KEY = 'calendar-selected-day';

function todayKey() {
  return formatDayKey(nowInTz(new Date()));
}

/** Returns the month key YYYY-MM from a Date */
function monthKeyFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

/** Parse YYYY-MM to { year, month } */
function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m };
}

function sortItemsForDay(items: Item[]) {
  return [...items].sort((a, b) => {
    const aTimed = !!a.timeStart;
    const bTimed = !!b.timeStart;
    // Untimed items first
    if (aTimed !== bTimed) return aTimed ? 1 : -1;
    if (aTimed && bTimed) {
      if (a.timeStart === b.timeStart) return String(a.id).localeCompare(String(b.id));
      return a.timeStart! < b.timeStart! ? -1 : 1;
    }
    // Both untimed: sort by order as primary, then id
    const aOrder = a.order ?? 0;
    const bOrder = b.order ?? 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function useMonthCalendar(initialItems: Item[], initialMonth: string) {
  const [monthKey, setMonthKey] = useState(initialMonth);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [selectedDay, setSelectedDay] = useState<string>(todayKey());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const { year, month } = useMemo(() => parseMonthKey(monthKey), [monthKey]);

  /** First day of the month as Date (UTC) */
  const monthStart = useMemo(
    () => new Date(Date.UTC(year, month - 1, 1)),
    [year, month]
  );

  /** Last day of the month as Date (UTC) */
  const monthEnd = useMemo(
    () => new Date(Date.UTC(year, month, 0)),
    [year, month]
  );

  const startKey = useMemo(() => formatDayKey(monthStart), [monthStart]);
  const endKey = useMemo(() => formatDayKey(monthEnd), [monthEnd]);

  /** Number of days in this month */
  const daysInMonth = useMemo(() => new Date(Date.UTC(year, month, 0)).getUTCDate(), [year, month]);

  /** Which weekday is the 1st? 0=Sun..6=Sat. We want Monday=0, so remap. */
  const firstDayWeekday = useMemo(() => {
    const jsDay = monthStart.getUTCDay(); // 0=Sun
    return jsDay === 0 ? 6 : jsDay - 1; // Monday=0
  }, [monthStart]);

  /** Array of day numbers 1..N */
  const dayNumbers = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth]
  );

  /** Build day key from day number */
  const dayKey = useCallback(
    (dayNum: number) => {
      const d = dayNum.toString().padStart(2, '0');
      const m = month.toString().padStart(2, '0');
      return `${year}-${m}-${d}`;
    },
    [year, month]
  );

  /** Group items by day */
  const grouped = useMemo(() => {
    const map: Record<string, Item[]> = {};
    for (const item of items) {
      const key = item.day;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    // Sort each day's items
    Object.keys(map).forEach((k) => {
      map[k] = sortItemsForDay(map[k]);
    });
    return map;
  }, [items]);

  /** Items for the selected day, sorted */
  const selectedDayItems = useMemo(
    () => grouped[selectedDay] || [],
    [grouped, selectedDay]
  );

  /** Fetch items for the current month range */
  const fetchItems = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/items?start=${startKey}&end=${endKey}`);
      if (!res.ok) {
        setError('Could not load items');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setItems(data.items);
    } catch {
      setError('Network error loading items');
    } finally {
      setLoading(false);
    }
  }, [startKey, endKey, hydrated]);

  /** Hydrate from localStorage */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedMonth = localStorage.getItem(MONTH_STORAGE_KEY);
    const savedDay = localStorage.getItem(SELECTED_DAY_KEY);
    if (savedMonth) setMonthKey(savedMonth);
    if (savedDay) setSelectedDay(savedDay);
    setHydrated(true);
  }, []);

  /** Fetch when month or hydration changes */
  useEffect(() => {
    fetchItems();
  }, [monthKey, hydrated, fetchItems]);

  /** Persist month & selected day */
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(MONTH_STORAGE_KEY, monthKey);
    localStorage.setItem(SELECTED_DAY_KEY, selectedDay);
  }, [monthKey, selectedDay, hydrated]);

  /** Navigate months */
  const goNextMonth = useCallback(() => {
    let nextY = year;
    let nextM = month + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY++;
    }
    setMonthKey(`${nextY}-${nextM.toString().padStart(2, '0')}`);
  }, [year, month]);

  const goPrevMonth = useCallback(() => {
    let prevY = year;
    let prevM = month - 1;
    if (prevM < 1) {
      prevM = 12;
      prevY--;
    }
    setMonthKey(`${prevY}-${prevM.toString().padStart(2, '0')}`);
  }, [year, month]);

  const goToday = useCallback(() => {
    const today = nowInTz(new Date());
    setMonthKey(monthKeyFromDate(today));
    setSelectedDay(formatDayKey(today));
  }, []);

  /** Select a specific day */
  const selectDay = useCallback((day: string) => {
    setSelectedDay(day);
  }, []);

  // ── CRUD operations (reused from use-calendar-data pattern) ──

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

    // The overrides endpoint uses strict validation that rejects
    // 'day' and 'parentId' fields — strip them for that path.
    let body: Record<string, unknown> = payload;
    if (isOccurrenceEdit) {
      const { day: _day, parentId: _pid, ...overrideBody } = payload;
      body = overrideBody;
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError('Unable to save item');
      return false;
    }
    await fetchItems();
    return true;
  }

  async function saveItemsOrder(orderedItems: Item[]) {
    // Sequentially update orders without triggering fetch loop
    for (const item of orderedItems) {
      if (typeof item.id !== 'number' || item.isOccurrence) continue; // Skip occurrences
      const payload = {
        kind: item.kind,
        day: item.day,
        timeStart: item.timeStart ? formatTime24(item.timeStart) : null,
        timeEnd: item.timeEnd ? formatTime24(item.timeEnd) : null,
        title: item.title,
        details: item.details ?? null,
        status: item.status ?? 'todo',
        color: item.color ?? null,
        order: item.order ?? 0,
        recurrenceRule: item.recurrenceRule ?? null,
        recurrenceUntilDay: item.recurrenceUntilDay ?? null,
        recurrenceCount: item.recurrenceCount ?? null,
        recurrenceExdates: item.recurrenceExdates ?? [],
        recurrenceTz: TIMEZONE,
        parentId: item.parentId ?? null,
        occurrenceDay: item.occurrenceDay ?? null,
      };
      await fetch(`/api/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    await fetchItems();
  }

  async function saveSeriesItem(masterId: number, values: ItemFormState): Promise<boolean> {
    setError(null);
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
    await fetchItems();
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
      await fetchItems();
      return;
    }

    if (typeof item.id !== 'number') return;
    const res = await fetch(`/api/items/${item.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('Unable to delete item');
      return;
    }
    await fetchItems();
  }

  /** Delete the entire recurring series by deleting the master item (cascade). */
  async function removeSeriesItem(item: Item) {
    setError(null);
    // For an occurrence, sourceId is the master's ID
    const masterId = item.sourceId ?? (typeof item.id === 'number' ? item.id : null);
    if (!masterId) return;

    const res = await fetch(`/api/items/${masterId}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('Unable to delete series');
      return;
    }
    await fetchItems();
  }

  async function markStatus(item: Item, status: TaskStatus) {
    const formState: ItemFormState = {
      ...emptyForm,
      ...item,
      id: typeof item.id === 'number' ? item.id : undefined,
      day: item.occurrenceDay ?? item.day,
      details: item.details ?? null,
      status: status,
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

  return {
    monthKey,
    year,
    month,
    daysInMonth,
    firstDayWeekday,
    dayNumbers,
    dayKey,
    grouped,
    selectedDay,
    selectedDayItems,
    loading,
    error,
    goNextMonth,
    goPrevMonth,
    goToday,
    selectDay,
    saveItem,
    saveSeriesItem,
    removeItem,
    removeSeriesItem,
    markStatus,
    saveItemsOrder,
    startKey,
    endKey,
    fetchItems,
  };
}
