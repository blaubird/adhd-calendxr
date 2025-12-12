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
  kind: ItemKind | 'clarify';
  title: string;
  day: string | null;
  timeStart?: string | null;
  timeEnd?: string | null;
  details?: string | null;
  questions?: string[];
};
