import { NextResponse } from 'next/server';
import { getOrCreateBoard, listElements } from 'app/lib/canvas/db';
import { getCurrentUserId } from 'app/lib/auth/current-user';
import { getBoardSchema } from 'app/lib/canvas/validation';

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope');
  const scopeKey = searchParams.get('scopeKey');

  const parsed = getBoardSchema.safeParse({ scope, scopeKey });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid params', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const board = await getOrCreateBoard(userId, parsed.data.scope, parsed.data.scopeKey);

  if (!board) {
    return NextResponse.json({ error: 'Failed to get board' }, { status: 500 });
  }

  const elements = await listElements(board.id);

  return NextResponse.json({ board, elements });
}
