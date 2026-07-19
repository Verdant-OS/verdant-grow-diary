/**
 * useFoundersWall — presentation-only public read of the Founders Wall.
 *
 * Reads the SECURITY DEFINER view `founders_wall_public` which exposes
 * exactly three columns (founder_number, public_display_name,
 * optional_link) and resolves the display name server-side per style.
 * Anon and authenticated both have SELECT on the view; anon has NO
 * SELECT on the base `founders` table, so raw display names never cross
 * the wire for `number_only` / `hidden` rows.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FoundersWallRow {
  founder_number: number;
  public_display_name: string | null;
  optional_link: string | null;
}

export interface FoundersWallState {
  status: "loading" | "ready" | "error";
  rows: ReadonlyArray<FoundersWallRow>;
  error: string | null;
}

const INITIAL: FoundersWallState = { status: "loading", rows: [], error: null };

export function useFoundersWall(): FoundersWallState {
  const [state, setState] = useState<FoundersWallState>(INITIAL);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        // Untyped select — the view was added post-types-regeneration and
        // is intentionally not in the generated types (public read view,
        // three columns, no PII). Runtime shape is enforced below.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("founders_wall_public" as any)
        .select("founder_number, public_display_name, optional_link")
        .order("founder_number", { ascending: true });
      if (cancelled || !mountedRef.current) return;
      if (error) {
        setState({ status: "error", rows: [], error: error.message });
        return;
      }
      const rows = ((data ?? []) as unknown as FoundersWallRow[]).filter(
        (r) => typeof r.founder_number === "number" && Number.isInteger(r.founder_number),
      );
      setState({ status: "ready", rows, error: null });
    })();
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  return state;
}
