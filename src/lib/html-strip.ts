/**
 * Strip HTML tags and decode common entities for FTS indexing.
 * No external dependencies required.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "") // Remove script blocks
    .replace(/<style[\s\S]*?<\/style>/gi, "") // Remove style blocks
    .replace(/<[^>]+>/g, " ") // Remove all HTML tags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&[#\w]+;/gi, " ") // Remove remaining entities
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}
