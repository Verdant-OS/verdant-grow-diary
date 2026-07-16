export type RootEntrySurface = "loading" | "landing" | "dashboard";

export interface RootEntryState {
  authLoading: boolean;
  hasAuthenticatedUser: boolean;
}

/**
 * Selects the apex surface without reading user data or performing navigation.
 * The public landing page is the fail-closed signed-out state; private dashboard
 * content is only selected after AuthProvider resolves an authenticated user.
 */
export function resolveRootEntrySurface(state: RootEntryState): RootEntrySurface {
  if (state.authLoading) return "loading";
  return state.hasAuthenticatedUser ? "dashboard" : "landing";
}
