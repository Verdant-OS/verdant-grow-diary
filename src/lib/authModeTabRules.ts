/**
 * Auth mode tab rules.
 *
 * Keeps the sign-in/create/forgot tab labels in one typed source of truth so
 * the auth UI can stay responsive on narrow screens without duplicating labels.
 * No I/O. No auth calls. No routing.
 */

export const AUTH_MODES = [
  { value: "signin", label: "Sign in", compact: false },
  { value: "signup", label: "Create account", compact: true },
  { value: "forgot", label: "Forgot password", compact: true },
] as const;

export type AuthMode = (typeof AUTH_MODES)[number]["value"];

/**
 * Visible tabs. "Forgot password" is a mode, not a tab: it opens from the one
 * "Forgot password?" link under the password field (field-notebook walk,
 * 2026-11-19, friction item 12: it appeared twice).
 */
export const AUTH_MODE_TABS = AUTH_MODES.filter((mode) => mode.value !== "forgot");

export const AUTH_TAB_LIST_CLASSNAME = "grid grid-cols-2 w-full h-auto gap-1 p-1 mb-4";

const AUTH_TAB_BASE_CLASSNAME = "min-h-10 px-1.5 py-2 text-center leading-tight whitespace-normal";

export function getAuthTabTriggerClassName(mode: AuthMode): string {
  const tab = AUTH_MODES.find((item) => item.value === mode);
  return tab?.compact
    ? `${AUTH_TAB_BASE_CLASSNAME} text-[10px] sm:text-xs`
    : `${AUTH_TAB_BASE_CLASSNAME} text-xs sm:text-sm`;
}

export function getAuthModeLabel(mode: AuthMode): string {
  return AUTH_MODES.find((tab) => tab.value === mode)?.label ?? "Sign in";
}

// Walkthrough FA-20261119-M1 item 6: the browser tab title follows the form
// that is showing, so the sign-up form is never titled "Sign in". The sign-in
// title stays unchanged because the production preflight pins it.
const AUTH_PAGE_TITLES: Record<AuthMode, string> = {
  signin: "Sign in to Verdant Grow Diary",
  signup: "Create your Verdant Grow Diary account",
  forgot: "Reset your Verdant Grow Diary password",
};

export function getAuthPageTitle(mode: AuthMode): string {
  return AUTH_PAGE_TITLES[mode] ?? AUTH_PAGE_TITLES.signin;
}
