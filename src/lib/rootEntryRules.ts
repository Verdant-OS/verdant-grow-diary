export type RootEntrySurface = "loading" | "landing" | "dashboard";

/**
 * Public, session-free surface shared by the server render and the first
 * client render. Authenticated routing starts only after hydration.
 */
export const ROOT_ENTRY_PRE_HYDRATION_SURFACE: RootEntrySurface = "landing";

export interface RootEntryState {
  authLoading: boolean;
  hasAuthenticatedUser: boolean;
}

/**
 * Automatic acquisition analytics are valid only after auth has conclusively
 * resolved to signed out. SSR and auth-loading renders stay measurable only
 * as page responses; they must not count an authenticated visit as acquisition.
 */
export function shouldTrackRootLandingPageView(state: RootEntryState): boolean {
  return !state.authLoading && !state.hasAuthenticatedUser;
}

/**
 * Selects the apex surface without reading user data or performing navigation.
 * The public landing page is the fail-closed signed-out state; private dashboard
 * content is only selected after AuthProvider resolves an authenticated user.
 */
export function resolveRootEntrySurface(state: RootEntryState): RootEntrySurface {
  // Keep the server-rendered acquisition content visible while session restore
  // is pending. Private dashboard content still requires a resolved user.
  if (state.authLoading) return "landing";
  return state.hasAuthenticatedUser ? "dashboard" : "landing";
}
