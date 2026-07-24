import { describe, expect, it, vi } from "vitest";
import {
  insertPaddleEventLog,
  type PaddleEventLogRow,
} from "../../supabase/functions/payments-webhook/eventLogInsert";

const ROW: PaddleEventLogRow = {
  paddle_event_id: "evt_1",
  event_type: "subscription.canceled",
  environment: "sandbox",
  user_id: "deleted-user",
  paddle_subscription_id: "sub_1",
  paddle_transaction_id: null,
  price_external_id: null,
  product_external_id: null,
  processing_status: "received",
  processed_ok: false,
  skip_reason: null,
  last_error: null,
  payload: { event_type: "subscription.canceled" },
};

describe("Paddle event log after account deletion", () => {
  it("retries a stale user foreign key once with only the user link cleared", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "23503", message: "fk" } })
      .mockResolvedValueOnce({ error: null });

    await expect(insertPaddleEventLog(ROW, insert)).resolves.toEqual({ ok: true });
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1][0]).toEqual({ ...ROW, user_id: null });
  });

  it("does not retry unrelated insert failures", async () => {
    const insert = vi.fn(async () => ({
      error: { code: "42501", message: "denied" },
    }));
    await expect(insertPaddleEventLog(ROW, insert)).resolves.toEqual({
      ok: false,
      error: "denied",
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("still recognizes duplicate delivery after the stale-user retry", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "23503", message: "fk" } })
      .mockResolvedValueOnce({ error: { code: "23505", message: "duplicate" } });
    await expect(insertPaddleEventLog(ROW, insert)).resolves.toEqual({
      ok: true,
      duplicate: true,
    });
  });

  it("never retries an FK failure when no user link was supplied", async () => {
    const insert = vi.fn(async () => ({ error: { code: "23503", message: "fk" } }));
    await expect(insertPaddleEventLog({ ...ROW, user_id: null }, insert)).resolves.toEqual({
      ok: false,
      error: "fk",
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
