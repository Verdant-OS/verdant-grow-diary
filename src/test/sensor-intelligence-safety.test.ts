/**
 * Sensor-intelligence safety scanner — vitest wrapper.
 *
 * Runs the same static checks as
 * `scripts/assert-sensor-intelligence-safety.mjs` so they are enforced by
 * the regular test suite, and exercises each rule against fixture content
 * to prove the scanner actually rejects unsafe patterns.
 *
 * Pure / read-only. No I/O against Supabase. No automation.
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error — JS module, ESM default-friendly
import {
  scanContent,
  scanRepository,
  SAFETY_CONTRACT_MARKER,
} from "../../scripts/assert-sensor-intelligence-safety.mjs";

describe("sensor-intelligence safety scanner — repository scan", () => {
  it("current repository is clean", () => {
    const violations = scanRepository(process.cwd());
    if (violations.length > 0) {
      // Surface details for debugging.
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(violations, null, 2));
    }
    expect(violations).toEqual([]);
  });
});

describe("sensor-intelligence safety scanner — synthetic violations", () => {
  it("rejects service_role used in frontend code", () => {
    const v = scanContent(
      "src/lib/unsafe.ts",
      `import { createClient } from "@supabase/supabase-js";\nconst k = process.env.service_role;\n`,
    );
    expect(v.some((x) => x.rule === "frontend-private-term")).toBe(true);
  });

  it("rejects SUPABASE_SERVICE_ROLE_KEY in frontend code", () => {
    const v = scanContent(
      "src/components/Bad.tsx",
      `const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;\n`,
    );
    expect(v.some((x) => x.term === "SUPABASE_SERVICE_ROLE_KEY")).toBe(true);
  });

  it("rejects device-control payload terms", () => {
    for (const term of [
      "execute_device",
      "setpoint_write",
      "irrigation_control",
      "light_control",
      "fan_control",
    ]) {
      const v = scanContent(
        "src/lib/whatever.ts",
        `export const op = { kind: "${term}" };\n`,
      );
      expect(v.some((x) => x.rule === "device-control-term")).toBe(true);
    }
  });

  it("rejects reserved subsystem names without the safety-contract marker", () => {
    const v = scanContent(
      "src/lib/calibration.ts",
      `export function CalibrationApprovalCard() { return null; }\n`,
    );
    expect(
      v.some((x) => x.rule === "reserved-subsystem-without-contract"),
    ).toBe(true);
  });

  it("allows reserved subsystem names when the safety-contract marker is present", () => {
    const v = scanContent(
      "src/lib/calibration.ts",
      `// ${SAFETY_CONTRACT_MARKER}\nexport function CalibrationApprovalCard() { return null; }\n`,
    );
    expect(
      v.some((x) => x.rule === "reserved-subsystem-without-contract"),
    ).toBe(false);
  });

  it("rejects auto action_queue insert from AI Doctor / drift logic", () => {
    const v = scanContent(
      "src/lib/aiDoctorAutopilot.ts",
      `// vpdDrift detected\nawait supabase.from('action_queue').insert({ status: 'suggested' });\n`,
    );
    expect(
      v.some(
        (x) =>
          x.rule === "auto-action-queue-insert-from-drift-or-ai-doctor",
      ),
    ).toBe(true);
  });

  it("rejects scheduled-analysis code creating approved/applied/executed actions", () => {
    for (const status of ["approved", "applied", "executed"]) {
      const v = scanContent(
        "supabase/functions/scheduled-plant-analysis/index.ts",
        `await supabase.from('action_queue').insert({ status: '${status}' });\n`,
      );
      expect(
        v.some((x) => x.rule === "scheduled-analysis-unsafe-status"),
      ).toBe(true);
    }
  });

  it("rejects fake peer-distribution fallback data (mock)", () => {
    const v = scanContent(
      "src/components/PeerPanel.tsx",
      `const peerDistribution = mockPeerDistribution();\n`,
    );
    expect(
      v.some((x) => x.rule === "fake-peer-distribution-fallback"),
    ).toBe(true);
  });

  it("rejects fake peer-distribution fallback data (Math.random)", () => {
    const v = scanContent(
      "src/components/PeerPanel.tsx",
      `function fallback() { return { peer_distribution: Array.from({length:10}, () => Math.random()) }; }\n`,
    );
    expect(
      v.some((x) => x.rule === "fake-peer-distribution-fallback"),
    ).toBe(true);
  });

  it("does not flag clean code", () => {
    const v = scanContent(
      "src/lib/clean.ts",
      `export const SAFE = "ok";\n`,
    );
    expect(v).toEqual([]);
  });
});
