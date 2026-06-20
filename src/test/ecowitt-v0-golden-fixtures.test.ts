import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateForwardedTransportPayload,
  validateStoredRow,
  assertNoForbiddenRenderStrings,
} from "@/lib/ecowittV0ContractValidator";

const forwarded = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../tools/ecowitt-testbench/fixtures/golden_forwarded_payload.json"),
    "utf8",
  ),
);
const storedRow = JSON.parse(
  readFileSync(resolve(__dirname, "./fixtures/ecowitt/golden-stored-row.json"), "utf8"),
);

describe("ecowitt v0 golden fixtures", () => {
  it("forwarded transport payload validates", () => {
    const r = validateForwardedTransportPayload(forwarded);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("forwarded transport may use source=ecowitt (transport label)", () => {
    expect(forwarded.source).toBe("ecowitt");
  });

  it("stored row uses canonical source=live and lineage in raw_payload", () => {
    const r = validateStoredRow(storedRow);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(storedRow.source).toBe("live");
    expect(storedRow.raw_payload.vendor).toBeDefined();
    expect(storedRow.raw_payload.metadata.transport_source).toBe("ecowitt");
  });

  it("rejects vendor / metadata / idempotency_key at the top level", () => {
    const bad = { ...storedRow, vendor: "ecowitt" };
    const r = validateStoredRow(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/vendor/);
  });

  it("rejects non-canonical stored source", () => {
    const bad = { ...storedRow, source: "ecowitt" };
    const r = validateStoredRow(bad);
    expect(r.ok).toBe(false);
  });

  it("flags secret-shaped strings in forwarded payload", () => {
    const bad = { ...forwarded, raw_payload: { PASSKEY: "abc" } };
    const r = validateForwardedTransportPayload(bad);
    expect(r.ok).toBe(false);
  });

  it("forwarded fixture contains no committed secrets", () => {
    const body = JSON.stringify(forwarded);
    expect(body).not.toContain("PASSKEY");
    expect(body).not.toContain("service_role");
    expect(body).not.toMatch(/Authorization/i);
    expect(body).not.toMatch(/vbt_[A-Za-z0-9]{6,}/);
    expect(body).not.toMatch(
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    );
  });

  it("assertNoForbiddenRenderStrings catches PASSKEY etc", () => {
    expect(assertNoForbiddenRenderStrings("safe text").ok).toBe(true);
    expect(assertNoForbiddenRenderStrings("PASSKEY=abc").ok).toBe(false);
    expect(assertNoForbiddenRenderStrings("Bearer abc").ok).toBe(false);
  });
});
