import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VM = readFileSync(
  join(process.cwd(), "src/lib/environmentCheckInsightsViewModel.ts"),
  "utf8",
);
const PANEL = readFileSync(
  join(process.cwd(), "src/components/EnvironmentCheckInsightsPanel.tsx"),
  "utf8",
);

describe("Environment Check insights — static safety", () => {
  for (const [name, src] of [
    ["environmentCheckInsightsViewModel.ts", VM],
    ["EnvironmentCheckInsightsPanel.tsx", PANEL],
  ] as const) {
    it(`${name}: no Supabase / write-path imports`, () => {
      expect(src).not.toMatch(/@\/integrations\/supabase/);
      expect(src).not.toMatch(/supabase[./]functions\.invoke/);
      expect(src).not.toMatch(/\.from\(['"`]sensor_readings['"`]\)/);
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.delete\(/);
    });

    it(`${name}: no sensor_readings / live telemetry treatment`, () => {
      expect(src).not.toMatch(/sensor_readings/);
      // Disclaimers only — never claim "live".
      expect(src).not.toMatch(/(?<!not )live sensor telemetry/i);
      expect(src).not.toMatch(/health.score/i);
    });

    it(`${name}: no AI / alert / Action Queue / device control`, () => {
      expect(src).not.toMatch(/ai[-_ ]?doctor/i);
      expect(src).not.toMatch(/openai|anthropic|gemini|gpt-/i);
      expect(src).not.toMatch(/action[_ ]queue/i);
      expect(src).not.toMatch(/\balerts?\.(insert|create)/i);
      expect(src).not.toMatch(/device[_ ]control|relay|valve|pump\b/i);
    });

    it(`${name}: no schema migration markers`, () => {
      expect(src).not.toMatch(/CREATE\s+TABLE/i);
      expect(src).not.toMatch(/ALTER\s+TABLE/i);
      expect(src).not.toMatch(/DROP\s+TABLE/i);
    });
  }

  it("view-model file has no React import (pure)", () => {
    expect(VM).not.toMatch(/from\s+["']react["']/);
  });
});
