export const BROWSER_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
  "Accept-Language": "ja,en;q=0.9",
};

export function fetchAsBot(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: "follow",
    ...init,
  });
}
