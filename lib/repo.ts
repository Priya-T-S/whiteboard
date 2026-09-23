import { nanoid } from "nanoid";
import { getDb } from "./db";
import { emptySlide, type Deck, type Slide, type SlideContent } from "./types";

const now = () => Date.now();

function parseContent(raw: unknown): SlideContent {
  try {
    const parsed = JSON.parse(String(raw)) as SlideContent;
    if (!parsed || !Array.isArray(parsed.elements)) return emptySlide();
    return { background: parsed.background ?? "#ffffff", elements: parsed.elements };
  } catch {
    return emptySlide();
  }
}

export async function listDecks(): Promise<Deck[]> {
  const db = await getDb();
  const rs = await db.execute(`
    SELECT d.id, d.title, d.created_at, d.updated_at,
           (SELECT COUNT(*) FROM slides s WHERE s.deck_id = d.id) AS slide_count
    FROM decks d ORDER BY d.updated_at DESC`);
  return rs.rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    slideCount: Number(r.slide_count),
  }));
}

export async function createDeck(title: string): Promise<Deck> {
  const db = await getDb();
  const id = nanoid(12);
  const t = now();
  await db.batch(
    [
      { sql: `INSERT INTO decks (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`, args: [id, title, t, t] },
      {
        sql: `INSERT INTO slides (id, deck_id, idx, content, updated_at) VALUES (?, ?, 0, ?, ?)`,
        args: [nanoid(12), id, JSON.stringify(emptySlide()), t],
      },
    ],
    "write",
  );
  return { id, title, createdAt: t, updatedAt: t, slideCount: 1 };
}

export async function getDeck(id: string): Promise<{ deck: Deck; slides: Slide[] } | null> {
  const db = await getDb();
  const d = await db.execute({ sql: `SELECT * FROM decks WHERE id = ?`, args: [id] });
  if (d.rows.length === 0) return null;
  const row = d.rows[0];
  const s = await db.execute({
    sql: `SELECT id, deck_id, idx, content FROM slides WHERE deck_id = ? ORDER BY idx ASC`,
    args: [id],
  });
  return {
    deck: {
      id: String(row.id),
      title: String(row.title),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    },
    slides: s.rows.map((r) => ({
      id: String(r.id),
      deckId: String(r.deck_id),
      idx: Number(r.idx),
      content: parseContent(r.content),
    })),
  };
}

export async function renameDeck(id: string, title: string) {
  const db = await getDb();
  await db.execute({ sql: `UPDATE decks SET title = ?, updated_at = ? WHERE id = ?`, args: [title, now(), id] });
}

export async function deleteDeck(id: string) {
  const db = await getDb();
  await db.batch(
    [
      { sql: `DELETE FROM assets WHERE deck_id = ?`, args: [id] },
      { sql: `DELETE FROM slides WHERE deck_id = ?`, args: [id] },
      { sql: `DELETE FROM decks WHERE id = ?`, args: [id] },
    ],
    "write",
  );
}

/** Inserts a slide at `afterIdx + 1`, shifting everything after it down. */
export async function addSlide(deckId: string, afterIdx: number, content?: SlideContent): Promise<Slide> {
  const db = await getDb();
  const id = nanoid(12);
  const t = now();
  const idx = afterIdx + 1;
  const body = JSON.stringify(content ?? emptySlide());
  await db.batch(
    [
      { sql: `UPDATE slides SET idx = idx + 1 WHERE deck_id = ? AND idx >= ?`, args: [deckId, idx] },
      { sql: `INSERT INTO slides (id, deck_id, idx, content, updated_at) VALUES (?, ?, ?, ?, ?)`, args: [id, deckId, idx, body, t] },
      { sql: `UPDATE decks SET updated_at = ? WHERE id = ?`, args: [t, deckId] },
    ],
    "write",
  );
  return { id, deckId, idx, content: content ?? emptySlide() };
}

export async function saveSlide(id: string, content: SlideContent) {
  const db = await getDb();
  const t = now();
  await db.batch(
    [
      { sql: `UPDATE slides SET content = ?, updated_at = ? WHERE id = ?`, args: [JSON.stringify(content), t, id] },
      { sql: `UPDATE decks SET updated_at = ? WHERE id = (SELECT deck_id FROM slides WHERE id = ?)`, args: [t, id] },
    ],
    "write",
  );
}

/** Deletes a slide and closes the gap. Refuses to delete the last slide. */
export async function deleteSlide(id: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.execute({ sql: `SELECT deck_id, idx FROM slides WHERE id = ?`, args: [id] });
  if (r.rows.length === 0) return false;
  const deckId = String(r.rows[0].deck_id);
  const idx = Number(r.rows[0].idx);
  const c = await db.execute({ sql: `SELECT COUNT(*) AS n FROM slides WHERE deck_id = ?`, args: [deckId] });
  if (Number(c.rows[0].n) <= 1) return false;
  await db.batch(
    [
      { sql: `DELETE FROM slides WHERE id = ?`, args: [id] },
      { sql: `UPDATE slides SET idx = idx - 1 WHERE deck_id = ? AND idx > ?`, args: [deckId, idx] },
      { sql: `UPDATE decks SET updated_at = ? WHERE id = ?`, args: [now(), deckId] },
    ],
    "write",
  );
  return true;
}

/** `order` is the full list of slide ids in their new order. */
export async function reorderSlides(deckId: string, order: string[]) {
  const db = await getDb();
  await db.batch(
    order.map((sid, i) => ({
      sql: `UPDATE slides SET idx = ? WHERE id = ? AND deck_id = ?`,
      args: [i, sid, deckId],
    })),
    "write",
  );
}

/* ------------------------------------------------------------------ assets */

export async function createAsset(deckId: string, mime: string, bytes: Uint8Array): Promise<string> {
  const db = await getDb();
  const id = nanoid(16);
  await db.execute({
    sql: `INSERT INTO assets (id, deck_id, mime, bytes, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [id, deckId, mime, bytes, now()],
  });
  return id;
}

export async function getAsset(id: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
  const db = await getDb();
  const rs = await db.execute({ sql: `SELECT mime, bytes FROM assets WHERE id = ?`, args: [id] });
  if (rs.rows.length === 0) return null;
  const row = rs.rows[0];
  const raw = row.bytes as unknown;
  const bytes =
    raw instanceof Uint8Array
      ? raw
      : raw instanceof ArrayBuffer
        ? new Uint8Array(raw)
        : new Uint8Array(0);
  return { mime: String(row.mime), bytes };
}
