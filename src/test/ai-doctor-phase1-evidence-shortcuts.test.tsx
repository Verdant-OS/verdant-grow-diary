/**
 * AI Doctor Phase 1 — Evidence shortcuts (recent diary) tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  AiDoctorPhase1EvidenceShortcuts,
  AI_DOCTOR_PHASE1_DIARY_SHORTCUTS_MAX,
  sortRecentActivityNewestFirst,
  type AiDoctorPhase1RecentActivityRow,
} from "@/components/AiDoctorPhase1EvidenceShortcuts";

const CTX = { plantId: "plant-a", growId: "grow-1", tentId: "tent-1" };

function row(
  id: string,
  occurred_at: string,
  overrides: Partial<AiDoctorPhase1RecentActivityRow> = {},
): AiDoctorPhase1RecentActivityRow {
  return { id, occurred_at, event_type: "note", notes: "n", ...overrides };
}

function renderWithRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("sortRecentActivityNewestFirst", () => {
  it("orders newest first with stable id tie-break", () => {
    const rows = [
      row("b", "2026-06-10T00:00:00Z"),
      row("a", "2026-06-10T00:00:00Z"),
      row("c", "2026-06-12T00:00:00Z"),
    ];
    expect(sortRecentActivityNewestFirst(rows).map((r) => r.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("ignores malformed rows", () => {
    const rows = [
      { id: "ok", occurred_at: "2026-06-10T00:00:00Z" },
      null as unknown as AiDoctorPhase1RecentActivityRow,
      { id: 42 as unknown as string, occurred_at: "2026-06-12T00:00:00Z" },
    ];
    expect(sortRecentActivityNewestFirst(rows).map((r) => r.id)).toEqual(["ok"]);
  });
});

describe("AiDoctorPhase1EvidenceShortcuts — render", () => {
  it("limits shortcuts to AI_DOCTOR_PHASE1_DIARY_SHORTCUTS_MAX and orders newest first", () => {
    expect(AI_DOCTOR_PHASE1_DIARY_SHORTCUTS_MAX).toBe(3);
    const items = [
      row("e1", "2026-06-01T00:00:00Z"),
      row("e2", "2026-06-02T00:00:00Z"),
      row("e3", "2026-06-03T00:00:00Z"),
      row("e4", "2026-06-04T00:00:00Z"),
      row("e5", "2026-06-05T00:00:00Z"),
    ];
    renderWithRouter(
      <AiDoctorPhase1EvidenceShortcuts items={items} context={CTX} />,
    );
    expect(
      screen.getByTestId("ai-doctor-phase1-diary-shortcut-e5"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-phase1-diary-shortcut-e4"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-phase1-diary-shortcut-e3"),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("ai-doctor-phase1-diary-shortcut-e1"),
    ).toBeNull();
    expect(
      screen.queryByTestId("ai-doctor-phase1-diary-shortcut-e2"),
    ).toBeNull();
  });

  it("preserves plantId/growId/tentId in each href", () => {
    renderWithRouter(
      <AiDoctorPhase1EvidenceShortcuts
        items={[row("only", "2026-06-10T00:00:00Z")]}
        context={CTX}
      />,
    );
    const href =
      screen
        .getByTestId("ai-doctor-phase1-diary-shortcut-only")
        .getAttribute("href") ?? "";
    expect(href).toContain("/plants/plant-a");
    expect(href).toContain("growId=grow-1");
    expect(href).toContain("tentId=tent-1");
    expect(href).toContain("#diary-only");
  });

  it("renders calm empty copy when there are no rows", () => {
    renderWithRouter(
      <AiDoctorPhase1EvidenceShortcuts items={[]} context={CTX} />,
    );
    expect(
      screen.getByTestId("ai-doctor-phase1-diary-shortcuts-empty").textContent,
    ).toContain("No recent diary evidence available yet.");
  });

  it("anchors have no onClick mutation handlers", () => {
    renderWithRouter(
      <AiDoctorPhase1EvidenceShortcuts
        items={[row("x", "2026-06-10T00:00:00Z")]}
        context={CTX}
      />,
    );
    const anchor = screen.getByTestId("ai-doctor-phase1-diary-shortcut-x");
    expect(anchor.tagName.toLowerCase()).toBe("a");
    expect(anchor.getAttribute("onclick")).toBeNull();
  });

  it("renders unavailable label when plantId missing", () => {
    renderWithRouter(
      <AiDoctorPhase1EvidenceShortcuts
        items={[row("only", "2026-06-10T00:00:00Z")]}
        context={{ plantId: null }}
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-phase1-diary-shortcut-only-unavailable"),
    ).toBeTruthy();
  });
});

describe("static safety — AiDoctorPhase1EvidenceShortcuts", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../components/AiDoctorPhase1EvidenceShortcuts.tsx"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("no Supabase/fetch/model/write/device-control surface", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/openai|anthropic|gemini|ai-gateway/i);
    expect(SRC).not.toMatch(/action_queue.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/diary.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/timeline.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/alert.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/executeDeviceCommand|deviceControl|sendDeviceCommand/i);
    expect(SRC).not.toMatch(/service_role|bridge[_-]?token/i);
  });
});
