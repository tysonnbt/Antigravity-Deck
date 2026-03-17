'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ErrorBoundary]', error);
  }, [error]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-950">
      <div className="max-w-md space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
        <div className="text-4xl">&#x26A0;&#xFE0F;</div>
        <h2 className="text-xl font-semibold text-zinc-100">Something went wrong</h2>
        <p className="text-sm text-zinc-400">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-600 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
