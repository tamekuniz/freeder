import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import { stripHtml } from "./html-strip";

const DB_DIR = process.cwd();
const GLOBAL_DB_PATH = path.join(DB_DIR, "freeder-cache.db");

// --- Global DB (users + extracted_content) ---

let globalDb: Database.Database | null = null;

function getDb(): Database.Database {
  if (!globalDb) {
    globalDb = new Database(GLOBAL_DB_PATH);
    globalDb.pragma("journal_mode = WAL");
    globalDb.pragma("foreign_keys = ON");
    initGlobalTables(globalDb);
  }
  return globalDb;
}

function initGlobalTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
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
}

// --- Per-User DB ---

const userDbMap = new Map<number, Database.Database>();

export function getUserDb(userId: number): Database.Database {
  let db = userDbMap.get(userId);
  if (!db) {
    const dbPath = path.join(DB_DIR, `freeder-user-${userId}.db`);
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initUserTables(db);
    userDbMap.set(userId, db);
  }
  return db;
}

function initUserTables(db: Database.Database) {
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

    CREATE TABLE IF NOT EXISTS user_feedly_tokens (
      user_id INTEGER PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at INTEGER,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS rss_feeds (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      feed_url TEXT NOT NULL,
      title TEXT,
      site_url TEXT,
      category TEXT DEFAULT 'RSS',
      sort_order INTEGER DEFAULT 0,
      last_fetched_at INTEGER,
      poll_interval INTEGER DEFAULT 3600,
      avg_post_interval INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(user_id, feed_url)
    );

    CREATE TABLE IF NOT EXISTS user_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#f97316',
      UNIQUE(name)
    );

    CREATE TABLE IF NOT EXISTS entry_user_tags (
      entry_id TEXT NOT NULL,
      tag_id INTEGER NOT NULL REFERENCES user_tags(id) ON DELETE CASCADE,
      created_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (entry_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS ai_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS entry_ai_tags (
      entry_id TEXT NOT NULL,
      tag_id INTEGER NOT NULL REFERENCES ai_tags(id) ON DELETE CASCADE,
      score REAL DEFAULT 1.0,
      PRIMARY KEY (entry_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_entry_ai_tags_tag ON entry_ai_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_entry_ai_tags_entry ON entry_ai_tags(entry_id);
    CREATE INDEX IF NOT EXISTS idx_entry_user_tags_tag ON entry_user_tags(tag_id);
  `);

  // FTS5 full-text search table for entries (trigram tokenizer for CJK support)
  const ftsExists = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='entries_fts'"
    )
    .get() as { sql: string } | undefined;

  if (ftsExists && !ftsExists.sql.includes("trigram")) {
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

export function cacheSubscriptions(userId: number, subs: unknown[]): void {
  const db = getUserDb(userId);
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

export function getCachedSubscriptions(userId: number): unknown[] | null {
  const db = getUserDb(userId);
  const rows = db
    .prepare("SELECT data FROM subscriptions ORDER BY rowid")
    .all() as { data: string }[];
  if (rows.length === 0) return null;
  return rows.map((r) => JSON.parse(r.data));
}

// --- Entries (per stream) ---

export function cacheEntries(userId: number, streamId: string, entries: unknown[]): void {
  const db = getUserDb(userId);
  const upsert = db.prepare(
    "INSERT OR REPLACE INTO entries (id, stream_id, data, updated_at) VALUES (?, ?, ?, unixepoch())"
  );
  const deleteFts = db.prepare("DELETE FROM entries_fts WHERE entry_id = ?");
  const insertFts = db.prepare(
    "INSERT INTO entries_fts (entry_id, title, content, feed_title) VALUES (?, ?, ?, ?)"
  );

  // Batch-load existing entries to preserve read status and tags (avoids N+1 SELECTs)
  const entryIds = entries.map(e => (e as { id: string }).id);
  const existingMap = new Map<string, { unread?: boolean; tags?: unknown[] }>();
  if (entryIds.length > 0) {
    const placeholders = entryIds.map(() => "?").join(",");
    const rows = db.prepare(`SELECT id, data FROM entries WHERE id IN (${placeholders})`)
      .all(...entryIds) as { id: string; data: string }[];
    for (const row of rows) {
      const old = JSON.parse(row.data);
      existingMap.set(row.id, { unread: old.unread, tags: old.tags });
    }
  }

  const tx = db.transaction(() => {
    for (const entry of entries) {
      const e = entry as {
        id: string;
        title?: string;
        content?: { content: string };
        summary?: { content: string };
        origin?: { title?: string };
      };

      // Preserve read status and tags from existing entry
      const existing = existingMap.get(e.id);
      if (existing) {
        if (existing.unread === false) (entry as Record<string, unknown>).unread = false;
        if (existing.tags?.length) (entry as Record<string, unknown>).tags = existing.tags;
      }

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

export function getCachedEntries(userId: number, streamId: string): unknown[] | null {
  const db = getUserDb(userId);
  const rows = db
    .prepare("SELECT data FROM entries WHERE stream_id = ? ORDER BY rowid")
    .all(streamId) as { data: string }[];
  if (rows.length === 0) return null;
  return rows.map((r) => JSON.parse(r.data));
}

// --- Search ---

export function searchEntries(
  userId: number,
  query: string,
  limit: number = 50,
  streamIds?: string[]
): { id: string; data: string; snippet: string; feedTitle: string }[] {
  const db = getUserDb(userId);
  const trimmed = query.trim();
  if (!trimmed) return [];

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

export function cacheUnreadCounts(userId: number, counts: Record<string, number>): void {
  const db = getUserDb(userId);
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

export function getCachedUnreadCounts(userId: number): Record<string, number> | null {
  const db = getUserDb(userId);
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

export function decrementUnreadCount(userId: number, feedId: string, by: number = 1): void {
  const db = getUserDb(userId);
  db.prepare(
    "UPDATE unread_counts SET count = MAX(0, count - ?), updated_at = unixepoch() WHERE id = ?"
  ).run(by, feedId);
}

export function incrementUnreadCount(userId: number, feedId: string, by: number = 1): void {
  const db = getUserDb(userId);
  db.prepare(
    "UPDATE unread_counts SET count = count + ?, updated_at = unixepoch() WHERE id = ?"
  ).run(by, feedId);
}

// --- Users (global DB) ---

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

export function getUserById(
  id: number
): { id: number; username: string; password_hash: string } | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id, username, password_hash FROM users WHERE id = ?")
    .get(id) as
    | { id: number; username: string; password_hash: string }
    | undefined;
  return row ?? null;
}

export function updateUserPassword(
  userId: number,
  newPasswordHash: string
): void {
  const db = getDb();
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    newPasswordHash,
    userId
  );
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
  const db = getUserDb(userId);
  db.prepare(
    "INSERT OR REPLACE INTO user_feedly_tokens (user_id, access_token, updated_at) VALUES (?, ?, unixepoch())"
  ).run(userId, token);
}

export function getFeedlyToken(userId: number): string | null {
  const db = getUserDb(userId);
  const row = db
    .prepare(
      "SELECT access_token FROM user_feedly_tokens WHERE user_id = ?"
    )
    .get(userId) as { access_token: string } | undefined;
  return row?.access_token ?? null;
}

// --- Extracted Content (global DB — shared URL cache) ---

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

/**
 * Update the FTS index for entries matching the given URL with richer extracted text.
 */
export function updateFtsWithExtractedContent(
  userId: number,
  url: string,
  extractedText: string
): void {
  const db = getUserDb(userId);

  const rows = db
    .prepare("SELECT id, data FROM entries WHERE data LIKE ?")
    .all(`%${url.replace(/%/g, "\\%")}%`) as { id: string; data: string }[];

  const deleteFts = db.prepare("DELETE FROM entries_fts WHERE entry_id = ?");
  const insertFts = db.prepare(
    "INSERT INTO entries_fts (entry_id, title, content, feed_title) VALUES (?, ?, ?, ?)"
  );

  const tx = db.transaction(() => {
    for (const row of rows) {
      const entry = JSON.parse(row.data);
      const alternates = entry.alternate as { href: string }[] | undefined;
      if (!alternates?.some((a: { href: string }) => a.href === url)) continue;

      const title = entry.title || "";
      const feedTitle = entry.origin?.title || "";
      deleteFts.run(row.id);
      insertFts.run(row.id, title, extractedText, feedTitle);
    }
  });
  tx();
}

// --- UI Preferences (cache_meta, per-user DB) ---

export function getPreference(
  key: string,
  userId?: number
): string | null {
  if (userId == null) return null;
  const db = getUserDb(userId);
  const row = db
    .prepare("SELECT value FROM cache_meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setPreference(
  key: string,
  value: string,
  userId?: number
): void {
  if (userId == null) return;
  const db = getUserDb(userId);
  db.prepare(
    "INSERT OR REPLACE INTO cache_meta (key, value, updated_at) VALUES (?, ?, unixepoch())"
  ).run(key, value);
}

export function getAllPreferences(
  userId?: number
): Record<string, string> {
  if (userId == null) return {};
  const db = getUserDb(userId);
  const result: Record<string, string> = {};
  const rows = db
    .prepare("SELECT key, value FROM cache_meta")
    .all() as { key: string; value: string }[];
  for (const r of rows) {
    result[r.key] = r.value;
  }
  return result;
}

// --- Feedly Tokens (full, with refresh) ---

export interface FeedlyTokenFull {
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
}

export function getFeedlyTokenFull(userId: number): FeedlyTokenFull | null {
  const db = getUserDb(userId);
  return db.prepare("SELECT access_token, refresh_token, expires_at FROM user_feedly_tokens WHERE user_id = ?").get(userId) as FeedlyTokenFull | null;
}

export function setFeedlyTokenWithRefresh(userId: number, accessToken: string, refreshToken: string | null, expiresIn: number | null): void {
  const db = getUserDb(userId);
  const expiresAt = expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null;
  db.prepare(
    `INSERT INTO user_feedly_tokens (user_id, access_token, refresh_token, expires_at, updated_at)
     VALUES (?, ?, ?, ?, unixepoch())
     ON CONFLICT(user_id) DO UPDATE SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = unixepoch()`
  ).run(userId, accessToken, refreshToken, expiresAt, accessToken, refreshToken, expiresAt);
}

// Migrate shared preferences to a user (no-op now, kept for API compatibility)
export function migratePreferencesToUser(_userId: number): void {
  // With per-user DBs, preferences are already isolated — nothing to migrate
}

// --- RSS Feeds ---

export interface RssFeed {
  id: string;
  user_id: number;
  feed_url: string;
  title: string | null;
  site_url: string | null;
  category: string;
  last_fetched_at: number | null;
  poll_interval: number;
  avg_post_interval: number | null;
  created_at: number;
}

function rssFeedId(feedUrl: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(feedUrl)
    .digest("hex")
    .slice(0, 12);
  return `rss:${hash}`;
}

export function addRssFeed(
  userId: number,
  feedUrl: string,
  title: string,
  siteUrl?: string,
  category?: string
): string {
  const db = getUserDb(userId);
  const id = rssFeedId(feedUrl);
  db.prepare(
    `INSERT OR REPLACE INTO rss_feeds (id, user_id, feed_url, title, site_url, category)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId, feedUrl, title, siteUrl || null, category || "RSS");
  return id;
}

export function getRssFeeds(userId: number): (RssFeed & { unread_count: number })[] {
  const db = getUserDb(userId);
  return db
    .prepare(
      `SELECT rf.*, COALESCE(uc.count, 0) as unread_count
       FROM rss_feeds rf
       LEFT JOIN unread_counts uc ON uc.id = rf.id
       WHERE rf.user_id = ?
       ORDER BY rf.sort_order, rf.created_at`
    )
    .all(userId) as (RssFeed & { unread_count: number })[];
}

export function deleteRssFeed(userId: number, feedId: string): boolean {
  const db = getUserDb(userId);
  const result = db
    .prepare("DELETE FROM rss_feeds WHERE id = ? AND user_id = ?")
    .run(feedId, userId);
  return result.changes > 0;
}

export function updateRssFeedMeta(
  userId: number,
  feedId: string,
  opts: { title?: string; category?: string; pollInterval?: number; avgPostInterval?: number }
): void {
  const db = getUserDb(userId);
  const sets: string[] = [];
  const params: unknown[] = [];

  if (opts.title !== undefined) {
    sets.push("title = ?");
    params.push(opts.title);
  }
  if (opts.category !== undefined) {
    sets.push("category = ?");
    params.push(opts.category);
  }
  if (opts.pollInterval !== undefined) {
    sets.push("poll_interval = ?");
    params.push(opts.pollInterval);
  }
  if (opts.avgPostInterval !== undefined) {
    sets.push("avg_post_interval = ?");
    params.push(opts.avgPostInterval);
  }

  if (sets.length === 0) return;

  params.push(feedId);
  db.prepare(`UPDATE rss_feeds SET ${sets.join(", ")} WHERE id = ?`).run(
    ...params
  );
}

export function updateRssFeedLastFetched(userId: number, feedId: string): void {
  const db = getUserDb(userId);
  db.prepare(
    "UPDATE rss_feeds SET last_fetched_at = unixepoch() WHERE id = ?"
  ).run(feedId);
}

// --- Entry Data Patch ---

function patchEntryData(userId: number, entryId: string, mutate: (entry: Record<string, unknown>) => void): void {
  const db = getUserDb(userId);
  const row = db.prepare("SELECT data FROM entries WHERE id = ?")
    .get(entryId) as { data: string } | undefined;
  if (!row) return;
  const entry = JSON.parse(row.data);
  mutate(entry);
  db.prepare("UPDATE entries SET data = ?, updated_at = unixepoch() WHERE id = ?")
    .run(JSON.stringify(entry), entryId);
}

export function setEntryReadStatus(userId: number, entryIds: string[], unread: boolean): void {
  const db = getUserDb(userId);
  const tx = db.transaction(() => {
    for (const entryId of entryIds) {
      patchEntryData(userId, entryId, (entry) => { entry.unread = unread; });
    }
  });
  tx();
}

export function setEntryStarred(userId: number, entryId: string, starred: boolean): void {
  const savedTag = { id: "user/global.saved", label: "Saved" };
  patchEntryData(userId, entryId, (entry) => {
    const tags = (entry.tags || []) as { id: string }[];
    if (starred) {
      if (!tags.some(t => t.id.includes("global.saved"))) {
        entry.tags = [...tags, savedTag];
      }
    } else {
      entry.tags = tags.filter(t => !t.id.includes("global.saved"));
    }
  });
}

export function updateFeedOrder(userId: number, feedId: string, sortOrder: number, category?: string): void {
  const db = getUserDb(userId);
  if (category !== undefined) {
    db.prepare("UPDATE rss_feeds SET sort_order = ?, category = ? WHERE id = ?").run(sortOrder, category, feedId);
  } else {
    db.prepare("UPDATE rss_feeds SET sort_order = ? WHERE id = ?").run(sortOrder, feedId);
  }
}

export function batchUpdateFeedOrder(userId: number, updates: Array<{ feedId: string; sortOrder: number; category?: string }>): void {
  const db = getUserDb(userId);
  const stmtWithCat = db.prepare("UPDATE rss_feeds SET sort_order = ?, category = ? WHERE id = ?");
  const stmtNoCat = db.prepare("UPDATE rss_feeds SET sort_order = ? WHERE id = ?");
  const transaction = db.transaction(() => {
    for (const u of updates) {
      if (u.category !== undefined) {
        stmtWithCat.run(u.sortOrder, u.category, u.feedId);
      } else {
        stmtNoCat.run(u.sortOrder, u.feedId);
      }
    }
  });
  transaction();
}

export function getRssFeedById(userId: number, feedId: string): RssFeed | null {
  const db = getUserDb(userId);
  const row = db
    .prepare("SELECT * FROM rss_feeds WHERE id = ?")
    .get(feedId) as RssFeed | undefined;
  return row ?? null;
}

// --- User Tags ---

export function createUserTag(
  userId: number,
  name: string,
  color?: string
): { id: number; name: string; color: string } {
  const db = getUserDb(userId);
  const result = db
    .prepare("INSERT INTO user_tags (name, color) VALUES (?, ?)")
    .run(name, color || "#f97316");
  return {
    id: Number(result.lastInsertRowid),
    name,
    color: color || "#f97316",
  };
}

export function deleteUserTag(userId: number, tagId: number): void {
  const db = getUserDb(userId);
  db.prepare("DELETE FROM user_tags WHERE id = ?").run(tagId);
}

export function getUserTags(
  userId: number
): { id: number; name: string; color: string }[] {
  const db = getUserDb(userId);
  return db
    .prepare("SELECT id, name, color FROM user_tags ORDER BY name")
    .all() as { id: number; name: string; color: string }[];
}

export function addUserTagToEntry(
  userId: number,
  entryId: string,
  tagId: number
): void {
  const db = getUserDb(userId);
  db.prepare(
    "INSERT OR IGNORE INTO entry_user_tags (entry_id, tag_id) VALUES (?, ?)"
  ).run(entryId, tagId);
}

export function removeUserTagFromEntry(
  userId: number,
  entryId: string,
  tagId: number
): void {
  const db = getUserDb(userId);
  db.prepare(
    "DELETE FROM entry_user_tags WHERE entry_id = ? AND tag_id = ?"
  ).run(entryId, tagId);
}

export function getEntryUserTags(
  userId: number,
  entryId: string
): { id: number; name: string; color: string }[] {
  const db = getUserDb(userId);
  return db
    .prepare(
      `SELECT t.id, t.name, t.color
       FROM user_tags t
       JOIN entry_user_tags et ON et.tag_id = t.id
       WHERE et.entry_id = ?
       ORDER BY t.name`
    )
    .all(entryId) as { id: number; name: string; color: string }[];
}

export function getEntriesByUserTag(
  userId: number,
  tagId: number,
  limit: number = 100
): unknown[] {
  const db = getUserDb(userId);
  const rows = db
    .prepare(
      `SELECT e.data
       FROM entries e
       JOIN entry_user_tags et ON et.entry_id = e.id
       WHERE et.tag_id = ?
       ORDER BY et.created_at DESC
       LIMIT ?`
    )
    .all(tagId, limit) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data));
}

// --- AI Tags ---

export function getOrCreateAiTag(userId: number, name: string): number {
  const db = getUserDb(userId);
  const existing = db
    .prepare("SELECT id FROM ai_tags WHERE name = ?")
    .get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db
    .prepare("INSERT INTO ai_tags (name) VALUES (?)")
    .run(name);
  return Number(result.lastInsertRowid);
}

export function setEntryAiTags(
  userId: number,
  entryId: string,
  tagNames: string[]
): void {
  const db = getUserDb(userId);
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM entry_ai_tags WHERE entry_id = ?").run(entryId);
    const insert = db.prepare(
      "INSERT OR IGNORE INTO entry_ai_tags (entry_id, tag_id) VALUES (?, ?)"
    );
    for (const name of tagNames) {
      const tagId = getOrCreateAiTag(userId, name);
      insert.run(entryId, tagId);
    }
  });
  tx();
}

export function getEntryAiTags(
  userId: number,
  entryId: string
): { id: number; name: string }[] {
  const db = getUserDb(userId);
  return db
    .prepare(
      `SELECT t.id, t.name
       FROM ai_tags t
       JOIN entry_ai_tags et ON et.tag_id = t.id
       WHERE et.entry_id = ?
       ORDER BY t.name`
    )
    .all(entryId) as { id: number; name: string }[];
}

export function getEntriesWithoutAiTags(
  userId: number,
  limit: number = 50
): { id: string; data: string }[] {
  const db = getUserDb(userId);
  return db
    .prepare(
      `SELECT e.id, e.data
       FROM entries e
       LEFT JOIN entry_ai_tags eat ON eat.entry_id = e.id
       WHERE eat.entry_id IS NULL
       LIMIT ?`
    )
    .all(limit) as { id: string; data: string }[];
}

// --- Lookalike (similar entries by shared AI tags) ---

export function findLookalikes(
  userId: number,
  entryId: string,
  minCommon: number = 2,
  limit: number = 20
): { entry: unknown; commonTags: number }[] {
  const db = getUserDb(userId);
  const rows = db
    .prepare(
      `SELECT e.data, COUNT(*) as common_count
       FROM entry_ai_tags a1
       JOIN entry_ai_tags a2 ON a1.tag_id = a2.tag_id
       JOIN entries e ON e.id = a2.entry_id
       WHERE a1.entry_id = ? AND a2.entry_id != ?
       GROUP BY a2.entry_id
       HAVING common_count >= ?
       ORDER BY common_count DESC
       LIMIT ?`
    )
    .all(entryId, entryId, minCommon, limit) as {
    data: string;
    common_count: number;
  }[];
  return rows.map((r) => ({
    entry: JSON.parse(r.data),
    commonTags: r.common_count,
  }));
}
