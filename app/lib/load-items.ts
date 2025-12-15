import { listItemsInRange } from 'app/db';
import { normalizeItemList } from './items';
import { expandRecurringItems } from './recurrence';
import { TIMEZONE } from './datetime';

export async function loadExpandedItems(userId: number, start: string, end: string) {
  const records = await listItemsInRange(userId, start, end);
  const normalized = normalizeItemList(records);
  return expandRecurringItems(normalized, start, end, TIMEZONE);
}
