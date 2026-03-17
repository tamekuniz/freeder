import { fetchAsBot } from "@/lib/fetch-utils";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export interface ExtractResult {
  title: string | null;
  content: string;
  textContent: string | null;
  excerpt: string | null;
}

/**
 * Decode response body with correct encoding.
 * Detects charset from HTTP header and HTML meta tags.
 */
async function decodeResponse(res: Response): Promise<string> {
  const buf = await res.arrayBuffer();

  // 1. Check Content-Type header for charset
  const ct = res.headers.get("content-type") || "";
  const headerMatch = ct.match(/charset=([^\s;]+)/i);
  if (headerMatch) {
    const charset = headerMatch[1].replace(/['"]/g, "");
    try {
      return new TextDecoder(charset).decode(buf);
    } catch {
      // Unknown charset, fall through
    }
  }

  // 2. Peek at first bytes for <meta charset>
  const peek = new TextDecoder("ascii").decode(buf.slice(0, 4096));
  const metaMatch =
    peek.match(/<meta\s+charset=["']?([^"'\s>]+)/i) ||
    peek.match(/<meta\s+http-equiv=["']?Content-Type["']?\s+content=["'][^"']*charset=([^"'\s;]+)/i);
  if (metaMatch) {
    const charset = metaMatch[1].trim();
    try {
      return new TextDecoder(charset).decode(buf);
    } catch {
      // Unknown charset, fall through
    }
  }

  return new TextDecoder("utf-8").decode(buf);
}

// Allowed tags for cleaned HTML
const ALLOWED_TAGS = new Set([
  "p", "br", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "blockquote", "pre", "code",
  "strong", "b", "em", "i", "a", "img",
  "figure", "figcaption", "picture", "source",
  "table", "thead", "tbody", "tr", "th", "td",
  "div", "span", "section", "article",
]);

function cleanArticleHtml(html: string): string {
  const { document: doc } = parseHTML(`<div>${html}</div>`);
  const root = doc.querySelector("div")!;

  // Remove unwanted elements
  const removeSelectors = [
    "nav", "header", "footer", "aside",
    "script", "style", "iframe", "form",
    "[class*='share']", "[class*='social']",
    "[class*='comment']", "[class*='related']",
    "[class*='recommend']", "[class*='sidebar']",
    "[class*='ad-']", "[class*='ads']",
    "[class*='newsletter']", "[class*='subscribe']",
    "[id*='share']", "[id*='social']",
    "[id*='comment']", "[id*='related']",
  ];
  for (const sel of removeSelectors) {
    try {
      for (const el of root.querySelectorAll(sel)) {
        el.remove();
      }
    } catch { /* skip invalid selectors */ }
  }

  // Strip disallowed tags but keep their text content
  function walk(node: Node) {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === 1) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          while (el.firstChild) {
            node.insertBefore(el.firstChild, el);
          }
          el.remove();
        } else {
          const attrs = Array.from(el.attributes || []);
          for (const attr of attrs) {
            const name = attr.name.toLowerCase();
            if (tag === "a" && (name === "href" || name === "title")) continue;
            if (tag === "img" && (name === "src" || name === "alt" || name === "width" || name === "height" || name === "srcset")) continue;
            if (tag === "source" && (name === "srcset" || name === "type" || name === "media")) continue;
            if (tag === "td" && (name === "colspan" || name === "rowspan")) continue;
            if (tag === "th" && (name === "colspan" || name === "rowspan")) continue;
            el.removeAttribute(attr.name);
          }
          walk(el);
        }
      }
    }
  }
  walk(root);

  return root.innerHTML;
}

/**
 * Extract full article text from a URL.
 * Returns null on failure (fail-open).
 */
export async function extractArticle(url: string): Promise<ExtractResult | null> {
  try {
    const res = await fetchAsBot(url);
    if (!res.ok) return null;

    const html = await decodeResponse(res);
    const { document } = parseHTML(html);

    const reader = new Readability(document);
    const article = reader.parse();
    if (!article) return null;

    return {
      title: article.title || null,
      content: cleanArticleHtml(article.content || ""),
      textContent: article.textContent || null,
      excerpt: article.excerpt || null,
    };
  } catch {
    return null; // fail-open
  }
}
