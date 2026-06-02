/**
 * Presentation-only polish for embedded AI Doctor panels:
 * Plant, Tent, and Coach. Covers loading, empty, error states,
 * accessible link names, focus styles, and token/ID safety.
 *
 * Safety: read-only static + render checks; no writes, no AI calls,
 * no automation/device-control copy, no action_queue changes.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// Fluent supabase mock — terminal calls invoke mockImpl()
let mockImpl: () => Promise<{ data: unknown[] | null; error: unknown }> = () =>
  Promise.resolve({ data: [], error: null });

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.neq = chain;
  builder.not = chain;
  builder.or = chain;
  builder.gte = chain;
  builder.lte = chain;
  builder.in = chain;
  builder.order = chain;
  builder.range = vi.fn(() => mockImpl());
  builder.limit = vi.fn(() => mockImpl());
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => makeBuilder() },
}));

import PlantAiDoctorSessionsPanel from "@/components/PlantAiDoctorSessionsPanel";
import TentAiDoctorSessionsPanel from "@/components/TentAiDoctorSessionsPanel";
import CoachAiDoctorHistoryPanel from "@/components/CoachAiDoctorHistoryPanel";

const ROOT = resolve(__dirname, "../..");
const PLANT_SRC = readFileSync(
  resolve(ROOT, "src/components/PlantAiDoctorSessionsPanel.tsx"),
  "utf8",
);
const TENT_SRC = readFileSync(
  resolve(ROOT, "src/components/TentAiDoctorSessionsPanel.tsx"),
  "utf8",
);
const COACH_SRC = readFileSync(
  resolve(ROOT, "src/components/CoachAiDoctorHistoryPanel.tsx"),
  "utf8",
);

function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const PLANT_ID = "11111111-1111-1111-1111-111111111111";
const TENT_ID = "22222222-2222-2222-2222-222222222222";
const GROW_ID = "33333333-3333-3333-3333-333333333333";

describe("Plant panel — state polish", () => {
  it("loading region uses role=status, aria-live=polite, aria-busy=true and calm copy", async () => {
    mockImpl = () => new Promise(() => {});
    renderWithProviders(<PlantAiDoctorSessionsPanel plantId={PLANT_ID} />);
    const loading = await screen.findByTestId("plant-ai-doctor-sessions-loading");
    expect(loading.getAttribute("role")).toBe("status");
    expect(loading.getAttribute("aria-live")).toBe("polite");
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(loading.textContent).toMatch(/loading ai doctor sessions/i);
    expect(screen.queryByTestId("plant-ai-doctor-sessions-empty")).toBeNull();
    expect(screen.queryByTestId("plant-ai-doctor-sessions-error")).toBeNull();
  });

  it("empty state shows calm plant-scoped copy with review-focused helper", async () => {
    mockImpl = () => Promise.resolve({ data: [], error: null });
    renderWithProviders(<PlantAiDoctorSessionsPanel plantId={PLANT_ID} />);
    const empty = await screen.findByTestId("plant-ai-doctor-sessions-empty");
    expect(empty.textContent).toMatch(/no ai doctor sessions for this plant yet/i);
    expect(empty.textContent).toMatch(/review/i);
    expect(empty.textContent ?? "").not.toMatch(/autopilot|automatically|guarantee/i);
  });
});

describe("Tent panel — state polish", () => {
  it("loading region is accessible and calm", async () => {
    mockImpl = () => new Promise(() => {});
    renderWithProviders(<TentAiDoctorSessionsPanel tentId={TENT_ID} />);
    const loading = await screen.findByTestId("tent-ai-doctor-sessions-loading");
    expect(loading.getAttribute("role")).toBe("status");
    expect(loading.getAttribute("aria-live")).toBe("polite");
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(loading.textContent).toMatch(/loading ai doctor sessions/i);
    expect(screen.queryByTestId("tent-ai-doctor-sessions-empty")).toBeNull();
    expect(screen.queryByTestId("tent-ai-doctor-sessions-error")).toBeNull();
  });

  it("empty state shows calm tent-scoped copy with review-focused helper", async () => {
    mockImpl = () => Promise.resolve({ data: [], error: null });
    renderWithProviders(<TentAiDoctorSessionsPanel tentId={TENT_ID} />);
    const empty = await screen.findByTestId("tent-ai-doctor-sessions-empty");
    expect(empty.textContent).toMatch(/no ai doctor sessions for this tent yet/i);
    expect(empty.textContent).toMatch(/review/i);
    expect(empty.textContent ?? "").not.toMatch(/autopilot|automatically|guarantee/i);
  });
});

describe("Coach panel — state polish", () => {
  it("loading region is accessible and calm", async () => {
    mockImpl = () => new Promise(() => {});
    renderWithProviders(<CoachAiDoctorHistoryPanel growId={GROW_ID} />);
    const loading = await screen.findByTestId("coach-ai-doctor-history-loading");
    expect(loading.getAttribute("role")).toBe("status");
    expect(loading.getAttribute("aria-live")).toBe("polite");
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(loading.textContent).toMatch(/loading ai doctor sessions/i);
    expect(screen.queryByTestId("coach-ai-doctor-history-empty")).toBeNull();
    expect(screen.queryByTestId("coach-ai-doctor-history-error")).toBeNull();
  });

  it("empty state shows calm grow-scoped copy with review-focused helper", async () => {
    mockImpl = () => Promise.resolve({ data: [], error: null });
    renderWithProviders(<CoachAiDoctorHistoryPanel growId={GROW_ID} />);
    const empty = await screen.findByTestId("coach-ai-doctor-history-empty");
    expect(empty.textContent).toMatch(/no ai doctor sessions yet/i);
    expect(empty.textContent).toMatch(/review/i);
    expect(empty.textContent ?? "").not.toMatch(/autopilot|automatically|guarantee/i);
  });
});

describe("Embedded panels — error state (static)", () => {
  it.each([
    ["Plant", PLANT_SRC, "plant-ai-doctor-sessions"],
    ["Tent", TENT_SRC, "tent-ai-doctor-sessions"],
    ["Coach", COACH_SRC, "coach-ai-doctor-history"],
  ] as const)("%s panel renders role='alert' error with accessible Retry", (_name, src, prefix) => {
    expect(src).toMatch(new RegExp(`data-testid="${prefix}-error"`));
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(new RegExp(`data-testid="${prefix}-error-retry"`));
    expect(src).toMatch(/refetch\(\)/);
    // Retry button has visible focus styles
    expect(src).toMatch(new RegExp(`${prefix}-error-retry[\\s\\S]{0,400}focus-visible:ring-2`));
  });
});

describe("Embedded panels — accessible link names and focus styles (static)", () => {
  it.each([
    ["Plant", PLANT_SRC],
    ["Tent", TENT_SRC],
    ["Coach", COACH_SRC],
  ] as const)("%s view-session link uses 'Open AI Doctor session' aria-label + focus ring", (_n, src) => {
    expect(src).toMatch(/aria-label=\{`Open AI Doctor session/);
    expect(src).toMatch(/focus-visible:ring-2/);
  });
});

describe("Embedded panels — caution framing preserved (static)", () => {
  it.each([
    ["Plant", PLANT_SRC],
    ["Tent", TENT_SRC],
    ["Coach", COACH_SRC],
  ] as const)("%s still renders caution indicator + reason via buildSessionRowCautionIndicator", (_n, src) => {
    expect(src).toMatch(/buildSessionRowCautionIndicator/);
    expect(src).toMatch(/caution-indicator/);
    expect(src).toMatch(/caution-reason/);
    expect(src).toMatch(/ShieldAlert/);
    // No certainty / automation language
    expect(src).not.toMatch(/autopilot/i);
    expect(src).not.toMatch(/\bAI executed\b/i);
    expect(src).not.toMatch(/guaranteed/i);
  });
});

describe("Embedded panels — token/ID safety (static)", () => {
  const sources: ReadonlyArray<readonly [string, string]> = [
    ["Plant", PLANT_SRC],
    ["Tent", TENT_SRC],
    ["Coach", COACH_SRC],
  ];

  it.each(sources)("%s panel does not render raw [session: / [alert: tokens", (_n, src) => {
    expect(src).not.toMatch(/\[session:/);
    expect(src).not.toMatch(/\[alert:/);
  });

  it.each(sources)("%s panel does not render IDs in visible text or ARIA labels", (_n, src) => {
    // Only allowed places for `row.id` are data-* attrs and the route URL.
    // Disallow it inside textual children, title= or aria-label= templates.
    expect(src).not.toMatch(/title=\{[^}]*row\.id/);
    expect(src).not.toMatch(/aria-label=\{[^}]*row\.id/);
    expect(src).not.toMatch(/>\s*\{row\.id\}\s*</);
    // grow/tent/plant IDs are passed in as props — they must never be rendered
    expect(src).not.toMatch(/\{plantId\}/);
    expect(src).not.toMatch(/\{tentId\}/);
    expect(src).not.toMatch(/>\{growId\}</);
  });
});

describe("Embedded panels — static safety scan", () => {
  const sources: ReadonlyArray<readonly [string, string]> = [
    ["Plant", PLANT_SRC],
    ["Tent", TENT_SRC],
    ["Coach", COACH_SRC],
  ];

  it.each(sources)("%s has no service_role / writes / functions.invoke", (_n, src) => {
    expect(src).not.toMatch(/service_role/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/user_id\s*:/);
  });

  it.each(sources)("%s has no automation / device-control copy", (_n, src) => {
    expect(src).not.toMatch(/autopilot/i);
    expect(src).not.toMatch(/turn (on|off) (the )?(fan|light|pump|heater|humidifier|dehumidifier)/i);
    expect(src).not.toMatch(/\bAI executed\b/i);
  });
});
