/**
 * Tests for the per-row "Needs review" badge on /doctor/sessions.
 *
 * Read-only: predicate-driven badge; no writes, no AI, no automation.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rows = [
  {
    id: "s-high",
    created_at: "2025-01-01T00:00:00Z",
    diagnosis: { riskLevel: "high", summary: "x", likelyIssue: "y" },
    suggested_actions: [],
    displayed_confidence: 0.8,
    raw_confidence: 0.8,
    grow_id: null, plant_id: null, tent_id: null,
  },
  {
    id: "s-critical",
    created_at: "2025-01-01T00:00:00Z",
    diagnosis: { riskLevel: "critical", summary: "x", likelyIssue: "y" },
    suggested_actions: [],
    displayed_confidence: 0.8, raw_confidence: 0.8,
    grow_id: null, plant_id: null, tent_id: null,
  },
  {
    id: "s-low-with-actions",
    created_at: "2025-01-01T00:00:00Z",
    diagnosis: { riskLevel: "low", summary: "x", likelyIssue: "y" },
    suggested_actions: [{ title: "Check soil" }],
    displayed_confidence: 0.8, raw_confidence: 0.8,
    grow_id: null, plant_id: null, tent_id: null,
  },
  {
    id: "s-low-clean",
    created_at: "2025-01-01T00:00:00Z",
    diagnosis: { riskLevel: "low", summary: "x", likelyIssue: "y" },
    suggested_actions: [],
    displayed_confidence: 0.8, raw_confidence: 0.8,
    grow_id: null, plant_id: null, tent_id: null,
  },
  {
    id: "s-null-diag",
    created_at: "2025-01-01T00:00:00Z",
    diagnosis: null,
    suggested_actions: [],
    displayed_confidence: null, raw_confidence: null,
    grow_id: null, plant_id: null, tent_id: null,
  },
];

vi.mock("@/hooks/use-ai-doctor-sessions", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-ai-doctor-sessions")>(
    "@/hooks/use-ai-doctor-sessions",
  );
  return {
    ...actual,
    useAiDoctorSessionsIndex: () => ({
      data: { rows, page: 0, pageSize: 25, hasMore: false },
      isLoading: false,
      error: null,
    }),
  };
});

import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";

function renderAt(entry: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/doctor/sessions" element={<AiDoctorSessionsIndex />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rowFor(id: string) {
  const list = screen.getAllByTestId("ai-doctor-sessions-index-row");
  const found = list.find((el) => el.getAttribute("data-session-id") === id);
  if (!found) throw new Error(`row not found: ${id}`);
  return found;
}

describe("Per-row Needs review badge", () => {
  it("renders badge for high risk", async () => {
    renderAt("/doctor/sessions");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    const badge = within(rowFor("s-high")).getByTestId(
      "ai-doctor-sessions-index-needs-review-badge",
    );
    expect(badge.textContent).toBe("Needs review");
    expect(badge.getAttribute("title")).toBe(
      "High risk or suggested actions present.",
    );
    expect(badge.getAttribute("aria-label")).toBe(
      "High risk or suggested actions present.",
    );
  });

  it("renders badge for critical risk", async () => {
    renderAt("/doctor/sessions");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    expect(
      within(rowFor("s-critical")).getByTestId(
        "ai-doctor-sessions-index-needs-review-badge",
      ),
    ).toBeTruthy();
  });

  it("renders badge when suggested actions exist (even at low risk)", async () => {
    renderAt("/doctor/sessions");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    expect(
      within(rowFor("s-low-with-actions")).getByTestId(
        "ai-doctor-sessions-index-needs-review-badge",
      ),
    ).toBeTruthy();
  });

  it("does not render badge for low risk with no actions", async () => {
    renderAt("/doctor/sessions");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    expect(
      within(rowFor("s-low-clean")).queryByTestId(
        "ai-doctor-sessions-index-needs-review-badge",
      ),
    ).toBeNull();
  });

  it("does not render badge for null/invalid diagnosis with no actions", async () => {
    renderAt("/doctor/sessions");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    expect(
      within(rowFor("s-null-diag")).queryByTestId(
        "ai-doctor-sessions-index-needs-review-badge",
      ),
    ).toBeNull();
  });

  it("badge appears regardless of Needs review filter state", async () => {
    renderAt("/doctor/sessions?needsReview=all");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    expect(
      within(rowFor("s-high")).getByTestId(
        "ai-doctor-sessions-index-needs-review-badge",
      ),
    ).toBeTruthy();
  });

  it("badge still appears when Needs review filter is active (=yes)", async () => {
    renderAt("/doctor/sessions?needsReview=yes");
    await screen.findByTestId("ai-doctor-sessions-index-page");
    expect(
      within(rowFor("s-critical")).getByTestId(
        "ai-doctor-sessions-index-needs-review-badge",
      ),
    ).toBeTruthy();
  });
});

describe("Static safety — Needs review badge feature", () => {
  const page = readFileSync(
    resolve(process.cwd(), "src/pages/AiDoctorSessionsIndex.tsx"),
    "utf8",
  );
  it("page does not contain mutation / AI / automation strings", () => {
    expect(page).not.toMatch(/\.insert\(/);
    expect(page).not.toMatch(/\.update\(/);
    expect(page).not.toMatch(/\.delete\(/);
    expect(page).not.toMatch(/\.upsert\(/);
    expect(page).not.toMatch(/functions\.invoke/);
    expect(page).not.toMatch(/from\(["']action_queue/);
    expect(page).not.toMatch(/from\(["']alerts/);
    expect(page).not.toMatch(/service_role/);
    expect(page).not.toMatch(/automation|device.?control/i);
  });
});
