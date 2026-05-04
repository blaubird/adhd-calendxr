export const DEV_AUTH_BYPASS_FLAG = 'CALENDXR_DEV_AUTH_BYPASS';

export const DEV_LOCAL_USER = {
  id: 'dev-local-user',
  email: 'dev@localhost',
  name: 'Local Dev',
} as const;

const LOCALHOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function normalizeHost(host: string | null | undefined) {
  if (!host) return null;
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === '::1') return trimmed;
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    return end >= 0 ? trimmed.slice(0, end + 1) : trimmed;
  }
  return trimmed.split(':')[0] ?? trimmed;
}

export function isLocalhostHost(host: string | null | undefined) {
  const normalized = normalizeHost(host);
  return normalized ? LOCALHOSTS.has(normalized) : false;
}

export function isLocalDevAuthBypassEnabled(host: string | null | undefined) {
  return (
    process.env.CALENDXR_DEV_AUTH_BYPASS === '1' &&
    process.env.NODE_ENV !== 'production' &&
    isLocalhostHost(host)
  );
}

export function requestHost(headers: Pick<Headers, 'get'>) {
  return headers.get('x-forwarded-host') ?? headers.get('host');
}
