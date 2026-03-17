import Database from "better-sqlite3";
import path from "path";
import { stripHtml } from "./html-strip";

const DB_PATH = path.join(process.cwd(), "freeder-cache.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initTables(db);
  }
  return db;
}

function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      stream_id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_entries_stream ON entries(stream_id);

    CREATE TABLE IF NOT EXISTS unread_counts (
      id TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS cache_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS user_feedly_tokens (
      user_id INTEGER PRIMARY KEY,
      access_token TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS extracted_content (
      url TEXT PRIMARY KEY,
      title TEXT,
      content TEXT NOT NULL,
      text_content TEXT,
      excerpt TEXT,
      extracted_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Migration: add user_id column to cache_meta for per-user preferences
  const cols = db
    .prepare("PRAGMA table_info(cache_meta)")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "user_id")) {
    db.exec("ALTER TABLE cache_meta ADD COLUMN user_id INTEGER DEFAULT NULL");
  }
  // Recreate without old PRIMARY KEY constraint by using a unique index
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_meta_user_key ON cache_meta(COALESCE(user_id, 0), key)"
  );

  // FTS5 full-text search table for entries (trigram tokenizer for CJK support)
  // Check if FTS table exists and uses correct tokenizer; recreate if needed
  const ftsExists = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='entries_fts'"
    )
    .get() as { sql: string } | undefined;

  if (ftsExists && !ftsExists.sql.includes("trigram")) {
    // Old unicode61 tokenizer — drop and recreate with trigram
    db.exec("DROP TABLE IF EXISTS entries_fts");
  }

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      entry_id UNINDEXED,
      title,
      content,
      feed_title,
      tokenize='trigram'
    );
  `);

  // Populate FTS index from existing entries if needed
  const ftsCount = (
    db.prepare("SELECT count(*) as c FROM entries_fts").get() as { c: number }
  ).c;
  const entriesCount = (
    db.prepare("SELECT count(*) as c FROM entries").get() as { c: number }
  ).c;

  if (entriesCount > 0 && ftsCount === 0) {
    rebuildFtsIndex(db);
  }
}

function rebuildFtsIndex(db: Database.Database): void {
  const rows = db
    .prepare("SELECT id, data FROM entries")
    .all() as { id: string; data: string }[];
  const insertFts = db.prepare(
    "INSERT INTO entries_fts (entry_id, title, content, feed_title) VALUES (?, ?, ?, ?)"
  );
  const tx = db.transaction(() => {
    for (const row of rows) {
      const entry = JSON.parse(row.data);
      const title = entry.title || "";
      const bodyHtml =
        entry.content?.content || entry.summary?.content || "";
      const bodyText = stripHtml(bodyHtml);
      const feedTitle = entry.origin?.title || "";
      insertFts.run(row.id, title, bodyText, feedTitle);
    }
  });
  tx();
}

// --- Subscriptions ---

export function cacheSubscriptions(subs: unknown[]): void {
  const db = getDb();
  const upsert = db.prepare(
    "INSERT OR REPLACE INTO subscriptions (id, data, updated_at) VALUES (?, ?, unixepoch())"
  );
  const tx = db.transaction(() => {
    for (const sub of subs) {
      const s = sub as { id: string };
      upsert.run(s.id, JSON.stringify(sub));
    }
  });
  tx();
}

export function getCachedSubscriptions(): unknown[] | null {
  const db = getDb();
  const rows = db
    .prepare("SELECT data FROM subscriptions ORDER BY rowid")
    .all() as { data: string }[];
  if (rows.length === 0) return null;
  return rows.map((r) => JSON.parse(r.data));
}

// --- Entries (per stream) ---

export function cacheEntries(streamId: string, entries: unknown[]): void {
  const db = getDb();
  const upsert = db.prepare(
    "INSERT OR REPLACE INTO entries (id, stream_id, data, updated_at) VALUES (?, ?, ?, unixepoch())"
  );
  const deleteFts = db.prepare("DELETE FROM entries_fts WHERE entry_id = ?");
  const insertFts = db.prepare(
    "INSERT INTO entries_fts (entry_id, title, content, feed_title) VALUES (?, ?, ?, ?)"
  );

  const tx = db.transaction(() => {
    for (const entry of entries) {
      const e = entry as {
        id: string;
        title?: string;
        content?: { content: string };
        summary?: { content: string };
        origin?: { title?: string };
      };

      // Upsert the entry (no DELETE — articles accumulate permanently)
      upsert.run(e.id, streamId, JSON.stringify(entry));

      // Update FTS index
      deleteFts.run(e.id);
      const title = e.title || "";
      const bodyHtml = e.content?.content || e.summary?.content || "";
      const bodyText = stripHtml(bodyHtml);
      const feedTitle = e.origin?.title || "";
      insertFts.run(e.id, title, bodyText, feedTitle);
    }
  });
  tx();
}

export function getCachedEntries(streamId: string): unknown[] | null {
  const db = getDb();
  const rows = db
    .prepare("SELECT data FROM entries WHERE stream_id = ? ORDER BY rowid")
    .all(streamId) as { data: string }[];
  if (rows.length === 0) return null;
  return rows.map((r) => JSON.parse(r.data));
}

// --- Search ---

export function searchEntries(
  query: string,
  limit: number = 50,
  streamIds?: string[]
): { id: string; data: string; snippet: string; feedTitle: string }[] {
  const db = getDb();
  const trimmed = query.trim();
  if (!trimmed) return [];

  // With trigram tokenizer, use quoted string for exact substring matching
  // Search only title and content columns, exclude feed_title
  const ftsQuery = `{title content}: "${trimmed.replace(/"/g, '""')}"`;

  if (streamIds && streamIds.length > 0) {
    const placeholders = streamIds.map(() => "?").join(",");
    const stmt = db.prepare(`
      SELECT
        e.id,
        e.data,
        snippet(entries_fts, 2, '<mark>', '</mark>', '...', 30) as snippet,
        entries_fts.feed_title as feedTitle
      FROM entries_fts
      JOIN entries e ON e.id = entries_fts.entry_id
      WHERE entries_fts MATCH ?
        AND e.stream_id IN (${placeholders})
      ORDER BY bm25(entries_fts)
      LIMIT ?
    `);
    return stmt.all(ftsQuery, ...streamIds, limit) as {
      id: string;
      data: string;
      snippet: string;
      feedTitle: string;
    }[];
  }

  const stmt = db.prepare(`
    SELECT
      e.id,
      e.data,
      snippet(entries_fts, 2, '<mark>', '</mark>', '...', 30) as snippet,
      entries_fts.feed_title as feedTitle
    FROM entries_fts
    JOIN entries e ON e.id = entries_fts.entry_id
    WHERE entries_fts MATCH ?
    ORDER BY bm25(entries_fts)
    LIMIT ?
  `);
  return stmt.all(ftsQuery, limit) as {
    id: string;
    data: string;
    snippet: string;
    feedTitle: string;
  }[];
}

// --- Unread Counts ---

export function cacheUnreadCounts(counts: Record<string, number>): void {
  const db = getDb();
  const upsert = db.prepare(
    "INSERT OR REPLACE INTO unread_counts (id, count, updated_at) VALUES (?, ?, unixepoch())"
  );
  const tx = db.transaction(() => {
    for (const [id, count] of Object.entries(counts)) {
      upsert.run(id, count);
    }
  });
  tx();
}

export function getCachedUnreadCounts(): Record<string, number> | null {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, count FROM unread_counts")
    .all() as { id: string; count: number }[];
  if (rows.length === 0) return null;
  const result: Record<string, number> = {};
  for (const r of rows) {
    result[r.id] = r.count;
  }
  return result;
}

// --- Users ---

export function createUser(
  username: string,
  passwordHash: string
): number {
  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO users (username, password_hash) VALUES (?, ?)"
    )
    .run(username, passwordHash);
  return Number(result.lastInsertRowid);
}

export function getUserByUsername(
  username: string
): { id: number; username: string; password_hash: string } | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .get(username) as
    | { id: number; username: string; password_hash: string }
    | undefined;
  return row ?? null;
}

export function getUserCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as c FROM users").get() as {
    c: number;
  };
  return row.c;
}

// --- Feedly Tokens ---

export function setFeedlyToken(userId: number, token: string): void {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO user_feedly_tokens (user_id, access_token, updated_at) VALUES (?, ?, unixepoch())"
  ).run(userId, token);
}

export function getFeedlyToken(userId: number): string | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT access_token FROM user_feedly_tokens WHERE user_id = ?"
    )
    .get(userId) as { access_token: string } | undefined;
  return row?.access_token ?? null;
}

// --- Extracted Content ---

export interface ExtractedContent {
  title: string | null;
  content: string;
  textContent: string | null;
  excerpt: string | null;
}

export function getExtractedContent(url: string): ExtractedContent | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT title, content, text_content, excerpt FROM extracted_content WHERE url = ?"
    )
    .get(url) as
    | { title: string | null; content: string; text_content: string | null; excerpt: string | null }
    | undefined;
  if (!row) return null;
  return {
    title: row.title,
    content: row.content,
    textContent: row.text_content,
    excerpt: row.excerpt,
  };
}

export function saveExtractedContent(
  url: string,
  data: ExtractedContent
): void {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO extracted_content (url, title, content, text_content, excerpt, extracted_at) VALUES (?, ?, ?, ?, ?, unixepoch())"
  ).run(url, data.title, data.content, data.textContent, data.excerpt);
}

// --- UI Preferences (cache_meta, per-user) ---

export function getPreference(
  key: string,
  userId?: number
): string | null {
  const db = getDb();
  const row = userId
    ? (db
        .prepare(
          "SELECT value FROM cache_meta WHERE key = ? AND user_id = ?"
        )
        .get(key, userId) as { value: string } | undefined)
    : (db
        .prepare(
          "SELECT value FROM cache_meta WHERE key = ? AND user_id IS NULL"
        )
        .get(key) as { value: string } | undefined);
  return row?.value ?? null;
}

export function setPreference(
  key: string,
  value: string,
  userId?: number
): void {
  const db = getDb();
  if (userId) {
    // Delete + insert to handle the composite uniqueness
    db.prepare(
      "DELETE FROM cache_meta WHERE key = ? AND user_id = ?"
    ).run(key, userId);
    db.prepare(
      "INSERT INTO cache_meta (key, value, user_id, updated_at) VALUES (?, ?, ?, unixepoch())"
    ).run(key, value, userId);
  } else {
    db.prepare(
      "INSERT OR REPLACE INTO cache_meta (key, value, updated_at) VALUES (?, ?, unixepoch())"
    ).run(key, value);
  }
}

export function getAllPreferences(
  userId?: number
): Record<string, string> {
  const db = getDb();
  const rows = userId
    ? (db
        .prepare("SELECT key, value FROM cache_meta WHERE user_id = ?")
        .all(userId) as { key: string; value: string }[])
    : (db
        .prepare(
          "SELECT key, value FROM cache_meta WHERE user_id IS NULL"
        )
        .all() as { key: string; value: string }[]);
  const result: Record<string, string> = {};
  for (const r of rows) {
    result[r.key] = r.value;
  }
  return result;
}

// Migrate shared preferences to a user (for first user registration)
export function migratePreferencesToUser(userId: number): void {
  const db = getDb();
  const rows = db
    .prepare("SELECT key, value FROM cache_meta WHERE user_id IS NULL")
    .all() as { key: string; value: string }[];
  for (const r of rows) {
    db.prepare(
      "INSERT OR IGNORE INTO cache_meta (key, value, user_id, updated_at) VALUES (?, ?, ?, unixepoch())"
    ).run(r.key, r.value, userId);
  }
}
