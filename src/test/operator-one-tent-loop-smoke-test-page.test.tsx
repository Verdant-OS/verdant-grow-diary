import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import OperatorOneTentLoopSmokeTest from "@/pages/OperatorOneTentLoopSmokeTest";

const SRC = readFileSync(
  resolve(__dirname, "../pages/OperatorOneTentLoopSmokeTest.tsx"),
  "utf8",
);

describe("OperatorOneTentLoopSmokeTest — render", () => {
  it("renders checklist groups", () => {
    render(
      <MemoryRouter>
        <OperatorOneTentLoopSmokeTest />
      </MemoryRouter>,
    );
    for (const title of [
      "Grow / Tent / Plant",
      "Quick Log",
      "Timeline",
      "Sensor Snapshot",
      "AI Doctor Readiness",
      "Action Queue Safety",
      "Sensor Truth / Provenance",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it("renders required safety copy", () => {
    render(
      <MemoryRouter>
        <OperatorOneTentLoopSmokeTest />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No fake live data\./)).toBeInTheDocument();
    expect(screen.getByText(/No device control\./)).toBeInTheDocument();
    expect(
      screen.getByText(/Action Queue must remain approval-required/i),
    ).toBeInTheDocument();
  });
});

describe("OperatorOneTentLoopSmokeTest — static safety", () => {
  it("does not import Supabase write paths", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SRC).not.toMatch(/\.insert\(/);
    expect(SRC).not.toMatch(/\.update\(/);
    expect(SRC).not.toMatch(/\.delete\(/);
    expect(SRC).not.toMatch(/\.upsert\(/);
    expect(SRC).not.toMatch(/\.rpc\(/);
    expect(SRC).not.toMatch(/functions\.invoke/);
  });

  it("does not POST or fetch", () => {
    expect(SRC).not.toMatch(/\bfetch\(/);
    expect(SRC).not.toMatch(/axios/);
    expect(SRC).not.toMatch(/method:\s*["']POST["']/);
  });

  it("does not import AI / alerts / action queue / device control", () => {
    expect(SRC).not.toMatch(/ai-?doctor/i.source && /invokeAiDoctor|ai-doctor-review|ai-coach/);
    expect(SRC).not.toMatch(/createAlert|insertAlert/i);
    expect(SRC).not.toMatch(/actionQueueWrite|enqueueAction|insertAction/i);
    expect(SRC).not.toMatch(/deviceControl|switchOutlet|relayCommand/i);
  });

  it("does not leak secret-shaped strings", () => {
    expect(SRC).not.toContain("PASSKEY");
    expect(SRC).not.toContain("service_role");
    expect(SRC).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{8,}/);
    expect(SRC).not.toMatch(/vbt_[A-Za-z0-9]{6,}/);
    expect(SRC).not.toMatch(/raw_payload\./);
  });
});
