import { describe, expect, it } from "vitest";
import { disposableConnection } from "../../scripts/run-linked-quicklog-diary-pg15-harness.mjs";

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
