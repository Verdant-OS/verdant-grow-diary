/**
 * One-Tent Loop — Action Queue landing polish.
 *
 * Presenter-only. Confirms /actions clearly reads as the approval-required
 * Action Queue step. No Supabase writes, no AI calls, no automation copy,
 * no fake live data, no internal UUIDs surfaced.
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
  return {
    supabase: {
      from: () => makeChain([]),
    },
  };
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
  // Intercept any accidental network call (AI gateway, edge fns, etc).
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

// UUID v4-ish shape used as a defensive guard against accidental
// internal-ID leakage into visible copy.
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe("ActionQueue — One-Tent Loop landing polish", () => {
  it("renders the Approval-required Action Queue framing title", async () => {
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByTestId("one-tent-loop-action-queue-landing-title"),
      ).toBeTruthy(),
    );
    expect(
      screen.getByTestId("one-tent-loop-action-queue-landing-title").textContent,
    ).toBe("Approval-required Action Queue");
  });

  it("renders the cautious 'review before taking anything' subtitle", async () => {
    renderPage();
    const sub = await screen.findByTestId(
      "one-tent-loop-action-queue-landing-subtitle",
    );
    expect(sub.textContent).toBe(
      "Review suggested actions before taking anything into the grow room.",
    );
  });

  it("renders the 'Verdant suggests. Grower approves.' note", async () => {
    renderPage();
    const note = await screen.findByTestId(
      "one-tent-loop-action-queue-landing-note",
    );
    expect(note.textContent).toBe("Verdant suggests. Grower approves.");
  });

  it("renders the One-Tent Loop empty-state line when no pending actions", async () => {
    renderPage();
    const empty = await screen.findByTestId("one-tent-loop-action-queue-empty");
    expect(empty.textContent).toBe("No approval-required actions are pending.");
  });

  it("does not trigger any Supabase writes on render", async () => {
    renderPage();
    await screen.findByTestId("one-tent-loop-action-queue-landing");
    expect(insertSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("does not trigger any AI / network calls on render", async () => {
    renderPage();
    await screen.findByTestId("one-tent-loop-action-queue-landing");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("framing copy contains no device-control / automation wording", async () => {
    renderPage();
    const banner = await screen.findByTestId(
      "one-tent-loop-action-queue-landing",
    );
    const text = (banner.textContent ?? "").toLowerCase();
    for (const forbidden of [
      "auto-approve",
      "automatically approve",
      "auto execute",
      "auto-execute",
      "send command",
      "run device",
      "control hardware",
      "turn on",
      "turn off",
      "blind automation",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("framing copy contains no fake-live or 'healthy' implication", async () => {
    renderPage();
    const banner = await screen.findByTestId(
      "one-tent-loop-action-queue-landing",
    );
    const text = (banner.textContent ?? "").toLowerCase();
    expect(text).not.toContain("live readings");
    expect(text).not.toContain("everything is healthy");
    expect(text).not.toContain("all healthy");
  });

  it("framing copy does not surface internal UUID-shaped ids", async () => {
    renderPage();
    const banner = await screen.findByTestId(
      "one-tent-loop-action-queue-landing",
    );
    expect(UUID_RE.test(banner.textContent ?? "")).toBe(false);
  });
});
