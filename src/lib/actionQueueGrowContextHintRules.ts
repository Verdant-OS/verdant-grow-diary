/**
 * Pure helper for the Action Queue grow context hint (AUD-008).
 *
 * Action Queue rows are scoped to a single grow when an effective grow id
 * is resolved (URL `?growId=` takes precedence over the workspace's
 * active grow). When no grow is selected, the page shows actions across
 * all grows the user can see — which can be confusing if the workspace
 * has multiple grows.
 *
 * This helper produces a deterministic banner state describing:
 *
 *   - which grow's actions are visible (or "all grows")
 *   - whether the scope came from the URL (?growId=) or the workspace
 *     active grow
 *   - whether a non-blocking helper hint should be shown to point the
 *     user at the grow switcher / URL filter
 *
 * Pure rules only. No I/O, no React, no Supabase, no schema, no RLS,
 * no Action Queue behavior changes.
 */

export type ActionQueueGrowContextKind =
  | "scoped_via_url"
  | "scoped_via_active_grow"
  | "all_grows_single"
  | "all_grows_multi"
  | "no_grows";

export interface ActionQueueGrowContextHint {
  kind: ActionQueueGrowContextKind;
  /** Primary banner line, always set. */
  message: string;
  /** Optional helper hint shown below the primary line. */
  helper: string | null;
  /** Resolved grow name when the queue is scoped, else null. */
  growName: string | null;
  /** True when actions are filtered to a single grow. */
  isScoped: boolean;
}

interface MinimalGrow {
  id: string;
  name?: string | null;
}

export interface BuildActionQueueGrowContextHintOptions {
  /** URL `?growId=` if present and resolvable, else null. */
  urlGrowId: string | null;
  /** Workspace active grow id, else null. */
  activeGrowId: string | null;
  /** Active grow name (if known) — used when urlGrowId is null. */
  activeGrowName: string | null;
  /** Scoped grow name resolved from URL (if known). */
  scopedGrowName: string | null;
  /** All grows the user can see (RLS-scoped). */
  grows: ReadonlyArray<MinimalGrow>;
}

/**
 * Build the grow-context hint for the Action Queue header. The hint never
 * changes which actions are loaded — it only describes the current scope
 * and, when useful, points the user at the grow switcher.
 */
export function buildActionQueueGrowContextHint(
  opts: BuildActionQueueGrowContextHintOptions,
): ActionQueueGrowContextHint {
  const { urlGrowId, activeGrowId, activeGrowName, scopedGrowName, grows } = opts;
  const growsCount = grows.length;

  if (urlGrowId) {
    const name = scopedGrowName ?? lookupGrowName(grows, urlGrowId) ?? "this grow";
    return {
      kind: "scoped_via_url",
      message: `Showing actions for ${name}.`,
      helper:
        growsCount > 1
          ? "Filtered by the grow in the URL. Clear the filter to see actions across all your grows."
          : null,
      growName: name,
      isScoped: true,
    };
  }

  if (activeGrowId) {
    const name = activeGrowName ?? lookupGrowName(grows, activeGrowId) ?? "your active grow";
    return {
      kind: "scoped_via_active_grow",
      message: `Showing actions for ${name} (your active grow).`,
      helper:
        growsCount > 1
          ? "Switch your active grow from the grow switcher to see another grow's actions."
          : null,
      growName: name,
      isScoped: true,
    };
  }

  if (growsCount === 0) {
    return {
      kind: "no_grows",
      message: "No grows yet.",
      helper: "Create a grow to start receiving action suggestions.",
      growName: null,
      isScoped: false,
    };
  }

  if (growsCount === 1) {
    return {
      kind: "all_grows_single",
      message: "Showing actions across your grow.",
      helper: null,
      growName: null,
      isScoped: false,
    };
  }

  return {
    kind: "all_grows_multi",
    message: `Showing actions across all ${growsCount} grows.`,
    helper:
      "Pick a grow from the grow switcher to focus the queue on one grow at a time.",
    growName: null,
    isScoped: false,
  };
}

function lookupGrowName(
  grows: ReadonlyArray<MinimalGrow>,
  id: string,
): string | null {
  const g = grows.find((x) => x.id === id);
  return (g?.name ?? null) || null;
}
