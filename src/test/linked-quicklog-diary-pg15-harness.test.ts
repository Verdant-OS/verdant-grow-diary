import { describe, expect, it } from "vitest";
import { disposableConnection } from "../../scripts/run-linked-quicklog-diary-pg15-harness.mjs";
import { runLinkedDiaryHarness } from "../../scripts/run-linked-quicklog-diary-pg15-harness.mjs";

describe("linked Quick Log diary PG15 target guard", () => {
  it("accepts only the exact disposable loopback database", () => {
    expect(
      disposableConnection(
        "postgresql://postgres:disposable@127.0.0.1:5432/verdant_linked_quicklog_diary",
      ),
    ).toEqual({ host: "127.0.0.1", password: "disposable" });
  });

  it.each([
    "",
    "postgresql://postgres:disposable@production.example:5432/verdant_linked_quicklog_diary",
    "postgresql://postgres:disposable@127.0.0.1:5432/postgres",
    "postgresql://service_role:disposable@127.0.0.1:5432/verdant_linked_quicklog_diary",
    "postgresql://postgres:disposable@127.0.0.1:5433/verdant_linked_quicklog_diary",
    "postgresql://postgres:disposable@127.0.0.1:5432/verdant_linked_quicklog_diary?sslmode=require",
    "postgresql://postgres:disposable%0Avalue@127.0.0.1:5432/verdant_linked_quicklog_diary",
  ])("rejects a non-disposable target without leaking values: %s", (url) => {
    expect(disposableConnection(url)).toBeNull();
  });
});

describe("linked diary canonical photo readback proof", () => {
  const databaseUrl =
    "postgresql://postgres:disposable@127.0.0.1:5432/verdant_linked_quicklog_diary";

  function sqlRunner({ sentinel = true, receiptOk = true, missing = "" } = {}) {
    const statements: string[] = [];
    const spawnImpl = (_command: string, _args: string[], options: { input?: string }) => {
      const sql = String(options.input ?? "");
      statements.push(sql);
      if (sql.includes("runtime_sentinel")) {
        return {
          status: 0,
          stdout: sentinel ? "verdant_linked_quicklog_diary_pg15_disposable_v1" : "rejected",
          stderr: "",
        };
      }
      if (sql.includes("-- canonical_manual_photo_save")) {
        return {
          status: 0,
          stdout: JSON.stringify({
            ok: receiptOk,
            reused: false,
            grow_event_id: "77777777-7777-4777-8777-777777777777",
            diary_entry_id: "88888888-8888-4888-8888-888888888888",
          }),
          stderr: "",
        };
      }
      const label = /^-- ([a-z_]+)/.exec(sql)?.[1];
      if (
        label &&
        [
          "linked_update",
          "linked_wrong_photo",
          "linked_photo_plus_note",
          "linked_photo_replacement",
          "client_insert_link",
          "client_add_link",
          "client_remove_link",
          "canonical_photo_replacement",
        ].includes(label)
      ) {
        return {
          status: 1,
          stdout: "",
          stderr: "row-level security policy linked_quicklog_diary_requires_revision",
        };
      }
      const count =
        label === "persisted_integrity"
          ? 2
          : label === missing ||
              ["linked_delete", "legacy_delete", "other_owner"].includes(label ?? "")
            ? 0
            : 1;
      return { status: 0, stdout: String(count), stderr: "" };
    };
    return { statements, spawnImpl };
  }

  it("rejects hosted targets before sending any SQL", async () => {
    const runner = sqlRunner();
    await expect(
      runLinkedDiaryHarness({
        databaseUrl:
          "postgresql://postgres:disposable@db.example.test:5432/verdant_linked_quicklog_diary",
        ...runner,
      }),
    ).rejects.toThrow("disposable_target_required");
    expect(runner.statements).toEqual([]);
  });

  it("rejects a missing disposable sentinel before creating the fixture", async () => {
    const runner = sqlRunner({ sentinel: false });
    await expect(runLinkedDiaryHarness({ databaseUrl, ...runner })).rejects.toThrow(
      "disposable_sentinel_required",
    );
    expect(runner.statements).toHaveLength(1);
  });

  it("does not normalize a photo after the canonical save is refused", async () => {
    const runner = sqlRunner({ receiptOk: false });
    await expect(runLinkedDiaryHarness({ databaseUrl, ...runner })).rejects.toThrow(
      "canonical_manual_photo_save:unexpected_receipt",
    );
    expect(runner.statements.at(-1)).toContain("-- canonical_manual_photo_save");
  });

  it("fails when the saved companion does not contain the exact photo bytes", async () => {
    const runner = sqlRunner({ missing: "canonical_photo_details_readback" });
    await expect(runLinkedDiaryHarness({ databaseUrl, ...runner })).rejects.toThrow(
      "canonical_photo_details_readback:expected_1_got_0",
    );
    expect(runner.statements.at(-1)).toContain("-- canonical_photo_details_readback");
  });

  it("fails when the permitted photo normalization cannot be read back", async () => {
    const runner = sqlRunner({ missing: "canonical_photo_column_readback" });
    await expect(runLinkedDiaryHarness({ databaseUrl, ...runner })).rejects.toThrow(
      "canonical_photo_column_readback:expected_1_got_0",
    );
    expect(runner.statements.at(-1)).toContain("-- canonical_photo_column_readback");
  });
});
