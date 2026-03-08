const FEEDLY_BASE_URL = "https://cloud.feedly.com";

function getAccessToken(): string {
  const token = process.env.FEEDLY_ACCESS_TOKEN;
  if (!token || token === "your_feedly_access_token_here") {
    throw new Error("FEEDLY_ACCESS_TOKEN is not configured");
  }
  return token;
}

async function feedlyFetch(path: string, options: RequestInit = {}) {
  const token = getAccessToken();
  const res = await fetch(`${FEEDLY_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Feedly API error ${res.status}: ${text}`);
  }

  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

export interface FeedlySubscription {
  id: string;
  title: string;
  website?: string;
  categories: { id: string; label: string }[];
}

export interface FeedlyEntry {
  id: string;
  title: string;
  published: number;
  crawled: number;
  author?: string;
  summary?: { content: string };
  content?: { content: string };
  alternate?: { href: string; type: string }[];
  origin?: { title: string; streamId: string; htmlUrl?: string };
  unread: boolean;
  tags?: { id: string; label?: string }[];
}

export interface FeedlyStream {
  id: string;
  title?: string;
  items: FeedlyEntry[];
  continuation?: string;
}

export async function getSubscriptions(): Promise<FeedlySubscription[]> {
  return feedlyFetch("/v3/subscriptions");
}

export async function getStream(
  streamId: string,
  options: {
    count?: number;
    unreadOnly?: boolean;
    continuation?: string;
  } = {}
): Promise<FeedlyStream> {
  const params = new URLSearchParams();
  params.set("streamId", streamId);
  if (options.count) params.set("count", String(options.count));
  if (options.unreadOnly) params.set("unreadOnly", "true");
  if (options.continuation) params.set("continuation", options.continuation);

  return feedlyFetch(`/v3/streams/contents?${params.toString()}`);
}

export async function getUnreadCounts(): Promise<{
  unreadcounts: { id: string; count: number; updated: number }[];
}> {
  return feedlyFetch("/v3/markers/counts");
}

export async function markAsRead(entryIds: string[]): Promise<void> {
  await feedlyFetch("/v3/markers", {
    method: "POST",
    body: JSON.stringify({
      action: "markAsRead",
      type: "entries",
      entryIds,
    }),
  });
}

export async function keepUnread(entryIds: string[]): Promise<void> {
  await feedlyFetch("/v3/markers", {
    method: "POST",
    body: JSON.stringify({
      action: "keepUnread",
      type: "entries",
      entryIds,
    }),
  });
}

export async function starEntry(entryId: string): Promise<void> {
  await feedlyFetch("/v3/tags/global.saved", {
    method: "PUT",
    body: JSON.stringify({ entryId }),
  });
}

export async function unstarEntry(entryId: string): Promise<void> {
  await feedlyFetch(`/v3/tags/global.saved/${encodeURIComponent(entryId)}`, {
    method: "DELETE",
  });
}
