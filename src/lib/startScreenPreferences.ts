/**
 * startScreenPreferences — local-only per-user start-screen preference.
 *
 * Safety:
 *  - No schema change. No backend write.
 *  - Never stores tokens, sessions, hashes, emails, or grow data.
 *  - Stores only an opaque enum value scoped to the user id.
 *  - Always validates the stored value before returning.
 *  - Fails open (returns null) when localStorage is unavailable.
 *
 * Keys: `verdant:startScreen:<userId>`.
 */
import { sanitizeAuthRedirect } from "@/lib/authRedirectRules";

export type StartScreenChoice =
  | "quickLog"
  | "timeline"
  | "dashboard"
  | "onboarding"
  | "welcome";

export const DEFAULT_START_SCREEN: StartScreenChoice = "quickLog";

export const START_SCREEN_OPTIONS: ReadonlyArray<{
  key: StartScreenChoice;
  label: string;
  description: string;
  recommended?: boolean;
}> = [
  {
    key: "quickLog",
    label: "Quick Log",
    description: "Diary-first. Recommended — Verdant works best when logs come first, then sensors, then AI.",
    recommended: true,
  },
  { key: "timeline", label: "Timeline", description: "Open the diary timeline first." },
  { key: "dashboard", label: "Dashboard", description: "Open the main dashboard first." },
  { key: "onboarding", label: "Onboarding", description: "Re-open the onboarding walkthrough." },
  { key: "welcome", label: "Welcome", description: "Open the welcome / landing page." },
];

// Internal routes only. All values must pass sanitizeAuthRedirect.
const ROUTE_FOR: Record<StartScreenChoice, string> = {
  quickLog: "/",
  timeline: "/timeline",
  dashboard: "/",
  onboarding: "/onboarding",
  welcome: "/welcome",
};

export function routeForStartScreen(choice: StartScreenChoice): string {
  const r = ROUTE_FOR[choice] ?? "/";
  return sanitizeAuthRedirect(r, "/");
}

function storageKey(userId: string): string | null {
  if (!userId || typeof userId !== "string") return null;
  if (!/^[A-Za-z0-9_\-:.]{1,128}$/.test(userId)) return null;
  return `verdant:startScreen:${userId}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function isValid(value: unknown): value is StartScreenChoice {
  return (
    value === "quickLog" ||
    value === "timeline" ||
    value === "dashboard" ||
    value === "onboarding" ||
    value === "welcome"
  );
}

export function getStartScreenChoice(userId: string): StartScreenChoice | null {
  const key = storageKey(userId);
  const s = safeStorage();
  if (!key || !s) return null;
  try {
    const v = s.getItem(key);
    return isValid(v) ? v : null;
  } catch {
    return null;
  }
}

// Same as get, but always returns a usable choice (falls back to diary-first).
export function getStartScreenChoiceOrDefault(userId: string): StartScreenChoice {
  return getStartScreenChoice(userId) ?? DEFAULT_START_SCREEN;
}

export function setStartScreenChoice(userId: string, choice: StartScreenChoice): void {
  const key = storageKey(userId);
  const s = safeStorage();
  if (!key || !s || !isValid(choice)) return;
  try {
    s.setItem(key, choice);
  } catch {
    /* fail open */
  }
}

export function clearStartScreenChoice(userId: string): void {
  const key = storageKey(userId);
  const s = safeStorage();
  if (!key || !s) return;
  try {
    s.removeItem(key);
  } catch {
    /* ignore */
  }
}
