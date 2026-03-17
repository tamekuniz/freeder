import Parser from "rss-parser";
import crypto from "crypto";
import { fetchAsBot } from "./fetch-utils";
import { FeedlyEntry } from "./feedly";

// --- Types ---

export interface OPMLFeed {
  title: string;
  feedUrl: string;
  siteUrl?: string;
  category?: string;
}

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  creator?: string;
  author?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  isoDate?: string;
}

const RSS_ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.1";

// --- Helpers ---

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// --- Core Functions ---

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; Freeder/1.0; +https://github.com/freeder)",
    Accept: RSS_ACCEPT,
  },
});

/**
 * Fetch and parse an RSS/Atom feed from a URL.
 */
export async function fetchAndParseFeed(
  feedUrl: string
): Promise<{ title: string; siteUrl: string; items: RssItem[] }> {
  const res = await fetchAsBot(feedUrl, {
    headers: {
      Accept: RSS_ACCEPT,
    },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch feed ${feedUrl}: ${res.status} ${res.statusText}`
    );
  }

  const xml = await res.text();
  const feed = await parser.parseString(xml);

  return {
    title: feed.title || feedUrl,
    siteUrl: feed.link || "",
    items: feed.items as RssItem[],
  };
}

/**
 * Convert rss-parser items into FeedlyEntry-compatible objects.
 */
export function convertToFeedlyEntries(
  feedId: string,
  items: RssItem[],
  feedTitle: string,
  siteUrl: string
): FeedlyEntry[] {
  return items.map((item) => {
    const identifier = item.link || item.guid || item.title || "";
    const id = `rss:entry:${sha256(identifier)}`;

    const published = item.isoDate
      ? new Date(item.isoDate).getTime()
      : item.pubDate
        ? new Date(item.pubDate).getTime()
        : Date.now();

    return {
      id,
      title: item.title || "(no title)",
      published,
      crawled: Date.now(),
      author: item.creator || item.author,
      summary: { content: item.contentSnippet || item.content || "" },
      content: { content: item.content || item.contentSnippet || "" },
      alternate: item.link
        ? [{ href: item.link, type: "text/html" }]
        : [],
      origin: {
        title: feedTitle,
        streamId: feedId,
        htmlUrl: siteUrl,
      },
      unread: true,
    } as FeedlyEntry;
  });
}

/**
 * Parse an OPML XML string into a list of feed entries.
 * Uses regex-based parsing (no DOMParser in Node.js).
 */
export function parseOPML(opmlXml: string): OPMLFeed[] {
  const feeds: OPMLFeed[] = [];

  // Match <outline> elements that have xmlUrl (these are actual feeds)
  // Handle both self-closing and non-self-closing tags
  const outlineRegex = /<outline\s[^>]*xmlUrl\s*=\s*"([^"]*)"[^>]*\/?>/gi;

  let match: RegExpExecArray | null;
  while ((match = outlineRegex.exec(opmlXml)) !== null) {
    const tag = match[0];

    const xmlUrl = extractAttr(tag, "xmlUrl");
    if (!xmlUrl) continue;

    const title =
      extractAttr(tag, "title") ||
      extractAttr(tag, "text") ||
      xmlUrl;
    const htmlUrl = extractAttr(tag, "htmlUrl");

    // Try to find the category from the parent <outline> element
    const category = findParentCategory(opmlXml, match.index);

    feeds.push({
      title,
      feedUrl: xmlUrl,
      siteUrl: htmlUrl || undefined,
      category: category || undefined,
    });
  }

  return feeds;
}

function extractAttr(tag: string, attr: string): string | null {
  const regex = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i");
  const m = regex.exec(tag);
  return m ? decodeXmlEntities(m[1]) : null;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function findParentCategory(
  opmlXml: string,
  childIndex: number
): string | null {
  // Look backward from the child position for an <outline> without xmlUrl (category outline)
  const before = opmlXml.substring(0, childIndex);
  const categoryRegex =
    /<outline\s[^>]*(?:text|title)\s*=\s*"([^"]*)"[^>]*>/gi;

  let lastCategory: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = categoryRegex.exec(before)) !== null) {
    const tag = m[0];
    // A category outline does NOT have xmlUrl
    if (!/xmlUrl/i.test(tag)) {
      lastCategory = extractAttr(tag, "text") || extractAttr(tag, "title");
    }
  }

  return lastCategory;
}

/**
 * Discover RSS/Atom feed URL from an HTML page by looking for
 * <link rel="alternate" type="application/rss+xml"> or similar tags.
 */
export async function discoverFeedUrl(
  pageUrl: string
): Promise<string | null> {
  const res = await fetchAsBot(pageUrl);
  if (!res.ok) return null;

  const html = await res.text();

  // Match <link> tags with rel="alternate" and RSS/Atom type
  const linkRegex =
    /<link\s[^>]*rel\s*=\s*["']alternate["'][^>]*>/gi;

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];

    const type = extractAttr(tag, "type");
    if (
      !type ||
      !(
        type.includes("rss") ||
        type.includes("atom") ||
        type.includes("xml")
      )
    ) {
      continue;
    }

    const href = extractAttr(tag, "href");
    if (!href) continue;

    // Resolve relative URLs
    try {
      return new URL(href, pageUrl).href;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Advanced feed discovery: tries common feed paths if the basic
 * discovery from <link> tags fails.
 */
export async function discoverFeedUrlAdvanced(
  pageUrl: string
): Promise<string | null> {
  // First try the standard <link> tag approach
  const discovered = await discoverFeedUrl(pageUrl);
  if (discovered) return discovered;

  // Try common feed paths
  const commonPaths = [
    "/feed",
    "/rss",
    "/atom.xml",
    "/feed.xml",
    "/rss.xml",
    "/index.xml",
  ];

  let baseUrl: URL;
  try {
    baseUrl = new URL(pageUrl);
  } catch {
    return null;
  }

  for (const p of commonPaths) {
    const candidateUrl = new URL(p, baseUrl.origin).href;
    try {
      const res = await fetchAsBot(candidateUrl, {
        headers: {
          Accept: RSS_ACCEPT,
        },
      });

      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") || "";
      const body = await res.text();

      // Check if the response looks like an RSS/Atom feed
      if (
        contentType.includes("xml") ||
        contentType.includes("rss") ||
        contentType.includes("atom") ||
        body.trimStart().startsWith("<?xml") ||
        body.includes("<rss") ||
        body.includes("<feed")
      ) {
        return candidateUrl;
      }
    } catch {
      // Network error — skip this path
      continue;
    }
  }

  return null;
}

/**
 * URLを受け取り、RSSフィードを解決する。
 * 1. 直接RSSフィードとしてパース試行
 * 2. HTMLからlink tagで検出
 * 3. common pathsで検出
 */
export async function resolveRssFeed(url: string): Promise<{
  feedUrl: string;
  title: string | null;
  siteUrl: string | null;
}> {
  // Step 1: Try to parse URL directly as an RSS feed
  try {
    const parsed = await fetchAndParseFeed(url);
    return { feedUrl: url, title: parsed.title, siteUrl: parsed.siteUrl || null };
  } catch {
    // Not a direct feed — continue to discovery
  }

  // Step 2: Discover via <link> tags in HTML
  const discovered = await discoverFeedUrl(url);
  if (discovered) {
    try {
      const parsed = await fetchAndParseFeed(discovered);
      return { feedUrl: discovered, title: parsed.title, siteUrl: parsed.siteUrl || null };
    } catch {
      // Found a link but couldn't parse it — continue
    }
  }

  // Step 3: Try common feed paths
  const discoveredAdvanced = await discoverFeedUrlAdvanced(url);
  if (discoveredAdvanced) {
    try {
      const parsed = await fetchAndParseFeed(discoveredAdvanced);
      return { feedUrl: discoveredAdvanced, title: parsed.title, siteUrl: parsed.siteUrl || null };
    } catch {
      // Found a candidate but couldn't parse it
    }
  }

  throw new Error(`Could not find RSS feed for: ${url}`);
}
