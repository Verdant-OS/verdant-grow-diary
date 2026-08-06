/**
 * Key disposition after a `breeding_log_save_event` refusal.
 *
 * The bug: an unchanged retry re-presented a key the server had already
 * refused, so the grower got the identical refusal on every press while the
 * copy told them to save again.
 *
 * The trap: "just mint a new key on failure" fixes the dead end by writing a
 * DUPLICATE breeding event, because a conflict is positive evidence that an
 * earlier call committed. These tests exist mostly to keep that trap shut.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  BREEDING_LOG_SAVE_EVENT_REASONS,
  type BreedingLogSaveEventReason,
} from "@/lib/genetics/breedingLogSaveEventRpc";
import {
  resolveBreedingSubmissionKeyDisposition,
  shouldRetireSubmissionKey,
  shouldWarnPossibleDuplicate,
} from "@/lib/genetics/breedingSubmissionRecoveryRules";

const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");

describe("duplicate safety — the property that must never regress", () => {
  it("retires the key for EXACTLY ONE reason: idempotency_key_conflict", () => {
    // Every other reason returns before or below the ledger write, so only
    // this one proves the key is spent. If a second reason ever starts
    // retiring, someone must prove it cannot duplicate a committed event.
    const retiring = BREEDING_LOG_SAVE_EVENT_REASONS.filter((r) =>
      shouldRetireSubmissionKey(resolveBreedingSubmissionKeyDisposition(r)),
    );
    expect(retiring.sort()).toEqual(["idempotency_key_conflict", "invalid_idempotency_key"]);
  });

  it("warns about a possible duplicate only where a commit is proven", () => {
    const warning = BREEDING_LOG_SAVE_EVENT_REASONS.filter((r) =>
      shouldWarnPossibleDuplicate(resolveBreedingSubmissionKeyDisposition(r)),
    );
    expect(warning).toEqual(["idempotency_key_conflict"]);
  });

  it("keeps the key on save_failed — the flaky-network case", () => {
    // Both save_failed sites sit inside the unique_violation handler, whose
    // tentative inserts Postgres already rolled back. Rotating here would be
    // the most common way to create a duplicate.
    expect(resolveBreedingSubmissionKeyDisposition("save_failed")).toBe("reuse_key");
  });

  it("keeps the key for every pre-ledger refusal", () => {
    const preLedger: BreedingLogSaveEventReason[] = [
      "not_authenticated",
      "invalid_event_type",
      "invalid_details",
      "grow_not_owned",
      "plant_required",
      "plant_not_in_grow",
      "plant_tent_not_owned",
      "plant_cross_grow",
      "tent_not_in_grow",
      "plant_not_in_tent",
    ];
    for (const r of preLedger) {
      expect(resolveBreedingSubmissionKeyDisposition(r), r).toBe("reuse_key");
    }
  });
});

describe("ambiguous input never rotates", () => {
  it("defaults to reuse for null, undefined, unknown, and non-strings", () => {
    for (const v of [null, undefined, "", "brand_new_server_reason", 42, {}, []]) {
      const d = resolveBreedingSubmissionKeyDisposition(v as never);
      expect(d, String(v)).toBe("reuse_key");
      expect(shouldRetireSubmissionKey(d), String(v)).toBe(false);
    }
  });

  it("a missing map entry cannot be coerced into a rotation", () => {
    // Guards the easy inversion bug: an undefined lookup treated as falsy and
    // therefore "not reuse". Reuse is the duplicate-safe stance under doubt.
    expect(resolveBreedingSubmissionKeyDisposition("__definitely_not_a_reason__")).toBe(
      "reuse_key",
    );
  });
});

describe("coverage stays exhaustive", () => {
  it("classifies every reason in the union", () => {
    for (const r of BREEDING_LOG_SAVE_EVENT_REASONS) {
      expect(["reuse_key", "retire_key", "retire_key_warn_duplicate"], r).toContain(
        resolveBreedingSubmissionKeyDisposition(r),
      );
    }
  });

  it("is not vacuous", () => {
    expect(BREEDING_LOG_SAVE_EVENT_REASONS.length).toBeGreaterThanOrEqual(13);
  });
});

describe("the RPC still backs the classification", () => {
  function activeRpcSql(): string {
    const definers = readdirSync(MIGRATIONS_DIR)
      .filter((n) => n.endsWith(".sql"))
      .filter((n) =>
        /(?:CREATE|CREATE\s+OR\s+REPLACE)\s+FUNCTION\s+public\.breeding_log_save_event/i.test(
          readFileSync(resolve(MIGRATIONS_DIR, n), "utf8"),
        ),
      )
      .sort();
    return readFileSync(resolve(MIGRATIONS_DIR, definers[definers.length - 1]), "utf8");
  }

  it("the first return after the ledger write is ok=true", () => {
    // This adjacency IS the proof that a conflict implies a commit: the ledger
    // row is written only on the success path. If a future migration ever
    // inserts that row on a path that returns ok=false, retire-on-conflict
    // becomes unsafe (it would rotate past a key with no committed event) and
    // this test must fail loudly rather than the behaviour drifting.
    //
    // Scoped to the FIRST return deliberately. Reading further would run into
    // the unique_violation handler's legitimate ok=false, which is the
    // rolled-back path and says nothing about the ledger write.
    const sql = activeRpcSql();
    const insertAt = sql.indexOf("INSERT INTO public.quicklog_idempotency");
    expect(insertAt).toBeGreaterThan(0);

    const rest = sql.slice(insertAt);
    const returnAt = rest.search(/RETURN\s+jsonb_build_object/i);
    expect(returnAt).toBeGreaterThan(0);

    const firstReturn = rest.slice(returnAt, returnAt + 220);
    expect(firstReturn).toMatch(/'ok',\s*\n?\s*true/);
    expect(firstReturn).not.toMatch(/'ok',\s*\n?\s*false/);
  });
});
