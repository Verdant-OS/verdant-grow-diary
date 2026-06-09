/**
 * Auth mode tab rules.
 *
 * Keeps the sign-in/create/forgot tab labels in one typed source of truth so
 * the auth UI can stay responsive on narrow screens without duplicating labels.
 * No I/O. No auth calls. No routing.
 */

export const AUTH_MODE_TABS = [
  { value: "signin", label: "Sign in" },
  { value: "signup", label: "Create account" },
  { value: "forgot", label: "Forgot password" },
] as const;

export type AuthMode = (typeof AUTH_MODE_TABS)[number]["value"];

export const AUTH_TAB_LIST_CLASSNAME = "grid grid-cols-3 w-full h-auto gap-1 p-1 mb-4";

export const AUTH_TAB_TRIGGER_CLASSNAME =
  "min-h-10 px-1.5 py-2 text-center text-[11px] leading-tight whitespace-normal sm:text-xs";

export function getAuthModeLabel(mode: AuthMode): string {
  return AUTH_MODE_TABS.find((tab) => tab.value === mode)?.label ?? "Sign in";
}
