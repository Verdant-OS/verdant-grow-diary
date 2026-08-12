/**
 * writeQuickLogPlantEntry — the sanctioned write path for the PlantQuickLog
 * (Plant Detail Gate 1) diary entry.
 *
 * Companion to writeQuickLogPhotoAttachment. The two are deliberately separate
 * writers because they persist different events: this one writes the primary
 * Quick Log row (`details.event_type: "quick_log"`, optional
 * `manual_sensor_snapshot`, optional photo), while the photo-attachment writer
 * writes a photo-only companion row for Quick Log v2. Merging them would
 * silently change either row's shape.
 *
 * The row itself is still built by the existing pure helper
 * `buildQuickLogInsertDraft` in src/lib/quickLogRules.ts — this module adds
 * only the I/O half, so the component holds no table access.
 *
 * Note: src/lib/db.ts#insertDiaryEntryRow is NOT used here. That helper throws
 * via `fail()` and does a select-after-insert; Quick Log needs a bare insert
 * with a non-blocking result contract so a failed save surfaces inline.
 *
 * Rules:
 *   - Row ownership stays with RLS: the draft never carries the owner column;
 *     the table default derives it from the auth context.
 *   - Only a `diary_entries` insert. No updates/deletes/upserts, no other
 *     tables, no RPCs, no edge functions.
 *   - No alerts, Action Queue rows, or model sessions.
 *   - The client is injectable so tests can stub the boundary without a
 *     network layer.
 *
 * Returns:
 *   - { ok: true } on success.
 *   - { ok: false, reason, detail } otherwise. `reason` is a short stable code
 *     the caller maps to operator copy; `detail` carries the raw driver
 *     message for logging only and is never intended for display.
 */

import { supabase as defaultSupabase } from "@/integrations/supabase/client";
import {
  buildQuickLogInsertDraft,
  type BuildQuickLogInsertArgs,
  type QuickLogInsertDraft,
} from "@/lib/quickLogRules";

// Minimal client surface we depend on, so tests can inject a stub without
// dragging the full Supabase generic in.
export interface QuickLogPlantEntryClient {
  from: (table: "diary_entries") => {
    insert: (row: QuickLogInsertDraft) => PromiseLike<{ error: { message?: string } | null }>;
  };
}

export type WriteQuickLogPlantEntryReason = "invalid_draft" | "insert_error" | "unexpected_error";

export type WriteQuickLogPlantEntryResult =
  | { ok: true }
  | {
      ok: false;
      reason: WriteQuickLogPlantEntryReason;
      /** Raw driver/validation detail for logging. Never shown to operators. */
      detail: string | null;
    };

export interface WriteQuickLogPlantEntryOptions {
  /** Optional injectable client for tests. Defaults to the app's Supabase
   * authenticated client. */
  client?: QuickLogPlantEntryClient;
}

export async function writeQuickLogPlantEntry(
  input: BuildQuickLogInsertArgs,
  options: WriteQuickLogPlantEntryOptions = {},
): Promise<WriteQuickLogPlantEntryResult> {
  const built = buildQuickLogInsertDraft(input);
  if (built.ok !== true) {
    return { ok: false, reason: "invalid_draft", detail: built.reason };
  }

  const client: QuickLogPlantEntryClient =
    options.client ?? (defaultSupabase as unknown as QuickLogPlantEntryClient);

  let response: { error: { message?: string } | null };
  try {
    response = await client.from("diary_entries").insert(built.draft);
  } catch (err) {
    return {
      ok: false,
      reason: "unexpected_error",
      detail: err instanceof Error ? err.message : null,
    };
  }

  if (response.error) {
    return {
      ok: false,
      reason: "insert_error",
      detail: response.error.message ?? null,
    };
  }
  return { ok: true };
}
