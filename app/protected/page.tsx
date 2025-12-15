import { auth, signOut } from 'app/auth';
import { Item } from 'app/types';
import WeekBoard from './week-board';
import { redirect } from 'next/navigation';
import { formatDayKey, nowInTz, rangeEndFromAnchor } from 'app/lib/datetime';
import { loadExpandedItems } from 'app/lib/load-items';

export default async function ProtectedPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const today = nowInTz(new Date());
  const start = formatDayKey(today);
  const end = rangeEndFromAnchor(formatDayKey(today), 4);
  const items = await loadExpandedItems(Number(session!.user!.id), start, end);

  return (
    <div className="min-h-screen bg-sand text-slate-100 overflow-x-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-card shadow-soft sticky top-0 z-10">
        <div>
          <p className="text-sm text-slate-400">Focused 4-day board</p>
          <h1 className="text-xl font-semibold text-white">Calendar Brain</h1>
        </div>
        <form
          action={async () => {
            'use server';
            await signOut();
          }}
        >
          <button className="rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-colors">
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
