import { useSearchParams } from "react-router-dom";
import { useGrows } from "@/store/grows";
import { growDetailPath } from "@/lib/routes";
import type { Grow } from "@/store/grows";

/**
 * Shared hook for resolving the optional `?growId=` URL param against the
 * user's RLS-loaded grows.
 *
 * Returns:
 *  - urlGrowId: raw value from the URL (or null if absent)
 *  - scopedGrow: the matching Grow row, or null when the param is missing /
 *    does not map to a grow the user owns
 *  - scopedGrowName: convenience accessor for scopedGrow?.name (null fallback)
 *  - isValidScopedGrow: true when a urlGrowId is present AND maps to a loaded grow
 *  - backHref: `/grows/:growId` only when scopedGrow exists; undefined otherwise
 *
 * Read-only. No writes, no device control, no privileged access.
 */
export function useScopedGrow(): {
  urlGrowId: string | null;
  scopedGrow: Grow | null;
  scopedGrowName: string | null;
  isValidScopedGrow: boolean;
  backHref: string | undefined;
} {
  const [searchParams] = useSearchParams();
  const { grows } = useGrows();
  const urlGrowId = searchParams.get("growId");
  const scopedGrow = urlGrowId ? grows.find((g) => g.id === urlGrowId) ?? null : null;
  return {
    urlGrowId,
    scopedGrow,
    scopedGrowName: scopedGrow?.name ?? null,
    isValidScopedGrow: !!urlGrowId && !!scopedGrow,
    backHref: scopedGrow ? growDetailPath(scopedGrow.id) : undefined,
  };
}

export default useScopedGrow;
