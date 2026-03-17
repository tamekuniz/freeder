import { getFeedlyTokenFull, setFeedlyTokenWithRefresh } from "./db";

const FEEDLY_BASE_URL = "https://cloud.feedly.com";

// Token is about to expire if less than 5 minutes remain
const TOKEN_REFRESH_BUFFER = 5 * 60;

async function getValidToken(userId: number): Promise<string> {
  const tokenData = getFeedlyTokenFull(userId);
  if (!tokenData) {
    throw new Error("No Feedly token found");
  }

  // Check if token needs refresh
  if (tokenData.refresh_token && tokenData.expires_at) {
    const now = Math.floor(Date.now() / 1000);
    if (now >= tokenData.expires_at - TOKEN_REFRESH_BUFFER) {
      // Token expired or about to expire, refresh it
      const newTokens = await refreshAccessToken(tokenData.refresh_token);
      setFeedlyTokenWithRefresh(
        userId,
        newTokens.access_token,
        newTokens.refresh_token,
        newTokens.expires_in
      );
      return newTokens.access_token;
    }
  }

  return tokenData.access_token;
}

async function feedlyFetch(
  tokenOrUserId: string | number,
  path: string,
  options: RequestInit = {}
) {
  const token =
    typeof tokenOrUserId === "number"
      ? await getValidToken(tokenOrUserId)
      : tokenOrUserId;

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
  tokenOrUserId: string | number
): Promise<FeedlySubscription[]> {
  return feedlyFetch(tokenOrUserId, "/v3/subscriptions");
}

export async function getStream(
  tokenOrUserId: string | number,
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

  return feedlyFetch(tokenOrUserId, `/v3/streams/contents?${params.toString()}`);
}

export async function getUnreadCounts(
  tokenOrUserId: string | number
): Promise<{
  unreadcounts: { id: string; count: number; updated: number }[];
}> {
  return feedlyFetch(tokenOrUserId, "/v3/markers/counts");
}

export async function markAsRead(
  tokenOrUserId: string | number,
  entryIds: string[]
): Promise<void> {
  await feedlyFetch(tokenOrUserId, "/v3/markers", {
    method: "POST",
    body: JSON.stringify({
      action: "markAsRead",
      type: "entries",
      entryIds,
    }),
  });
}

export async function keepUnread(
  tokenOrUserId: string | number,
  entryIds: string[]
): Promise<void> {
  await feedlyFetch(tokenOrUserId, "/v3/markers", {
    method: "POST",
    body: JSON.stringify({
      action: "keepUnread",
      type: "entries",
      entryIds,
    }),
  });
}

export async function starEntry(
  tokenOrUserId: string | number,
  entryId: string
): Promise<void> {
  await feedlyFetch(tokenOrUserId, "/v3/tags/global.saved", {
    method: "PUT",
    body: JSON.stringify({ entryId }),
  });
}

export async function unstarEntry(
  tokenOrUserId: string | number,
  entryId: string
): Promise<void> {
  await feedlyFetch(
    tokenOrUserId,
    `/v3/tags/global.saved/${encodeURIComponent(entryId)}`,
    {
      method: "DELETE",
    }
  );
}

// Validate a token by fetching user profile
export async function validateToken(
  tokenOrUserId: string | number
): Promise<{ valid: boolean; error?: string }> {
  try {
    await feedlyFetch(tokenOrUserId, "/v3/profile");
    return { valid: true };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : "Invalid token",
    };
  }
}

// --- OAuth2 Configuration ---

const FEEDLY_CLIENT_ID = process.env.FEEDLY_CLIENT_ID || "feedlydev";
const FEEDLY_CLIENT_SECRET = process.env.FEEDLY_CLIENT_SECRET || "feedlydev";
const FEEDLY_REDIRECT_URI = process.env.FEEDLY_REDIRECT_URI || "http://localhost:3001/api/auth/feedly/callback";

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  id: string;
}

export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: FEEDLY_CLIENT_ID,
    redirect_uri: FEEDLY_REDIRECT_URI,
    response_type: "code",
    scope: "https://cloud.feedly.com/subscriptions",
    state,
  });
  return `${FEEDLY_BASE_URL}/v3/auth/auth?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(`${FEEDLY_BASE_URL}/v3/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      client_id: FEEDLY_CLIENT_ID,
      client_secret: FEEDLY_CLIENT_SECRET,
      redirect_uri: FEEDLY_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(`${FEEDLY_BASE_URL}/v3/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refresh_token: refreshToken,
      client_id: FEEDLY_CLIENT_ID,
      client_secret: FEEDLY_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }
  return res.json();
}
