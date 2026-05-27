import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import EnvironmentStabilityCard from "@/components/EnvironmentStabilityCard";
import type { StabilityResult } from "@/lib/environmentStabilityRules";
import { deriveStabilityWhyContext } from "@/lib/stabilityWhyContext";

function baseResult(overrides: Partial<StabilityResult> = {}): StabilityResult {
  return {
    status: "stable",
    last24h: {
      hoursOutside: 0,
      hoursConsidered: 18,
      totalConsidered: 18,
      outsideCount: 0,
    },
    last7d: {
      hoursOutside: 0,
      hoursConsidered: 120,
      totalConsidered: 120,
      outsideCount: 0,
    },
    sparse: false,
    message: null,
    stage: "veg",
    ...overrides,
  };
}

describe("EnvironmentStabilityCard — stage-band why context", () => {
  it("derives Flower VPD target band copy", () => {
    const ctx = deriveStabilityWhyContext("flower");
    expect(ctx.kind).toBe("stage");
    expect(ctx.text).toBe("Flower VPD target: 1.0–1.5 kPa");
  });

  it("derives Veg VPD target band copy", () => {
    const ctx = deriveStabilityWhyContext("veg");
    expect(ctx.text).toBe("Veg VPD target: 0.8–1.2 kPa");
  });

  it("renders Flower VPD target on a flower card", () => {
    render(
      <EnvironmentStabilityCard
        testId="card"
        result={baseResult({ stage: "flower" })}
      />,
    );
    const node = screen.getByTestId("card-why-context");
    expect(node.textContent).toContain("Flower VPD target: 1.0–1.5 kPa");
    expect(node.getAttribute("data-why-kind")).toBe("stage");
    // Existing 24h / 7d windows still render.
    expect(screen.getByTestId("card-window-24h")).toBeTruthy();
    expect(screen.getByTestId("card-window-7d")).toBeTruthy();
  });

  it("renders Veg VPD target on a veg card", () => {
    render(
      <EnvironmentStabilityCard
        testId="vcard"
        result={baseResult({ stage: "veg" })}
      />,
    );
    expect(screen.getByTestId("vcard-why-context").textContent).toContain(
      "Veg VPD target: 0.8–1.2 kPa",
    );
  });

  it("renders fallback for unknown stage", () => {
    render(
      <EnvironmentStabilityCard
        testId="ucard"
        result={baseResult({
          stage: "unknown",
          status: "stage_unknown",
          message: "Stage unknown.",
        })}
      />,
    );
    const node = screen.getByTestId("ucard-why-context");
    expect(node.textContent).toBe("Target context unavailable.");
    expect(node.getAttribute("data-why-kind")).toBe("unavailable");
  });

  it("renders context-only copy for harvest/drying without implying a breach band", () => {
    render(
      <EnvironmentStabilityCard
        testId="hcard"
        result={baseResult({
          stage: "harvest",
          status: "context_only",
          message: "Harvest stage — context only.",
        })}
      />,
    );
    const node = screen.getByTestId("hcard-why-context");
    expect(node.getAttribute("data-why-kind")).toBe("context_only");
    expect(node.textContent).toContain("Harvest");
    expect(node.textContent).toContain("context only");
    // Must NOT show a breach target band.
    expect(node.textContent).not.toMatch(/\d+\.\d+\s*–\s*\d+\.\d+\s*kPa/);
  });

  it("still renders sparse warning alongside the why context", () => {
    render(
      <EnvironmentStabilityCard
        testId="scard"
        result={baseResult({ stage: "flower", sparse: true })}
      />,
    );
    expect(screen.getByTestId("scard-sparse-warning").textContent).toContain(
      "Limited data",
    );
    expect(screen.getByTestId("scard-why-context").textContent).toContain(
      "Flower VPD target",
    );
  });

  it("static safety: no alert writes, queues, service_role, AI Doctor, or device control", () => {
    const files = [
      "src/components/EnvironmentStabilityCard.tsx",
      "src/lib/stabilityWhyContext.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(path.resolve(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/action_queue/i);
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/ai[_-]?doctor/i);
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(src).not.toMatch(/\.from\(\s*["']alerts["']\s*\)/);
      expect(src).not.toMatch(/automation|device[_-]?control|mqtt|home[_-]?assistant/i);
    }
  });
});
