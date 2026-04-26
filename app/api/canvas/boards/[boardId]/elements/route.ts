import { NextResponse } from 'next/server';
import { auth } from 'app/auth';
import {
  createElement,
  updateElement,
  deleteElement,
  bulkDeleteElements,
  listElements,
  verifyBoardOwnership,
} from 'app/lib/canvas/db';
import {
  createElementSchema,
  updateElementSchema,
} from 'app/lib/canvas/validation';
import { MAX_ELEMENTS_PER_BOARD } from 'app/lib/canvas/types';

// Create element
export async function POST(
  request: Request,
  { params }: { params: { boardId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const boardId = Number(params.boardId);
  if (isNaN(boardId)) {
    return NextResponse.json({ error: 'Invalid boardId' }, { status: 400 });
  }

  const userId = Number(session.user.id);
  const owns = await verifyBoardOwnership(boardId, userId);
  if (!owns) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const json = await request.json();
  const parsed = createElementSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Check element count limit
  const existing = await listElements(boardId);
  if (existing.length >= MAX_ELEMENTS_PER_BOARD) {
    return NextResponse.json(
      { error: `Max ${MAX_ELEMENTS_PER_BOARD} elements per board` },
      { status: 400 }
    );
  }

  const { type, x, y, width, height, zIndex, data } = parsed.data;
  const element = await createElement(boardId, type, x, y, width, height, zIndex, data);

  return NextResponse.json({ element }, { status: 201 });
}

// Update element
export async function PATCH(
  request: Request,
  { params }: { params: { boardId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const boardId = Number(params.boardId);
  if (isNaN(boardId)) {
    return NextResponse.json({ error: 'Invalid boardId' }, { status: 400 });
  }

  const userId = Number(session.user.id);
  const owns = await verifyBoardOwnership(boardId, userId);
  if (!owns) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const json = await request.json();
  const elementId = json.elementId;
  if (typeof elementId !== 'number') {
    return NextResponse.json({ error: 'elementId required' }, { status: 400 });
  }

  const parsed = updateElementSchema.safeParse(json.updates);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const element = await updateElement(elementId, boardId, parsed.data);
  if (!element) {
    return NextResponse.json({ error: 'Element not found' }, { status: 404 });
  }

  return NextResponse.json({ element });
}

// Delete element(s)
export async function DELETE(
  request: Request,
  { params }: { params: { boardId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const boardId = Number(params.boardId);
  if (isNaN(boardId)) {
    return NextResponse.json({ error: 'Invalid boardId' }, { status: 400 });
  }

  const userId = Number(session.user.id);
  const owns = await verifyBoardOwnership(boardId, userId);
  if (!owns) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const json = await request.json();

  // Support single or bulk delete
  if (Array.isArray(json.ids)) {
    await bulkDeleteElements(json.ids, boardId);
    return NextResponse.json({ ok: true });
  }

  if (typeof json.elementId === 'number') {
    const deleted = await deleteElement(json.elementId, boardId);
    if (!deleted) {
      return NextResponse.json({ error: 'Element not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'elementId or ids required' }, { status: 400 });
}
