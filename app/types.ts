export type ItemKind = 'event' | 'task';
export type TaskStatus = 'todo' | 'done' | 'canceled' | null;

export type Item = {
  id: number;
  userId: number;
  kind: ItemKind;
  day: string; // YYYY-MM-DD
  timeStart: string | null;
  timeEnd: string | null;
  title: string;
  details: string | null;
  status: TaskStatus;
};

export type Draft = {
  kind: ItemKind;
  title: string;
  day: string;
  timeStart: string | null;
  timeEnd: string | null;
  details: string | null;
  status: 'todo' | 'done' | 'canceled';
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
