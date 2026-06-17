export function normalizeComparableUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function browserUrlsMatch(requestedUrl: string, tabUrl: string) {
  const requested = normalizeComparableUrl(requestedUrl);
  const existing = normalizeComparableUrl(tabUrl);
  return requested !== null && existing !== null && requested === existing;
}
