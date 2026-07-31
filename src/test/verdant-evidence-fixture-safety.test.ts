/**
 * Fixture safety for the evidence corpus, mirroring
 * `diary-baseline-fixture-safety.test.ts`.
 *
 * The registry is client-side code, so anything in the fixture module is
 * compiled into the browser bundle and shipped to every user. That makes
 * a credential, a real account id, or a named person in a fixture a
 * disclosure, not just untidy test data.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { EVIDENCE_FIXTURES } from "./fixtures/verdant-evidence-fixtures";

const FIXTURE_PATH = resolve(__dirname, "fixtures/verdant-evidence-fixtures.ts");
const SOURCE = readFileSync(FIXTURE_PATH, "utf8");

describe("evidence fixture safety", () => {
  it("contains no credential-shaped values", () => {
    const credentialShapes = [
      /(?<![A-Za-z0-9_-])(sk|pk|rk)_(live|test)_/,
      /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{8,}/,
      /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}/,
      /bearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
      /service_role/i,
      /api[_-]?key/i,
    ];
    for (const shape of credentialShapes) {
      expect(shape.test(SOURCE), `matched ${String(shape)}`).toBe(false);
    }
  });

  it("contains no real-looking uuids or email addresses", () => {
    expect(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(SOURCE),
    ).toBe(false);
    expect(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(SOURCE)).toBe(false);
  });

  it("names reviewers only by handle", () => {
    for (const record of EVIDENCE_FIXTURES) {
      expect(record.reviewer).toMatch(/^[a-z][a-z0-9-]{1,63}$/);
      // A handle, not "Firstname Lastname".
      expect(record.reviewer).not.toContain(" ");
    }
  });

  it("keeps every citation url a bare https location", () => {
    for (const record of EVIDENCE_FIXTURES) {
      const url = record.citation.url;
      if (url === null) continue;
      const parsed = new URL(url);
      expect(parsed.protocol).toBe("https:");
      expect(parsed.username).toBe("");
      expect(parsed.search).toBe("");
      expect(parsed.hash).toBe("");
    }
  });

  it("stays a test corpus, not an encyclopedia", () => {
    // The spec asks for a very small fixture set sufficient to test the
    // runtime. If this grows, curation has quietly moved into test code.
    expect(EVIDENCE_FIXTURES.length).toBeLessThanOrEqual(12);
  });
});
