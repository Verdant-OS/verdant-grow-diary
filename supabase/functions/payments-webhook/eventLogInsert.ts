/**
 * Durable Paddle event insert with one account-deletion compatibility path.
 *
 * A Paddle event may arrive after its Verdant Auth user was deleted. The
 * audit table's nullable user_id FK should not make that legitimate provider
 * event retry forever, so a user_id FK violation is retried once with the
 * audit link cleared. The raw provider payload remains available for billing
 * reconciliation.
 */

export interface PaddleEventLogRow {
  paddle_event_id: string;
  event_type: string;
  environment: string;
  user_id: string | null;
  paddle_subscription_id: string | null;
  paddle_transaction_id: string | null;
  price_external_id: string | null;
  product_external_id: string | null;
  processing_status: "received";
  processed_ok: false;
  skip_reason: null;
  last_error: null;
  payload: unknown;
}

export interface DbInsertError {
  code?: string;
  message: string;
}

export type InsertEventLogResult = { ok: true; duplicate?: boolean } | { ok: false; error: string };

export async function insertPaddleEventLog(
  row: PaddleEventLogRow,
  insert: (candidate: PaddleEventLogRow) => Promise<{ error: DbInsertError | null }>,
): Promise<InsertEventLogResult> {
  let result = await insert(row);

  // 23503 = foreign_key_violation. lovable_paddle_events has a single FK:
  // nullable user_id -> auth.users. Retry only when a user link was present.
  if (result.error?.code === "23503" && row.user_id !== null) {
    result = await insert({ ...row, user_id: null });
  }

  if (!result.error) return { ok: true };
  // 23505 = unique_violation on paddle_event_id -> duplicate delivery.
  if (result.error.code === "23505") return { ok: true, duplicate: true };
  return { ok: false, error: result.error.message };
}
