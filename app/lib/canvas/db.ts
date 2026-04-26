import { eq, and, inArray } from 'drizzle-orm';
import { db } from 'app/db';
import { canvasBoards, canvasElements } from 'app/schema';
import type { BoardScope, CanvasElementData } from './types';

// ─── Board CRUD ─────────────────────────────────────────────

export async function getOrCreateBoard(
  userId: number,
  scope: BoardScope,
  scopeKey: string
) {
  // Try to find existing board
  const [existing] = await db
    .select()
    .from(canvasBoards)
    .where(
      and(
        eq(canvasBoards.userId, userId),
        eq(canvasBoards.scope, scope),
        eq(canvasBoards.scopeKey, scopeKey)
      )
    )
    .limit(1);

  if (existing) return existing;

  // Create new board
  const [board] = await db
    .insert(canvasBoards)
    .values({ userId, scope, scopeKey })
    .onConflictDoNothing()
    .returning();

  // Handle race condition: another request may have created it
  if (!board) {
    const [fallback] = await db
      .select()
      .from(canvasBoards)
      .where(
        and(
          eq(canvasBoards.userId, userId),
          eq(canvasBoards.scope, scope),
          eq(canvasBoards.scopeKey, scopeKey)
        )
      )
      .limit(1);
    return fallback;
  }

  return board;
}

export async function touchBoard(boardId: number) {
  await db
    .update(canvasBoards)
    .set({ updatedAt: new Date() })
    .where(eq(canvasBoards.id, boardId));
}

// ─── Element CRUD ───────────────────────────────────────────

export async function listElements(boardId: number) {
  return db
    .select()
    .from(canvasElements)
    .where(eq(canvasElements.boardId, boardId))
    .orderBy(canvasElements.zIndex, canvasElements.id);
}

export async function createElement(
  boardId: number,
  type: 'text' | 'checklist' | 'stroke',
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
  data: CanvasElementData
) {
  const [el] = await db
    .insert(canvasElements)
    .values({ boardId, type, x, y, width, height, zIndex, data })
    .returning();
  await touchBoard(boardId);
  return el;
}

export async function updateElement(
  elementId: number,
  boardId: number,
  updates: Partial<{
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
    data: CanvasElementData;
  }>
) {
  const [el] = await db
    .update(canvasElements)
    .set({ ...updates, updatedAt: new Date() })
    .where(
      and(eq(canvasElements.id, elementId), eq(canvasElements.boardId, boardId))
    )
    .returning();
  if (el) await touchBoard(boardId);
  return el;
}

export async function deleteElement(elementId: number, boardId: number) {
  const result = await db
    .delete(canvasElements)
    .where(
      and(eq(canvasElements.id, elementId), eq(canvasElements.boardId, boardId))
    )
    .returning();
  if (result.length > 0) await touchBoard(boardId);
  return result.length > 0;
}

export async function bulkDeleteElements(ids: number[], boardId: number) {
  if (ids.length === 0) return;
  await db
    .delete(canvasElements)
    .where(
      and(
        inArray(canvasElements.id, ids),
        eq(canvasElements.boardId, boardId)
      )
    );
  await touchBoard(boardId);
}

// ─── Auth helper ────────────────────────────────────────────

export async function verifyBoardOwnership(
  boardId: number,
  userId: number
): Promise<boolean> {
  const [board] = await db
    .select({ id: canvasBoards.id })
    .from(canvasBoards)
    .where(
      and(eq(canvasBoards.id, boardId), eq(canvasBoards.userId, userId))
    )
    .limit(1);
  return !!board;
}
