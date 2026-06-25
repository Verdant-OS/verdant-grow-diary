/**
 * AI Doctor Phase 1 — Empty / Missing-Context CTA tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  AiDoctorPhase1EmptyStateActions,
  deriveMissingContextCtas,
} from "@/components/AiDoctorPhase1EmptyStateActions";

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("deriveMissingContextCtas", () => {
  it("maps photo missing → Add Photo", () => {
    const cs = deriveMissingContextCtas(["recent photo (14d)"], { plantId: "p1" });
    expect(cs.find((c) => c.id === "add-photo")).toBeTruthy();
  });
  it("maps sensor/snapshot missing → Check Environment", () => {
    const cs = deriveMissingContextCtas(
      ["recent trustworthy sensor reading (7d)"],
      { plantId: "p1" },
    );
    expect(cs.find((c) => c.id === "check-environment")).toBeTruthy();
  });
  it("maps diary/watering missing → Add Quick Log", () => {
    const cs = deriveMissingContextCtas(["recent diary entries (14d)"], {
      plantId: "p1",
    });
    expect(cs.find((c) => c.id === "add-quick-log")).toBeTruthy();
  });
  it("maps stage/medium/pot size missing → Update Plant Context", () => {
    const cs = deriveMissingContextCtas(["growth stage", "pot size"], {
      plantId: "p1",
    });
    expect(cs.find((c) => c.id === "update-plant-context")).toBeTruthy();
  });
  it("includes plantId/growId/tentId in the CTA URLs", () => {
    const cs = deriveMissingContextCtas(["recent photo (14d)"], {
      plantId: "p1",
      growId: "g1",
      tentId: "t1",
    });
    const cta = cs.find((c) => c.id === "add-photo")!;
    expect(cta.to).toContain("plantId=p1");
    expect(cta.to).toContain("growId=g1");
    expect(cta.to).toContain("tentId=t1");
  });
});

describe("AiDoctorPhase1EmptyStateActions — no-result", () => {
  it("renders the three navigation CTAs with plantId", () => {
    wrap(
      <AiDoctorPhase1EmptyStateActions
        kind="no-result"
        context={{ plantId: "p1" }}
      />,
    );
    expect(screen.getByTestId("ai-doctor-phase1-cta-add-quick-log")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-cta-add-photo")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-cta-check-environment")).toBeTruthy();
    const href = screen
      .getByTestId("ai-doctor-phase1-cta-add-quick-log")
      .getAttribute("href");
    expect(href).toContain("plantId=p1");
  });

  it("renders without crashing when no plantId is available", () => {
    wrap(<AiDoctorPhase1EmptyStateActions kind="no-result" context={{}} />);
    expect(screen.getByTestId("ai-doctor-phase1-cta-add-quick-log")).toBeTruthy();
  });
});

describe("AiDoctorPhase1EmptyStateActions — missing-context", () => {
  it("renders only relevant CTAs derived from missing items", () => {
    wrap(
      <AiDoctorPhase1EmptyStateActions
        kind="missing-context"
        missing={["recent photo (14d)"]}
        context={{ plantId: "p1" }}
      />,
    );
    expect(screen.getByTestId("ai-doctor-phase1-cta-add-photo")).toBeTruthy();
    expect(screen.queryByTestId("ai-doctor-phase1-cta-check-environment")).toBeNull();
  });

  it("renders nothing when missing list does not match any CTA", () => {
    const { container } = wrap(
      <AiDoctorPhase1EmptyStateActions
        kind="missing-context"
        missing={["unrelated unknown item"]}
        context={{ plantId: "p1" }}
      />,
    );
    expect(container.querySelector('[data-testid^="ai-doctor-phase1-cta-"]')).toBeNull();
  });
});

describe("static safety — AiDoctorPhase1EmptyStateActions", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../components/AiDoctorPhase1EmptyStateActions.tsx"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("no Supabase/fetch/model/write/device-control surface; no onClick mutation handlers", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/openai|anthropic|gemini|ai-gateway/i);
    expect(SRC).not.toMatch(/action_queue.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/diary.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/timeline.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/alert.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/executeDeviceCommand|deviceControl|sendDeviceCommand/i);
    // No onClick mutation handlers — navigation only via <Link>.
    expect(SRC).not.toMatch(/onClick\s*=/);
  });
});
