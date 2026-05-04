import { redirect } from 'next/navigation';

import { getCurrentUser } from './lib/auth/current-user';

export default async function Page() {
  const user = await getCurrentUser();
  if (user) {
    redirect('/protected');
  }
  redirect('/login');
}
