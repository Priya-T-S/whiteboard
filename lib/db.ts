import { createClient, type Client } from "@libsql/client";

let clientPromise: Promise<Client> | null = null;

function makeClient(): Client {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  if (url) {
    return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN?.trim() });
  }
  if (process.env.NODE_ENV === "production") {
    // The local-file fallback needs a writable disk, which a deployment
    // usually does not have. Say so plainly instead of failing deep inside a
    // server render, where the message gets stripped from the build.
    throw new Error(
      "TURSO_DATABASE_URL is not set. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN " +
        "in the deployment environment - the local SQLite fallback is development only.",
    );
  }
  // Development with no credentials: a local SQLite file, so the app runs
  // out of the box. Same libSQL API either way.
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
      // Server Component errors are minified in production builds, so make
      // sure the real reason reaches the server log.
      console.error("[whiteboard] database unavailable:", err);
      throw err;
    });
  }
  return clientPromise;
}

export const usingTurso = () => Boolean(process.env.TURSO_DATABASE_URL);
