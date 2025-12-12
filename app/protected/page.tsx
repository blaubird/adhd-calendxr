import { addDays, format } from 'date-fns';
import { auth, signOut } from 'app/auth';
import { listItemsInRange } from 'app/db';
import { Item } from 'app/types';
import WeekBoard from './week-board';
import { redirect } from 'next/navigation';

export default async function ProtectedPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const today = new Date();
  const start = format(today, 'yyyy-MM-dd');
  const end = format(addDays(today, 6), 'yyyy-MM-dd');
  const rawItems = await listItemsInRange(Number(session!.user!.id), start, end);
  const items = rawItems.map((item) => ({
    ...item,
    day: typeof item.day === 'string' ? item.day : format(item.day as Date, 'yyyy-MM-dd'),
    timeStart: item.timeStart ? String(item.timeStart).slice(0, 5) : null,
    timeEnd: item.timeEnd ? String(item.timeEnd).slice(0, 5) : null,
  }));

  return (
    <div className="min-h-screen bg-sand text-slate-900">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-card shadow-soft sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-500">Calm 7-day board</p>
          <h1 className="text-xl font-semibold">Calendar Brain</h1>
        </div>
        <form
          action={async () => {
            'use server';
            await signOut();
          }}
        >
          <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Sign out
          </button>
        </form>
      </header>
      <WeekBoard
        initialItems={items as Item[]}
        initialStart={start}
        userEmail={session?.user?.email ?? ''}
      />
    </div>
  );
}
