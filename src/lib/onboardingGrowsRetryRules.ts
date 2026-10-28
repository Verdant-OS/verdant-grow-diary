/**
 * Onboarding "Try again" after a failed grows read. A missing provider
 * `refresh` must not make the button a silent no-op, so it falls back to a
 * full reload (the same recovery RootErrorBoundary offers).
 */
export function retryOnboardingGrowsRead(
  refresh: (() => unknown) | null | undefined,
  reload: () => void,
): "refresh" | "reload" {
  if (typeof refresh === "function") {
    void refresh();
    return "refresh";
  }
  reload();
  return "reload";
}
