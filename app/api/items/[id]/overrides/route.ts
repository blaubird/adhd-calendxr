import { NextResponse } from 'next/server';
import { addExdate, createOverride, getItemById } from 'app/db';
import { getCurrentUserId } from 'app/lib/auth/current-user';
import { normalizeItemRecord } from 'app/lib/items';
import { overrideInputSchema } from 'app/lib/validation';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const json = await request.json();
  const result = overrideInputSchema.safeParse(json);
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid payload', details: result.error.flatten() }, { status: 400 });
  }

  const master = await getItemById(userId, Number(params.id));
  if (!master || !master.recurrenceRule || master.parentId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await addExdate(userId, Number(params.id), result.data.occurrenceDay);
  const [override] = await createOverride(
    userId,
    Number(params.id),
    result.data.occurrenceDay,
    { ...result.data, day: result.data.occurrenceDay }
  );

  const normalized = normalizeItemRecord(override);
  return NextResponse.json({
    item: {
      ...normalized,
      day: result.data.occurrenceDay,
      sourceId: Number(params.id),
      isOccurrence: true,
      isOverride: true,
    },
  });
}
