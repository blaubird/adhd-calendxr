import { headers } from 'next/headers';

import { auth } from 'app/auth';
import { ensureLocalDevUser } from 'app/db';
import {
  DEV_LOCAL_USER,
  isLocalDevAuthBypassEnabled,
  requestHost,
} from './dev-bypass';

export type CurrentUser = {
  id: string;
  dbId: number;
  email: string;
  name: string | null;
  isDevAuthBypass: boolean;
};

let didLogDevBypass = false;

function logDevBypassOnce() {
  if (didLogDevBypass) return;
  didLogDevBypass = true;
  console.warn('CALENDXR local dev auth bypass active');
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const host = requestHost(headers());

  if (isLocalDevAuthBypassEnabled(host)) {
    logDevBypassOnce();
    const devUser = await ensureLocalDevUser(DEV_LOCAL_USER.email);
    return {
      id: DEV_LOCAL_USER.id,
      dbId: devUser.id,
      email: DEV_LOCAL_USER.email,
      name: DEV_LOCAL_USER.name,
      isDevAuthBypass: true,
    };
  }

  const session = await auth();
  const dbId = Number(session?.user?.id);
  if (!session?.user?.id || !Number.isInteger(dbId) || dbId <= 0) {
    return null;
  }

  const sessionUser = session.user as { email?: string | null; name?: string | null };

  return {
    id: String(session.user.id),
    dbId,
    email: sessionUser.email ?? '',
    name: sessionUser.name ?? null,
    isDevAuthBypass: false,
  };
}

export async function getCurrentUserId() {
  const user = await getCurrentUser();
  return user?.dbId ?? null;
}
