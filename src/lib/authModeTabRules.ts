/**
 * Auth mode tab rules.
 *
 * Keeps the sign-in/create/forgot tab labels in one typed source of truth so
 * the auth UI can stay responsive on narrow screens without duplicating labels.
 * No I/O. No auth calls. No routing.
 */

export const AUTH_MODE_TABS = [
  { value: "signin", label: "Sign in", compact: false },
  { value: "signup", label: "Create account", compact: true },
  { value: "forgot", label: "Forgot password", compact: true },
] as const;

export type AuthMode = (typeof AUTH_MODE_TABS)[number]["value"];

export const AUTH_TAB_LIST_CLASSNAME = "grid grid-cols-3 w-full h-auto gap-1 p-1 mb-4";

const AUTH_TAB_BASE_CLASSNAME =
  "min-h-10 px-1.5 py-2 text-center leading-tight whitespace-normal";

export function getAuthTabTriggerClassName(mode: AuthMode): string {
  const tab = AUTH_MODE_TABS.find((item) => item.value === mode);
  return tab?.compact
    ? `${AUTH_TAB_BASE_CLASSNAME} text-[10px] sm:text-xs`
    : `${AUTH_TAB_BASE_CLASSNAME} text-xs sm:text-sm`;
}

export function getAuthModeLabel(mode: AuthMode): string {
  return AUTH_MODE_TABS.find((tab) => tab.value === mode)?.label ?? "Sign in";
}
