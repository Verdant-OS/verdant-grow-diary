/**
 * Shared committed-location selector for the react-router compat layer.
 *
 * During a pending TanStack navigation, `state.location` is already the
 * in-flight TARGET while the previous page is still mounted. React-router
 * semantics require a rendered page to keep seeing the location it was
 * rendered for, so every compat hook (production AND the Vitest override)
 * must read through this one rule — never duplicate the condition inline.
 */
export interface RouterStateLike<L> {
  status: string;
  location: L;
  resolvedLocation?: L | null;
}

export function selectCommittedLocation<L>(state: RouterStateLike<L>): L {
  return state.status === "pending" && state.resolvedLocation
    ? state.resolvedLocation
    : state.location;
}
