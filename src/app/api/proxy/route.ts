import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  try {
    const parsed = new URL(url);
    const origin = parsed.origin;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "ja,en;q=0.9",
      },
      redirect: "follow",
    });

    const contentType = res.headers.get("content-type") || "text/html";
    let body: Buffer | string = Buffer.from(await res.arrayBuffer());

    // For HTML responses, inject <base> tag and fetch/XHR override script
    if (contentType.includes("text/html")) {
      let html = body.toString("utf-8");

      // Script to override fetch/XHR so relative URLs resolve to original domain
      const overrideScript = `<script>
(function(){
  var _origin = ${JSON.stringify(origin)};
  var _baseUrl = ${JSON.stringify(url)};

  // Resolve relative URL against original domain
  function resolveUrl(input) {
    if (!input || typeof input !== 'string') return input;
    if (input.startsWith('http://') || input.startsWith('https://') || input.startsWith('//')) return input;
    if (input.startsWith('/')) return _origin + input;
    // relative path
    var base = _baseUrl.substring(0, _baseUrl.lastIndexOf('/') + 1);
    return base + input;
  }

  // Override fetch
  var _fetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string') {
      input = resolveUrl(input);
    } else if (input instanceof Request) {
      input = new Request(resolveUrl(input.url), input);
    }
    return _fetch.call(this, input, init);
  };

  // Override XMLHttpRequest.open
  var _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, xhrUrl) {
    arguments[1] = resolveUrl(xhrUrl);
    return _xhrOpen.apply(this, arguments);
  };
})();
</script>`;

      const baseTag = `<base href="${url}">`;
      const injection = baseTag + overrideScript;

      // Insert after <head> tag (case-insensitive)
      const headMatch = html.match(/<head[^>]*>/i);
      if (headMatch) {
        html = html.replace(headMatch[0], headMatch[0] + injection);
      } else {
        html = injection + html;
      }

      // Fix lazy-loaded images: convert data-src/data-lazy-src/data-original to src
      // Many sites use JS-based lazy loading that won't work without allow-scripts
      html = html.replace(
        /<img\s([^>]*?)>/gi,
        (match, attrs: string) => {
          // Find lazy-load src from common attributes
          const lazySrcMatch = attrs.match(
            /(?:data-src|data-lazy-src|data-original|data-lazy)\s*=\s*["']([^"']+)["']/i
          );
          if (lazySrcMatch) {
            const lazySrc = lazySrcMatch[1];
            // Check if img already has a real src (not a placeholder)
            const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
            const currentSrc = srcMatch ? srcMatch[1] : "";
            const isPlaceholder =
              !currentSrc ||
              currentSrc.includes("data:") ||
              currentSrc.includes("blank.") ||
              currentSrc.includes("placeholder") ||
              currentSrc.includes("grey.") ||
              currentSrc.includes("loading") ||
              currentSrc.length < 10;

            if (isPlaceholder) {
              // Replace src with the lazy-load source
              if (srcMatch) {
                attrs = attrs.replace(
                  /\bsrc\s*=\s*["'][^"']*["']/i,
                  `src="${lazySrc}"`
                );
              } else {
                attrs = `src="${lazySrc}" ` + attrs;
              }
            }
          }
          return `<img ${attrs}>`;
        }
      );

      // Extract images from <noscript> tags (many lazy-load libraries put real imgs there)
      html = html.replace(
        /<noscript>\s*(<img\s[^>]*>)\s*<\/noscript>/gi,
        (_, imgTag: string) => imgTag
      );

      body = html;
    }

    return new NextResponse(body, {
      status: res.status,
      headers: {
        "Content-Type": contentType,
        "X-Frame-Options": "ALLOWALL",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Proxy fetch failed" },
      { status: 502 }
    );
  }
}
