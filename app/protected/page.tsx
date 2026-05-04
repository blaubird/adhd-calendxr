import { signOut } from 'app/auth';
import { Item } from 'app/types';
import MainShell from './main-shell';
import { redirect } from 'next/navigation';
import { formatDayKey, nowInTz } from 'app/lib/datetime';
import { loadExpandedItems } from 'app/lib/load-items';
import { getCurrentUser } from 'app/lib/auth/current-user';
import { endOfMonth, startOfMonth, format } from 'date-fns';

export default async function ProtectedPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  async function signOutAction() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  // Compute current month range in Paris timezone
  const now = nowInTz(new Date());
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const start = formatDayKey(monthStart);
  const end = formatDayKey(monthEnd);

  // Month key YYYY-MM
  const monthKey = format(now, 'yyyy-MM');

  const items = await loadExpandedItems(user.dbId, start, end);

  return (
    <div className="app-root">
      <MainShell
        initialItems={items as Item[]}
        initialMonth={monthKey}
        userEmail={user.email}
        onSignOut={signOutAction}
      />
    </div>
  );
}
