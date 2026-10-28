/**
 * Document titles for signed-in app routes that never opted into usePageSeo.
 * Title only — no canonical, Open Graph, or robots tags (#2004, #1770).
 */
export const APP_DOCUMENT_TITLE_BRAND = "Verdant Grow Diary";

const EXACT_LABELS: Record<string, string> = {
  "/plants": "Plants",
  "/tents": "Tents",
  "/grows": "Grows",
  "/alerts": "Alerts",
  "/actions": "Actions",
  "/daily-check": "Daily Check",
  "/doctor": "AI Doctor",
  "/settings": "Settings",
  "/reports": "Reports",
  "/timeline": "Timeline",
  "/sensors": "Sensors",
  "/account/preferences": "Preferences",
};

export function appDocumentTitleForPath(pathname: string): string | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const exact = EXACT_LABELS[path];
  if (exact) return `${exact} | ${APP_DOCUMENT_TITLE_BRAND}`;
  if (/^\/plants\/[^/]+$/.test(path)) return `Plant | ${APP_DOCUMENT_TITLE_BRAND}`;
  if (/^\/tents\/[^/]+$/.test(path)) return `Tent | ${APP_DOCUMENT_TITLE_BRAND}`;
  if (/^\/grows\/[^/]+$/.test(path)) return `Grow | ${APP_DOCUMENT_TITLE_BRAND}`;
  return null;
}

export function appLayoutDocumentHead(matches: ReadonlyArray<{ pathname?: string }>): {
  meta: Array<{ title: string }>;
} {
  let pathname = "";
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = matches[index]?.pathname;
    if (candidate) {
      pathname = candidate;
      break;
    }
  }
  const title = appDocumentTitleForPath(pathname);
  return title ? { meta: [{ title }] } : { meta: [] };
}
