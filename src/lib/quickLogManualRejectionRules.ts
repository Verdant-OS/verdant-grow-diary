/**
 * One list of quicklog_save_manual reasons that prove the write did not commit.
 * not_authenticated and invalid_idempotency_key return before the key lookup.
 * Every other reason here is reached only when that key has no row.
 */
export const DEFINITIVE_MANUAL_REJECTIONS = [
  "not_authenticated",
  "invalid_idempotency_key",
  "invalid_target_type",
  "missing_target_id",
  "unsupported_action",
  "invalid_volume",
  "invalid_details",
  "invalid_logged_at",
  "target_not_owned",
  "grow_not_owned",
  "plant_tent_grow_mismatch",
] as const;

const PRE_KEY_LOOKUP_REJECTIONS = ["not_authenticated", "invalid_idempotency_key"] as const;

export const POST_KEY_LOOKUP_NO_ROW_REASONS = DEFINITIVE_MANUAL_REJECTIONS.filter(
  (reason) => !(PRE_KEY_LOOKUP_REJECTIONS as readonly string[]).includes(reason),
);

export function definitiveRejectionProvesNoRow(reason: string): boolean {
  return (POST_KEY_LOOKUP_NO_ROW_REASONS as readonly string[]).includes(reason);
}
