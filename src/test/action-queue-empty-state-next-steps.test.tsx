/**
 * /actions empty-state — One-Tent Loop next-step links.
 *
 * Confirms: Timeline + Sensors links render, copy is grower-safe,
 * no writes/fetch/AI calls happen on render.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActionQueue from "@/pages/ActionQueue";

const insertSpy = vi.fn();
const updateSpy = vi.fn();
const upsertSpy = vi.fn();
const deleteSpy = vi.fn();
const fetchSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (data: unknown[] = []) => {
    const result = { data, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: () => Promise.resolve(result),
      in: () => chain,
      contains: () => chain,
      insert: (...args: unknown[]) => {
        insertSpy(...args);
        return Promise.resolve({ data: null, error: null });
      },
      update: (...args: unknown[]) => {
        updateSpy(...args);
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
      upsert: (...args: unknown[]) => {
        upsertSpy(...args);
        return Promise.resolve({ data: null, error: null });
      },
      delete: (...args: unknown[]) => {
        deleteSpy(...args);
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
    };
    return chain;
  };
  return { supabase: { from: () => makeChain([]) } };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" } }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "G1" }],
    activeGrowId: "g1",
    activeGrow: { id: "g1", name: "G1" },
  }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: "/actions",
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  insertSpy.mockClear();
  updateSpy.mockClear();
  upsertSpy.mockClear();
  deleteSpy.mockClear();
  fetchSpy.mockClear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fetchSpy;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView = vi.fn();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/actions"]}>
      <ActionQueue />
    </MemoryRouter>,
  );
}

describe("/actions empty-state — One-Tent Loop next-step links", () => {
  it("renders the 'View Timeline' link to /timeline", async () => {
    renderPage();
    const link = await screen.findByTestId(
      "action-queue-empty-next-steps-timeline",
    );
    expect(link.getAttribute("href")).toBe("/timeline");
    expect(link.textContent).toBe("View Timeline");
  });

  it("renders the 'Add Sensor Snapshot' link to /sensors", async () => {
    renderPage();
    const link = await screen.findByTestId(
      "action-queue-empty-next-steps-sensors",
    );
    expect(link.getAttribute("href")).toBe("/sensors");
    expect(link.textContent).toBe("Add Sensor Snapshot");
  });

  it("explains the empty state in cautious, non-automation copy", async () => {
    renderPage();
    const block = await screen.findByTestId("action-queue-empty-next-steps");
    const text = block.textContent ?? "";
    expect(text).toContain(
      "Actions appear here after Verdant or the grower creates a review item.",
    );
    expect(text).toContain(
      "To create better recommendations, add timeline logs and sensor snapshots first.",
    );
    expect(text.toLowerCase()).not.toContain("automatically");
    expect(text.toLowerCase()).not.toContain("auto-approve");
  });

  it("preserves the existing approval-required safety copy", async () => {
    renderPage();
    await screen.findByTestId("action-queue-empty-next-steps");
    expect(
      screen.getByText(/Verdant never sends commands to equipment/i),
    ).toBeTruthy();
    expect(
      screen.getByTestId("one-tent-loop-action-queue-landing-title").textContent,
    ).toBe("Approval-required Action Queue");
  });

  it("does NOT trigger inserts/updates/upserts/deletes on render", async () => {
    renderPage();
    await screen.findByTestId("action-queue-empty-next-steps");
    expect(insertSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("does NOT trigger AI / network calls on render", async () => {
    renderPage();
    await screen.findByTestId("action-queue-empty-next-steps");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
