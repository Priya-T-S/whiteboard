"use client";

/** Without this, a failed server render shows a blank page and a minified
 *  React error in the console with no clue what went wrong. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">
        The page could not be rendered. This is almost always the database: check that{" "}
        <code className="text-[var(--text)]">TURSO_DATABASE_URL</code> and{" "}
        <code className="text-[var(--text)]">TURSO_AUTH_TOKEN</code> are set wherever this is running,
        and that the database is reachable.
      </p>
      <p className="mt-3 text-sm text-[var(--muted)]">
        The full message is in the server log, not here — production builds strip it.
        {error.digest && (
          <>
            {" "}
            Look for digest <code className="text-[var(--text)]">{error.digest}</code>.
          </>
        )}
      </p>
      <div className="mt-6 flex gap-2">
        <button
          onClick={reset}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--panel-2)]"
        >
          Back to decks
        </a>
      </div>
    </main>
  );
}
