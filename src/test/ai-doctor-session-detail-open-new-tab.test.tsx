/**
 * Tests for the "Open in new tab" link on the AI Doctor session detail page.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import AiDoctorSessionDetail, {
  buildSessionDetailCanonicalUrl,
} from "@/pages/AiDoctorSessionDetail";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";

function makeRow(): AiDoctorSessionRow {
  return {
    id: "sess-tab",
    created_at: "2026-05-28T10:00:00Z",
    plant_id: "p1",
    tent_id: "t1",
    grow_id: "g1",
    question: "Why are leaves curling?",
    diagnosis: null,
    raw_confidence: null,
    displayed_confidence: null,
    context_confidence_ceiling: null,
    suggested_actions: [],
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
      <MemoryRouter initialEntries={["/doctor/sessions/sess-tab?foo=bar&utm_source=x"]}>
        <Routes>
          <Route path="/doctor/sessions/:sessionId" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AiDoctorSessionDetail — Open in new tab link", () => {
  beforeEach(() => {
    currentRow = makeRow();
  });

  it("renders the Open in new tab link", async () => {
    renderRoute(<AiDoctorSessionDetail />);
    expect(
      await screen.findByTestId("ai-doctor-session-detail-open-new-tab-link"),
    ).toBeTruthy();
  });

  it("has href pointing to canonical session URL", async () => {
    renderRoute(<AiDoctorSessionDetail />);
    const link = (await screen.findByTestId(
      "ai-doctor-session-detail-open-new-tab-link",
    )) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/doctor/sessions/sess-tab");
  });

  it("href does not include unrelated query params", async () => {
    renderRoute(<AiDoctorSessionDetail />);
    const link = (await screen.findByTestId(
      "ai-doctor-session-detail-open-new-tab-link",
    )) as HTMLAnchorElement;
    const href = link.getAttribute("href") ?? "";
    expect(href).not.toMatch(/foo=bar|utm_source|utm_medium/);
  });

  it("uses target=_blank", async () => {
    renderRoute(<AiDoctorSessionDetail />);
    const link = await screen.findByTestId("ai-doctor-session-detail-open-new-tab-link");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("uses rel with noopener and noreferrer", async () => {
    renderRoute(<AiDoctorSessionDetail />);
    const link = await screen.findByTestId("ai-doctor-session-detail-open-new-tab-link");
    const rel = link.getAttribute("rel") ?? "";
    expect(rel).toMatch(/noopener/);
    expect(rel).toMatch(/noreferrer/);
  });

  it("has an accessible label", async () => {
    renderRoute(<AiDoctorSessionDetail />);
    const link = await screen.findByLabelText("Open session in new tab");
    expect(link).toBeTruthy();
  });

  it("reuses buildSessionDetailCanonicalUrl helper behavior", () => {
    expect(buildSessionDetailCanonicalUrl("sess-tab")).toBe("/doctor/sessions/sess-tab");
  });
});

describe("Open in new tab — safety scan", () => {
  const ROOT = resolve(__dirname, "../..");
  const PAGE = readFileSync(resolve(ROOT, "src/pages/AiDoctorSessionDetail.tsx"), "utf8");

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

  it("does not introduce a second URL builder", () => {
    const matches = PAGE.match(/function buildSessionDetailCanonicalUrl/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
