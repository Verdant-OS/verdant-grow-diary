/**
 * Tests for "View plant" / "View tent" quick-jump links in the AI Doctor session detail header.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import AiDoctorSessionDetail from "@/pages/AiDoctorSessionDetail";
import { plantDetailPath, tentDetailPath } from "@/lib/routes";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";

function makeRow(overrides: Partial<AiDoctorSessionRow> = {}): AiDoctorSessionRow {
  return {
    id: "sess-qj",
    created_at: "2026-05-28T10:00:00Z",
    plant_id: "plant-1",
    tent_id: "tent-1",
    grow_id: "g1",
    question: "Why are leaves curling?",
    diagnosis: null,
    raw_confidence: null,
    displayed_confidence: null,
    context_confidence_ceiling: null,
    suggested_actions: [],
    ...overrides,
  };
}

let currentRow: AiDoctorSessionRow | null = makeRow();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          maybeSingle: () => Promise.resolve({ data: currentRow, error: null }),
        }),
      }),
    }),
  },
}));

function renderRoute(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/doctor/sessions/sess-qj"]}>
        <Routes>
          <Route path="/doctor/sessions/:sessionId" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AiDoctorSessionDetail — quick-jump links", () => {
  beforeEach(() => {
    currentRow = makeRow();
  });

  it("renders View plant when plant id exists", async () => {
    currentRow = makeRow({ plant_id: "plant-9", tent_id: null });
    renderRoute(<AiDoctorSessionDetail />);
    const link = (await screen.findByTestId(
      "ai-doctor-session-detail-plant-link",
    )) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(plantDetailPath("plant-9"));
  });

  it("does not render View plant when plant id is missing", async () => {
    currentRow = makeRow({ plant_id: null, tent_id: "tent-x" });
    renderRoute(<AiDoctorSessionDetail />);
    await screen.findByTestId("ai-doctor-session-detail-tent-link");
    expect(screen.queryByTestId("ai-doctor-session-detail-plant-link")).toBeNull();
  });

  it("renders View tent when tent id exists", async () => {
    currentRow = makeRow({ plant_id: null, tent_id: "tent-9" });
    renderRoute(<AiDoctorSessionDetail />);
    const link = (await screen.findByTestId(
      "ai-doctor-session-detail-tent-link",
    )) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(tentDetailPath("tent-9"));
  });

  it("does not render View tent when tent id is missing", async () => {
    currentRow = makeRow({ plant_id: "plant-x", tent_id: null });
    renderRoute(<AiDoctorSessionDetail />);
    await screen.findByTestId("ai-doctor-session-detail-plant-link");
    expect(screen.queryByTestId("ai-doctor-session-detail-tent-link")).toBeNull();
  });

  it("renders neither and no quick-jump group when both ids are missing", async () => {
    currentRow = makeRow({ plant_id: null, tent_id: null });
    renderRoute(<AiDoctorSessionDetail />);
    // wait for any header element to confirm render
    await screen.findByTestId("ai-doctor-session-detail-title");
    await waitFor(() => {
      expect(screen.queryByTestId("ai-doctor-session-detail-quick-jump")).toBeNull();
    });
    expect(screen.queryByTestId("ai-doctor-session-detail-plant-link")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-session-detail-tent-link")).toBeNull();
  });

  it("renders both links together when both ids exist", async () => {
    currentRow = makeRow({ plant_id: "p-both", tent_id: "t-both" });
    renderRoute(<AiDoctorSessionDetail />);
    const p = (await screen.findByTestId(
      "ai-doctor-session-detail-plant-link",
    )) as HTMLAnchorElement;
    const t = (await screen.findByTestId(
      "ai-doctor-session-detail-tent-link",
    )) as HTMLAnchorElement;
    expect(p.getAttribute("href")).toBe(plantDetailPath("p-both"));
    expect(t.getAttribute("href")).toBe(tentDetailPath("t-both"));
  });

  it("preserves Copy link and Open in new tab controls in the header", async () => {
    renderRoute(<AiDoctorSessionDetail />);
    expect(
      await screen.findByTestId("ai-doctor-session-detail-copy-link-button"),
    ).toBeTruthy();
    expect(
      await screen.findByTestId("ai-doctor-session-detail-open-new-tab-link"),
    ).toBeTruthy();
  });
});

describe("Quick-jump — pure helper and safety", () => {
  const ROOT = resolve(__dirname, "../..");
  const PAGE = readFileSync(resolve(ROOT, "src/pages/AiDoctorSessionDetail.tsx"), "utf8");

  it("uses route helpers instead of duplicating route templates in JSX", () => {
    expect(PAGE).toMatch(/plantDetailPath\(/);
    expect(PAGE).toMatch(/tentDetailPath\(/);
    expect(PAGE).not.toMatch(/to=\{`\/plants\/\$\{/);
    expect(PAGE).not.toMatch(/to=\{`\/tents\/\$\{/);
  });

  it("helpers produce canonical encoded paths", () => {
    expect(plantDetailPath("plant 1")).toBe("/plants/plant%201");
    expect(tentDetailPath("tent/1")).toBe("/tents/tent%2F1");
  });

  it("no DB writes, AI invocations, or action_queue/alerts/automation", () => {
    expect(PAGE).not.toMatch(/\.insert\(/);
    expect(PAGE).not.toMatch(/\.update\(/);
    expect(PAGE).not.toMatch(/\.delete\(/);
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/functions\.invoke/);
    const lower = PAGE.toLowerCase();
    expect(lower).not.toContain("service_role");
    expect(lower).not.toContain("action_queue");
    expect(lower).not.toContain("alert_events");
    for (const tok of [
      "mqtt",
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home-assistant",
      "home_assistant",
      "smart plug",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });
});
