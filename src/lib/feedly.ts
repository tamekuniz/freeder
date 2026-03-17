// Type definitions for Feedly-compatible data structures.
// These are used by the RSS engine to maintain compatibility.

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

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  id: string;
}
