/**
 * DB guards in supabase/functions/stripe-webhook/index.ts.
 *
 * @source-scan-justified: the guards are query-builder calls inside the Deno
 * serve handler. They are not exported values, so a resolved-module assertion
 * cannot see them. This file parses those calls and applies the same
 * predicates to an in-memory row. Removing `.neq("status","canceled")`,
 * `.eq("user_id", ...)`, or `ignoreDuplicates` from the handler makes the
 * matching scenario restore Pro, and the expectation fails.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8");

interface Row {
  environment: string;
  stripe_subscription_id: string;
  user_id: string;
  status: string;
  plan_key: string;
}

function sliceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) return "";
  return source.slice(from, to);
}

function guardsFromSource(source: string) {
  const update = sliceBetween(source, "updateRowUnlessCanceled", "insertRowIfAbsent");
  const insert = sliceBetween(source, "insertRowIfAbsent", "log:");
  return {
    updateSkipsCanceled: update.includes('.neq("status", "canceled")'),
    updateMatchesUser: update.includes('.eq("user_id", row.user_id)'),
    insertIgnoresDuplicates: insert.includes("ignoreDuplicates: true"),
  };
}

function applyUpdate(
  existing: Row,
  incoming: Row,
  guards: ReturnType<typeof guardsFromSource>,
): Row {
  if (existing.environment !== incoming.environment) return existing;
  if (existing.stripe_subscription_id !== incoming.stripe_subscription_id) return existing;
  if (guards.updateMatchesUser && existing.user_id !== incoming.user_id) return existing;
  if (guards.updateSkipsCanceled && existing.status === "canceled") return existing;
  return {
    ...existing,
    status: incoming.status,
    plan_key: incoming.plan_key,
    user_id: incoming.user_id,
  };
}

function applyInsert(
  existing: Row | null,
  incoming: Row,
  guards: ReturnType<typeof guardsFromSource>,
): Row {
  if (existing && guards.insertIgnoresDuplicates) return existing;
  return incoming;
}

const canceled: Row = {
  environment: "live",
  stripe_subscription_id: "sub_1",
  user_id: "user-a",
  status: "canceled",
  plan_key: "pro_monthly",
};

describe("stripe-webhook DB guards", () => {
  const guards = guardsFromSource(SOURCE);

  it("reads all three guards from the webhook handler", () => {
    expect(guards).toEqual({
      updateSkipsCanceled: true,
      updateMatchesUser: true,
      insertIgnoresDuplicates: true,
    });
  });

  it("does not let an older active delivery restore Pro after a cancel", () => {
    const olderActive: Row = { ...canceled, status: "active" };
    const afterUpdate = applyUpdate(canceled, olderActive, guards);
    const afterInsert = applyInsert(afterUpdate, olderActive, guards);
    expect(afterInsert.status).toBe("canceled");
    expect(afterInsert.plan_key).toBe("pro_monthly");
  });

  it("does not let another user's delivery rewrite the row", () => {
    const otherUser: Row = { ...canceled, user_id: "user-b", status: "active" };
    expect(applyUpdate(canceled, otherUser, guards).user_id).toBe("user-a");
    expect(applyUpdate(canceled, otherUser, guards).status).toBe("canceled");
  });

  it("does not let an insert of an older snapshot replace a canceled row", () => {
    const olderActive: Row = { ...canceled, status: "active" };
    expect(applyInsert(canceled, olderActive, guards).status).toBe("canceled");
  });
});
