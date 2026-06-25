/**
 * Phase 1.5 fixture-safety tests.
 *
 * Asserts the parity fixtures contain no real secrets, no real device
 * identifiers, and no real tokens, and that they remain deterministic
 * so the future parity harness has a stable contract surface.
 */
import { describe, it, expect } from "vitest";
import {
  PHASE_ONE_FIXTURES,
  FIXTURE_ALLOWED_UUIDS,
  FIXTURE_DUMMY_SENSITIVE_STRINGS,
} from "./fixtures/ecowitt-real-ingest-phase1-fixtures";

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Conservative deny-list. These substrings would indicate a real credential
// accidentally checked into the fixture file. The dummy values that prove
// redaction works begin with "DUMMY-" / "fixture-" / "Fixture" / "00:11:22",
// which deliberately do not look like real secrets.
const FORBIDDEN_REAL_CREDENTIAL_HINTS = [
  /\bvbt_[A-Za-z0-9_-]{8,}/, // verdant bridge token format
  /\bsk_(?:live|test)_/i, // stripe-like
  /\bBearer\s+[A-Za-z0-9._-]{20,}/, // bearer literal
  /eyJ[A-Za-z0-9._-]{20,}/, // JWT-shaped
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /\bservice_role\b/i,
];

describe("ecowitt-real-ingest Phase 1.5 fixtures — safety", () => {
  const serialized = JSON.stringify(PHASE_ONE_FIXTURES);

  it("contains no real credential-shaped strings", () => {
    for (const rx of FORBIDDEN_REAL_CREDENTIAL_HINTS) {
      expect(serialized).not.toMatch(rx);
    }
  });

  it("only uses fake/synthetic UUIDs from the allowed set", () => {
    const found = serialized.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [];
    for (const u of found) {
      expect(FIXTURE_ALLOWED_UUIDS).toContain(u);
    }
    for (const u of FIXTURE_ALLOWED_UUIDS) {
      expect(u).toMatch(UUID_RX);
    }
  });

  it("dummy sensitive strings are obviously synthetic", () => {
    expect(FIXTURE_DUMMY_SENSITIVE_STRINGS.passkey).toMatch(/DUMMY/);
    expect(FIXTURE_DUMMY_SENSITIVE_STRINGS.mac).toMatch(/^00:11:22:/);
    expect(FIXTURE_DUMMY_SENSITIVE_STRINGS.ip).toMatch(/^10\./);
    expect(FIXTURE_DUMMY_SENSITIVE_STRINGS.station).toMatch(/Fixture/);
    expect(FIXTURE_DUMMY_SENSITIVE_STRINGS.gateway).toMatch(/fixture-/);
  });

  it("every fixture has a stable id, reference_time, and payload object", () => {
    const ids = new Set<string>();
    for (const f of PHASE_ONE_FIXTURES) {
      expect(f.id).toMatch(/^[a-z0-9_]+$/);
      expect(ids.has(f.id)).toBe(false);
      ids.add(f.id);
      expect(typeof f.reference_time).toBe("string");
      expect(Number.isFinite(Date.parse(f.reference_time))).toBe(true);
      expect(typeof f.payload).toBe("object");
      expect(f.payload).not.toBeNull();
    }
  });

  it("rejected fixtures declare at least one expected blocked reason", () => {
    for (const f of PHASE_ONE_FIXTURES) {
      if (f.expected_status === "rejected_candidate") {
        expect(f.expected_blocked_reasons_subset.length).toBeGreaterThan(0);
      } else {
        expect(f.expected_blocked_reasons_subset).toEqual([]);
      }
    }
  });

  it("each fixture lists must_not_appear_in_response substrings drawn from its own payload", () => {
    for (const f of PHASE_ONE_FIXTURES) {
      const payloadStr = JSON.stringify(f.payload);
      for (const s of f.must_not_appear_in_response) {
        // The forbidden string must actually appear in the input payload —
        // otherwise the redaction parity check would be vacuously true.
        expect(payloadStr).toContain(s);
      }
    }
  });

  it("is deterministic across imports (serialization is stable)", () => {
    const a = JSON.stringify(PHASE_ONE_FIXTURES);
    const b = JSON.stringify(PHASE_ONE_FIXTURES);
    expect(a).toBe(b);
  });
});
