import { createClient, type Client } from "@libsql/client";

let clientPromise: Promise<Client> | null = null;

function makeClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) {
    return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  // No Turso credentials configured: fall back to a local SQLite file so the
  // app runs out of the box. Same libSQL API either way.
  return createClient({ url: "file:whiteboard.db" });
}

async function migrate(db: Client) {
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS decks (
         id TEXT PRIMARY KEY,
         title TEXT NOT NULL,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS slides (
         id TEXT PRIMARY KEY,
         deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
         idx INTEGER NOT NULL,
         content TEXT NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS slides_deck_idx ON slides (deck_id, idx)`,
      // Page images live here rather than inline in the slide JSON, so an
      // autosave after every stroke stays a few kilobytes.
      `CREATE TABLE IF NOT EXISTS assets (
         id TEXT PRIMARY KEY,
         deck_id TEXT NOT NULL,
         mime TEXT NOT NULL,
         bytes BLOB NOT NULL,
         created_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS assets_deck_idx ON assets (deck_id)`,
    ],
    "write",
  );
}

export function getDb(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const db = makeClient();
      await migrate(db);
      return db;
    })().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export const usingTurso = () => Boolean(process.env.TURSO_DATABASE_URL);
