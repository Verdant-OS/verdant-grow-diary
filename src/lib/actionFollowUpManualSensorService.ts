/**
 * actionFollowUpManualSensorService — narrow authenticated read path
 * for the "attach an existing Manual sensor snapshot" step of Action
 * Queue follow-up evidence (Slice 4b).
 *
 * Safety contract:
 *  - Reuses the existing manual-snapshot diary adapter + view model.
 *    No parallel sensor truth implementation.
 *  - SELECT only. No insert / update / upsert / delete / rpc.
 *  - No sensor row mutation. No signed URL persistence. No AI. No
 *    device control. No service_role import.
 *  - Never trusts client-provided user_id — RLS on `diary_entries`
 *    enforces ownership; we defense-in-depth re-apply
 *    `filterManualSensorSnapshotCandidates` client-side.
 *  - Sanitizes raw Supabase errors into a fixed result contract.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultSupabase } from "@/integrations/supabase/client";
import {
  diaryRowsToManualSnapshotRecords,
  type ManualSnapshotDiaryRow,
} from "@/lib/manualSnapshotDiaryAdapter";
import {
  buildManualSnapshotTimelineCard,
  type ManualSnapshotTimelineCard,
} from "@/lib/manualSensorSnapshotViewModel";
import {
  filterManualSensorSnapshotCandidates,
  timelineCardToCandidateInput,
  type ActionFollowUpSensorContext,
} from "@/lib/actionFollowUpManualSensorRules";

export interface LoadManualSensorCandidatesArgs {
  context: ActionFollowUpSensorContext;
  /** Upper bound on how many diary rows we fetch. Defaults to 50. */
  limit?: number;
  /** Optional Supabase client injection for tests. */
  client?: Pick<SupabaseClient, "from">;
}

export type ManualSensorCandidateLoadResult =
  | {
      status: "loaded";
      candidates: ManualSnapshotTimelineCard[];
    }
  | {
      status: "failed";
      reason: "query_failed";
    };

const DEFAULT_LIMIT = 50;

/**
 * Load Manual sensor snapshot candidates for the given follow-up
 * action context. Scopes the query to the action's tent when present;
 * otherwise falls back to no tent scope and lets the pure rules filter
 * the returned rows.
 */
export async function loadManualSensorCandidates(
  args: LoadManualSensorCandidatesArgs,
): Promise<ManualSensorCandidateLoadResult> {
  const { context } = args;
  if (!context || typeof context.growId !== "string" || context.growId.length === 0) {
    return { status: "loaded", candidates: [] };
  }
  const client = args.client ?? defaultSupabase;
  const limit = Math.max(1, Math.min(200, args.limit ?? DEFAULT_LIMIT));

  try {
    // Scope: prefer tent when the action has one — manual snapshots
    // live on diary_entries and always carry tent_id. RLS ensures we
    // only ever see the grower's own rows.
    let q = client
      .from("diary_entries")
      .select("id, plant_id, tent_id, entry_at, note, details")
      .order("entry_at", { ascending: false })
      .limit(limit);
    if (context.tentId) {
      q = q.eq("tent_id", context.tentId);
    }
    const { data, error } = await q;
    if (error) {
      return { status: "failed", reason: "query_failed" };
    }
    const rows = (data ?? []) as ManualSnapshotDiaryRow[];
    const records = diaryRowsToManualSnapshotRecords(rows);
    const cards = records.map(buildManualSnapshotTimelineCard);
    // Defense-in-depth: reapply pure candidate rules so any row that
    // slipped past query scoping (mock, joined table, plant-linked but
    // wrong plant) is still excluded.
    const eligible = filterManualSensorSnapshotCandidates(
      cards.map(timelineCardToCandidateInput),
      context,
    );
    const eligibleIds = new Set(eligible.map((c) => c.id));
    const filteredCards = cards.filter((c) => eligibleIds.has(c.id));
    // Preserve the deterministic sort from the pure rules.
    filteredCards.sort((a, b) => {
      if (a.capturedAt > b.capturedAt) return -1;
      if (a.capturedAt < b.capturedAt) return 1;
      return a.id.localeCompare(b.id);
    });
    return { status: "loaded", candidates: filteredCards };
  } catch {
    return { status: "failed", reason: "query_failed" };
  }
}

/**
 * Read one manual snapshot by its diary_entries id. Returns null when
 * the row is missing, unreadable, or fails safe-display rules. Used
 * by the read-only evidence card to render an associated snapshot.
 */
export async function loadManualSensorSnapshotById(
  snapshotId: string,
  client?: Pick<SupabaseClient, "from">,
): Promise<ManualSnapshotTimelineCard | null> {
  if (typeof snapshotId !== "string" || snapshotId.length === 0) return null;
  const c = client ?? defaultSupabase;
  try {
    const { data, error } = await c
      .from("diary_entries")
      .select("id, plant_id, tent_id, entry_at, note, details")
      .eq("id", snapshotId)
      .limit(1);
    if (error) return null;
    const rows = (data ?? []) as ManualSnapshotDiaryRow[];
    const records = diaryRowsToManualSnapshotRecords(rows);
    if (records.length === 0) return null;
    const card = buildManualSnapshotTimelineCard(records[0]);
    // Never render an invalid reading as healthy.
    if (card.severity === "invalid") return null;
    // Provenance invariant: card.source is the string literal "manual".
    if (card.source !== "manual") return null;
    return card;
  } catch {
    return null;
  }
}
