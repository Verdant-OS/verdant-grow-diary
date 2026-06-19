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

describe("AiDoctorPhase1EvidenceShortcuts — mobile polish", () => {
  it("CTAs use mobile-stacking, full-width, thumb-friendly classes", () => {
    renderWithRouter(
      <AiDoctorPhase1EvidenceShortcuts
        items={[row("only", "2026-06-10T00:00:00Z")]}
        context={CTX}
      />,
    );
    const anchor = screen.getByTestId("ai-doctor-phase1-diary-shortcut-only");
    const cls = anchor.getAttribute("class") ?? "";
    expect(cls).toMatch(/\bw-full\b/);
    expect(cls).toMatch(/\bsm:w-auto\b/);
    expect(cls).toMatch(/\bmin-h-10\b/);
  });

  it("renders no write/action labels", () => {
    const { container } = renderWithRouter(
      <AiDoctorPhase1EvidenceShortcuts
        items={[row("only", "2026-06-10T00:00:00Z")]}
        context={CTX}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Approve|Execute|Save|Send|Run AI/i);
  });
});

describe("AiDoctorPhase1EvidenceShortcuts — accessibility polish", () => {
  it("diary shortcut Links include focus-visible ring + aria-label with plant name", () => {
    renderWithRouter(
      <AiDoctorPhase1EvidenceShortcuts
        items={[row("x", "2026-06-10T00:00:00Z", { event_type: "note", notes: "n" })]}
        context={{ ...CTX, plantName: "Plant A" }}
      />,
    );
    const a = screen.getByTestId("ai-doctor-phase1-diary-shortcut-x");
    const cls = a.getAttribute("class") ?? "";
    expect(cls).toMatch(/focus-visible:ring-2/);
    expect(cls).toMatch(/focus-visible:ring-offset-2/);
    const aria = a.getAttribute("aria-label") ?? "";
    expect(aria).toMatch(/for Plant A/);
  });

  it("uses generic aria-label when plantName is unavailable", () => {
    renderWithRouter(
      <AiDoctorPhase1EvidenceShortcuts
        items={[row("x", "2026-06-10T00:00:00Z")]}
        context={CTX}
      />,
    );
    const a = screen.getByTestId("ai-doctor-phase1-diary-shortcut-x");
    expect(a.getAttribute("aria-label") ?? "").toMatch(/for selected plant/);
  });

  it("aria labels never imply write/execute actions", () => {
    renderWithRouter(
      <AiDoctorPhase1EvidenceShortcuts
        items={[row("x", "2026-06-10T00:00:00Z")]}
        context={{ ...CTX, plantName: "Plant A" }}
      />,
    );
    const aria =
      screen.getByTestId("ai-doctor-phase1-diary-shortcut-x").getAttribute("aria-label") ?? "";
    expect(aria).not.toMatch(/Approve|Send|Execute|Run equipment|Control device/i);
  });
});

describe("AiDoctorPhase1EvidenceShortcuts — shared a11y utility", () => {
  it("diary shortcut className contains the shared focus-visible recipe", async () => {
    const { AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES } = await import(
      "@/lib/aiDoctorPhase1A11yClassNames"
    );
    renderWithRouter(
      <AiDoctorPhase1EvidenceShortcuts
        items={[row("x", "2026-06-10T00:00:00Z")]}
        context={CTX}
      />,
    );
    const cls =
      screen.getByTestId("ai-doctor-phase1-diary-shortcut-x").getAttribute("class") ?? "";
    for (const token of AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES.split(/\s+/)) {
      expect(cls).toContain(token);
    }
  });
});
