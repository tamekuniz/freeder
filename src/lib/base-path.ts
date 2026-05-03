export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof input === "string" && input.startsWith("/")) {
    return fetch(`${BASE_PATH}${input}`, init);
  }
  return fetch(input, init);
}
