'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">Please try again or check the service status.</p>
      {error?.digest && <p className="mt-2 text-xs text-slate-500">Digest: {error.digest}</p>}
      <div className="mt-4 flex items-center gap-4">
        <button onClick={() => reset()} className="underline">
          Try again
        </button>
        <Link href="/api/health" className="underline">
          API health
        </Link>
      </div>
    </div>
  );
}
