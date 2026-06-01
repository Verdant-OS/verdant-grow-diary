/**
 * AI Doctor Session Detail loading / error / not-found state polish.
 *
 * Static-source tests (no React render): assert the page source contains the
 * required accessible state markup, copy, focus styles, and safety properties.
 * Parallel guard to action-detail-state-polish.test.tsx.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const RAW = readFileSync(resolve(ROOT, "src/pages/AiDoctorSessionDetail.tsx"), "utf8");
const SRC = stripSourceComments(RAW);

function block(label: string, regex: RegExp): string {
  const m = SRC.match(regex);
  if (!m) throw new Error(`Could not locate ${label} block`);
  return m[0];
}

const LOADING_BLOCK = block(
  "loading",
  /isLoading \? \([\s\S]*?\) : error \?/,
);
const ERROR_BLOCK = block(
  "error",
  /\) : error \? \([\s\S]*?\) : !data \?/,
);
const NOTFOUND_BLOCK = block(
  "not-found",
  /\) : !data \? \([\s\S]*?\) : \(/,
);

describe("AiDoctorSessionDetail — loading state", () => {
  it("renders visible 'Loading AI Doctor session…' copy", () => {
    expect(LOADING_BLOCK).toMatch(/Loading AI Doctor session…/);
  });

  it("uses accessible status semantics", () => {
    expect(LOADING_BLOCK).toMatch(/role="status"/);
    expect(LOADING_BLOCK).toMatch(/aria-live="polite"/);
    expect(LOADING_BLOCK).toMatch(/aria-busy="true"/);
  });

  it("does not render not-found or error copy while loading", () => {
    expect(LOADING_BLOCK).not.toMatch(/not found/i);
    expect(LOADING_BLOCK).not.toMatch(/couldn't load/i);
    expect(LOADING_BLOCK).not.toMatch(/Retry/);
    expect(LOADING_BLOCK).not.toMatch(/role="alert"/);
  });
});

describe("AiDoctorSessionDetail — error state", () => {
  it("uses role=alert with assertive live region", () => {
    expect(ERROR_BLOCK).toMatch(/role="alert"/);
    expect(ERROR_BLOCK).toMatch(/aria-live="assertive"/);
  });

  it("includes an accessible Retry button wired to refetch()", () => {
    expect(ERROR_BLOCK).toMatch(/>\s*Retry\s*</);
    expect(ERROR_BLOCK).toMatch(/onClick=\{\(\)\s*=>\s*refetch\(\)\}/);
    expect(ERROR_BLOCK).toMatch(/aria-label="Retry loading AI Doctor session"/);
  });

  it("Retry surface uses focus-visible ring utilities", () => {
    expect(ERROR_BLOCK).toMatch(/focus-visible:ring-2/);
  });

  it("does not leak raw provider error or internal IDs", () => {
    expect(ERROR_BLOCK).not.toMatch(/error\.message/);
    expect(ERROR_BLOCK).not.toMatch(/\{\s*sessionId\s*\}/);
    expect(ERROR_BLOCK).not.toMatch(/data\?\.(grow|tent|plant)_id/);
    expect(ERROR_BLOCK).not.toMatch(/\[alert:|\[session:/);
  });

  it("uses sanitized human-readable message", () => {
    expect(ERROR_BLOCK).toMatch(/couldn't load this AI Doctor session/i);
  });
});

describe("AiDoctorSessionDetail — not-found state", () => {
  it("renders calm not-found copy", () => {
    expect(NOTFOUND_BLOCK).toMatch(/AI Doctor session not found/);
  });

  it("preserves the existing not-found testid", () => {
    expect(NOTFOUND_BLOCK).toMatch(/data-testid="ai-doctor-session-detail-not-found"/);
  });

  it("does not render raw session/grow/tent/plant ids", () => {
    expect(NOTFOUND_BLOCK).not.toMatch(/\{\s*sessionId\s*\}/);
    expect(NOTFOUND_BLOCK).not.toMatch(/data\?\.(grow|tent|plant)_id/);
    expect(NOTFOUND_BLOCK).not.toMatch(/\{\s*data\?\.id\s*\}/);
  });

  it("does not raise an alert role for the calm not-found UI", () => {
    expect(NOTFOUND_BLOCK).not.toMatch(/role="alert"/);
  });
});

describe("AiDoctorSessionDetail — back control focus styles", () => {
  it("Back button uses focus-visible:ring utilities", () => {
    const back = block(
      "back-button",
      /<Button[\s\S]*?onClick=\{\(\) => navigate\(-1\)\}[\s\S]*?<\/Button>/,
    );
    expect(back).toMatch(/focus-visible:ring-2/);
    expect(back).toMatch(/focus-visible:ring-ring/);
  });
});

describe("AiDoctorSessionDetail — state UI safety", () => {
  it("state branches do not leak provenance tokens", () => {
    const all = LOADING_BLOCK + ERROR_BLOCK + NOTFOUND_BLOCK;
    expect(all).not.toMatch(/\[alert:/);
    expect(all).not.toMatch(/\[session:/);
  });

  it("state branches contain no device-control or automation copy", () => {
    const all = LOADING_BLOCK + ERROR_BLOCK + NOTFOUND_BLOCK;
    expect(all).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b/i,
    );
    expect(all).not.toMatch(
      /autopilot|auto[- ]?execute|auto[- ]?run|executed automatically|AI executed/i,
    );
  });

  it("page module is read-only — no writes, no service_role, no edge invocations, no AI run", () => {
    expect(SRC).not.toMatch(/service_role/i);
    expect(SRC).not.toMatch(/\.insert\(/);
    expect(SRC).not.toMatch(/\.update\(/);
    expect(SRC).not.toMatch(/\.delete\(/);
    expect(SRC).not.toMatch(/\.upsert\(/);
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/runDoctor|runAi|generateDiagnosis/i);
  });

  it("preserves the linked Action Queue section's descriptive aria-label", () => {
    expect(SRC).toMatch(/aria-label="Linked Action Queue items"/);
  });
});
