import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../../scripts/run-ecowitt-v0-validation.mjs"),
  "utf8",
);

describe("ecowitt v0 validation runner", () => {
  it("runs the required commands in order", () => {
    const required = [
      "test_forwarding_config",
      "test_source_labeling",
      "test_forwarding_contract",
      "src/test/ecowitt-live-source-snapshot-visibility.test.ts",
      "src/test/ai-doctor-context-ecowitt-live-evidence.test.ts",
      "src/test/ecowitt-local-forwarding-status-widget.test.tsx",
      "src/test/ecowitt-bridge-debug-page.test.tsx",
      "src/test/ecowitt-live-ingest-verified-rules.test.ts",
      "src/test/ecowitt-windows-testbench-static-safety.test.ts",
      "src/test/sensor-readings-dedupe-index-migration.test.ts",
      "src/test/ecowitt-v0-live-ingest-contract-doc.test.ts",
      "test:edge:sensor-ingest-webhook",
      "typecheck",
    ];
    let lastIndex = -1;
    for (const token of required) {
      const idx = SRC.indexOf(token);
      expect(idx, `missing token: ${token}`).toBeGreaterThan(-1);
      expect(idx, `out of order: ${token}`).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it("never posts/triggers forwarding or reads .env", () => {
    expect(SRC).not.toMatch(/\bfetch\(/);
    expect(SRC).not.toMatch(/http\.request|https\.request/);
    expect(SRC).not.toMatch(/method:\s*["']POST["']/i);
    expect(SRC).not.toMatch(/\.env\b/);
    expect(SRC).not.toMatch(/trigger[-_]?forward/i);
  });

  it("does not print secrets or contain token-shaped strings", () => {
    expect(SRC).not.toContain("PASSKEY");
    expect(SRC).not.toContain("service_role");
    expect(SRC).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{8,}/);
    expect(SRC).not.toMatch(/vbt_[A-Za-z0-9]{6,}/);
    expect(SRC).not.toMatch(
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    );
  });

  it("handles missing python3 cleanly via skipIfMissing", () => {
    expect(SRC).toContain("skipIfMissing");
    expect(SRC).toContain("python3");
  });
});
