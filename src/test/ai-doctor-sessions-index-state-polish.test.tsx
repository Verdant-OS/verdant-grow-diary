/**
 * Presentation-only polish for AI Doctor Sessions Index states:
 * loading, empty, filtered-empty, and error.
 *
 * Safety: read-only static + render checks; no writes, no AI calls,
 * no automation/device-control copy.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// --- Configurable supabase mock ---
let mockRangeImpl: () => Promise<{ data: unknown[] | null; error: unknown }> = () =>
  Promise.resolve({ data: [], error: null });
const rangeSpy = vi.fn(() => mockRangeImpl());
const orderSpy = vi.fn(() => ({ range: rangeSpy }));
const selectSpy = vi.fn(() => ({ order: orderSpy }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: selectSpy }) },
}));

import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";

function renderWithProviders(ui: ReactElement, initialEntries: string[] = ["/"]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/AiDoctorSessionsIndex.tsx"), "utf8");

describe("AiDoctorSessionsIndex — loading state", () => {
  it("renders polite, busy loading region with the expected copy", async () => {
    // Never-resolving promise so the query stays in loading state.
    mockRangeImpl = () => new Promise(() => {});
    renderWithProviders(<AiDoctorSessionsIndex />);
    const loading = await screen.findByTestId("ai-doctor-sessions-index-loading");
    expect(loading.getAttribute("role")).toBe("status");
    expect(loading.getAttribute("aria-live")).toBe("polite");
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(loading.textContent).toMatch(/loading ai doctor sessions/i);
  });

  it("does not render empty or error copy while loading", async () => {
    mockRangeImpl = () => new Promise(() => {});
    renderWithProviders(<AiDoctorSessionsIndex />);
    await screen.findByTestId("ai-doctor-sessions-index-loading");
    expect(screen.queryByTestId("ai-doctor-sessions-index-empty")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-sessions-index-empty-filtered")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-sessions-index-error")).toBeNull();
  });
});

describe("AiDoctorSessionsIndex — empty state", () => {
  it("renders calm 'No AI Doctor sessions yet.' copy with review-focused next step", async () => {
    mockRangeImpl = () => Promise.resolve({ data: [], error: null });
    renderWithProviders(<AiDoctorSessionsIndex />);
    const empty = await screen.findByTestId("ai-doctor-sessions-index-empty");
    expect(empty.textContent).toMatch(/no ai doctor sessions yet/i);
    expect(empty.textContent).toMatch(/review/i);
    // No automation / certainty wording
    expect(empty.textContent ?? "").not.toMatch(/autopilot|automatically|guarantee/i);
  });
});

describe("AiDoctorSessionsIndex — filtered-empty state", () => {
  it("renders distinct filtered-empty copy with a working Clear filters action", async () => {
    mockRangeImpl = () => Promise.resolve({ data: [], error: null });
    renderWithProviders(<AiDoctorSessionsIndex />, ["/?risk=high"]);
    const filteredEmpty = await screen.findByTestId(
      "ai-doctor-sessions-index-empty-filtered",
    );
    expect(filteredEmpty.textContent).toMatch(/no sessions match these filters/i);
    expect(screen.queryByTestId("ai-doctor-sessions-index-empty")).toBeNull();
    const clear = screen.getByTestId("ai-doctor-sessions-index-empty-filtered-clear");
    fireEvent.click(clear);
    const empty = await screen.findByTestId("ai-doctor-sessions-index-empty");
    expect(empty).toBeTruthy();
  });
});

describe("AiDoctorSessionsIndex — error state", () => {
  it("renders role='alert' with a Retry button and no internal IDs", async () => {
    mockRangeImpl = () =>
      Promise.resolve({ data: null, error: { message: "boom" } });
    renderWithProviders(<AiDoctorSessionsIndex />);
    const err = await screen.findByTestId("ai-doctor-sessions-index-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toMatch(/unable to load ai doctor sessions/i);
    const retry = screen.getByTestId("ai-doctor-sessions-index-error-retry");
    expect(retry.textContent).toMatch(/retry/i);
    // No UUID-shaped IDs leaked
    expect(err.textContent ?? "").not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    // No raw provenance tokens
    expect(err.textContent ?? "").not.toMatch(/\[session:|\[alert:/);
  });
});

describe("AiDoctorSessionsIndex — accessibility & safety (static)", () => {
  it("page has a clear heading", () => {
    expect(PAGE).toMatch(/data-testid="ai-doctor-sessions-index-title"/);
  });
  it("view-session link has a descriptive aria-label and visible focus styles", () => {
    expect(PAGE).toMatch(/aria-label=\{`View AI Doctor session/);
    expect(PAGE).toMatch(/focus-visible:ring-2/);
  });
  it("retry control has visible focus styles", () => {
    expect(PAGE).toMatch(
      /ai-doctor-sessions-index-error-retry[\s\S]{0,300}focus-visible:ring-2/,
    );
  });
  it("does not contain automation / device-control / AI-execution copy", () => {
    expect(PAGE).not.toMatch(/autopilot/i);
    expect(PAGE).not.toMatch(/\bAI executed\b/i);
    expect(PAGE).not.toMatch(/turn (on|off) (the )?(fan|light|pump|heater|humidifier|dehumidifier)/i);
  });
  it("does not import service_role or trust client user_id inserts", () => {
    expect(PAGE).not.toMatch(/service_role/);
    expect(PAGE).not.toMatch(/\.insert\(/);
  });
});

// --- helpers ---
function MemoryRouterRouteWrapper({
  initialEntries,
  children,
}: {
  initialEntries: string[];
  children: ReactElement;
}) {
  return <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>;
}
