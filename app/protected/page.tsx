import { auth, signOut } from 'app/auth';
import { Item } from 'app/types';
import MainShell from './main-shell';
import { redirect } from 'next/navigation';
import { formatDayKey, nowInTz } from 'app/lib/datetime';
import { loadExpandedItems } from 'app/lib/load-items';
import { endOfMonth, startOfMonth, format } from 'date-fns';

export default async function ProtectedPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  // Compute current month range in Paris timezone
  const now = nowInTz(new Date());
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const start = formatDayKey(monthStart);
  const end = formatDayKey(monthEnd);

  // Month key YYYY-MM
  const monthKey = format(now, 'yyyy-MM');

  const items = await loadExpandedItems(Number(session!.user!.id), start, end);

  return (
    <div className="app-root">
      <MainShell
        initialItems={items as Item[]}
        initialMonth={monthKey}
        userEmail={session?.user?.email ?? ''}
      />
    </div>
  );
}
