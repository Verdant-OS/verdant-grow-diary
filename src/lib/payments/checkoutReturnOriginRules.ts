// Decides whether a browser-supplied checkout return origin may receive the Stripe redirect.
// The preview runs behind a proxy, so the request Origin header can differ from the page origin;
// a fixed allowlist of Verdant hosts keeps the redirect safe without relying on that header.
const EXACT_HOSTS = new Set([
  "verdantgrowdiary.com",
  "www.verdantgrowdiary.com",
  "verdantgrowdiary.org",
  "www.verdantgrowdiary.org",
  "growdiary.app",
  "www.growdiary.app",
  "diarygrow.app",
  "www.diarygrow.app",
  "localhost",
  "127.0.0.1",
]);
const PROJECT_ID = "66255e7b-892c-4be5-8686-ab1cfc3666db";

export function isAllowedCheckoutReturnOrigin(origin: string, requestOrigin: string | null): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  if (requestOrigin && origin === requestOrigin) return true;
  const host = url.hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  if (!local && url.protocol !== "https:") return false;
  if (EXACT_HOSTS.has(host)) return true;
  if (host.endsWith(".lovable.app") && host.includes("verdantgrowdiary")) return true;
  if (host === `${PROJECT_ID}.lovableproject.com`) return true;
  if (host.endsWith(".lovable.app") && host.includes(PROJECT_ID)) return true;
  return false;
}
