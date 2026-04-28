export type ItemKind = 'event' | 'task';
export type TaskStatus = 'todo' | 'done' | 'canceled' | null;
export type PlanningPeriod = 'morning' | 'day' | 'evening';

export type ItemId = number | string;

export type Item = {
  id: ItemId;
  userId: number;
  kind: ItemKind;
  day: string; // YYYY-MM-DD
  timeStart: string | null;
  timeEnd: string | null;
  title: string;
  details: string | null;
  status: TaskStatus;
  planningPeriod?: PlanningPeriod | null;
  planningOrder?: number | null;
  color?: string | null;
  order?: number | null;
  recurrenceRule?: string | null;
  recurrenceTz?: string;
  recurrenceUntilDay?: string | null;
  recurrenceCount?: number | null;
  recurrenceExdates?: string[];
  parentId?: number | null;
  occurrenceDay?: string | null;
  sourceId?: number;
  isOccurrence?: boolean;
  isOverride?: boolean;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

export type Draft = {
  kind: ItemKind;
  title: string;
  day: string;
  timeStart: string | null;
  timeEnd: string | null;
  details: string | null;
  status: 'todo' | 'done' | 'canceled';
  recurrenceRule?: string | null;
  recurrenceUntilDay?: string | null;
  recurrenceCount?: number | null;
};

export type DraftClarification = {
  needClarification: true;
  questions: string[];
};

export type DraftResponse = {
  drafts: Draft[];
  needClarification?: false;
};

export type AiChatResult = DraftResponse | DraftClarification;
