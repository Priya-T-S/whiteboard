import Link from "next/link";
import { listDecks } from "@/lib/repo";
import { usingTurso } from "@/lib/db";
import DeckActions, { NewDeckButton } from "@/components/DeckActions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const decks = await listDecks();
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Whiteboard</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Slide decks you draw instead of type.{" "}
            {usingTurso() ? "Synced to Turso." : "Saving to a local SQLite file — set TURSO_DATABASE_URL to sync."}
          </p>
        </div>
        <NewDeckButton />
      </header>

      {decks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-16 text-center text-[var(--muted)]">
          No decks yet. Create one to start drawing.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((d) => (
            <li
              key={d.id}
              className="group relative rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 transition hover:border-[var(--accent)]"
            >
              <Link href={`/d/${d.id}`} className="block">
                <div className="truncate text-lg font-medium">{d.title}</div>
                <div className="mt-2 text-xs text-[var(--muted)]">
                  {d.slideCount} slide{d.slideCount === 1 ? "" : "s"} · edited{" "}
                  {new Date(d.updatedAt).toLocaleDateString()}
                </div>
              </Link>
              <DeckActions id={d.id} title={d.title} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
