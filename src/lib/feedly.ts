const FEEDLY_BASE_URL = "https://cloud.feedly.com";

async function feedlyFetch(
  token: string,
  path: string,
  options: RequestInit = {}
) {
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

export async function getSubscriptions(
  token: string
): Promise<FeedlySubscription[]> {
  return feedlyFetch(token, "/v3/subscriptions");
}

export async function getStream(
  token: string,
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

  return feedlyFetch(token, `/v3/streams/contents?${params.toString()}`);
}

export async function getUnreadCounts(
  token: string
): Promise<{
  unreadcounts: { id: string; count: number; updated: number }[];
}> {
  return feedlyFetch(token, "/v3/markers/counts");
}

export async function markAsRead(
  token: string,
  entryIds: string[]
): Promise<void> {
  await feedlyFetch(token, "/v3/markers", {
    method: "POST",
    body: JSON.stringify({
      action: "markAsRead",
      type: "entries",
      entryIds,
    }),
  });
}

export async function keepUnread(
  token: string,
  entryIds: string[]
): Promise<void> {
  await feedlyFetch(token, "/v3/markers", {
    method: "POST",
    body: JSON.stringify({
      action: "keepUnread",
      type: "entries",
      entryIds,
    }),
  });
}

export async function starEntry(
  token: string,
  entryId: string
): Promise<void> {
  await feedlyFetch(token, "/v3/tags/global.saved", {
    method: "PUT",
    body: JSON.stringify({ entryId }),
  });
}

export async function unstarEntry(
  token: string,
  entryId: string
): Promise<void> {
  await feedlyFetch(
    token,
    `/v3/tags/global.saved/${encodeURIComponent(entryId)}`,
    {
      method: "DELETE",
    }
  );
}

// Validate a token by fetching user profile
export async function validateToken(
  token: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    await feedlyFetch(token, "/v3/profile");
    return { valid: true };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : "Invalid token",
    };
  }
}
