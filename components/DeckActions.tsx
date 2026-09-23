"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function NewDeckButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Untitled deck" }),
    });
    const deck = await res.json();
    router.push(`/d/${deck.id}`);
  }

  return (
    <button
      onClick={create}
      disabled={busy}
      className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {busy ? "Creating…" : "New deck"}
    </button>
  );
}

export default function DeckActions({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function rename() {
    const next = window.prompt("Deck title", title);
    if (!next || next === title) return;
    await fetch(`/api/decks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    startTransition(() => router.refresh());
  }

  async function remove() {
    if (!window.confirm(`Delete "${title}" and all of its slides?`)) return;
    await fetch(`/api/decks/${id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  return (
    <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
      <button
        onClick={rename}
        className="rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
      >
        Rename
      </button>
      <button
        onClick={remove}
        className="rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-red-400"
      >
        Delete
      </button>
    </div>
  );
}
