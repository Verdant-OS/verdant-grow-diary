/**
 * Grow Lineage Repair — empty-state guidance tests.
 *
 * Verify the empty state surfaces a grower-friendly heading + first-step
 * guidance, never raw IDs, debug JSON, or implications of automatic
 * repair. Uses a Supabase mock so the page renders with zero orphan tents.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = (data: unknown[]) => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      is: () => b,
      order: () => Promise.resolve({ data, error: null }),
    };
    return b;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "tents") return builder([]);
        if (table === "grows") return builder([{ id: "g-1", name: "My Grow" }]);
        return builder([]);
      },
    },
  };
});

import GrowLineageRepair from "@/pages/GrowLineageRepair";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GrowLineageRepair — empty state", () => {
  it("renders a clear heading and grower-facing first-step guidance", async () => {
    render(
      <MemoryRouter>
        <GrowLineageRepair />
      </MemoryRouter>,
    );
    const empty = await waitFor(() => screen.getByTestId("grow-lineage-empty-state"));
    expect(empty.textContent).toMatch(/No lineage repairs needed/i);
    const firstStep = screen.getByTestId("grow-lineage-empty-state-first-step")
      .textContent ?? "";
    expect(firstStep).toMatch(/Harvest Archive/);
    expect(firstStep).toMatch(/approval/i);
  });

  it("does not render raw UUIDs or debug JSON in the empty state", async () => {
    render(
      <MemoryRouter>
        <GrowLineageRepair />
      </MemoryRouter>,
    );
    const empty = await waitFor(() => screen.getByTestId("grow-lineage-empty-state"));
    const txt = empty.textContent ?? "";
    expect(txt).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(txt).not.toMatch(/service_role|raw_payload|RLS|JWT/i);
  });

  it("does not imply automatic repair", async () => {
    render(
      <MemoryRouter>
        <GrowLineageRepair />
      </MemoryRouter>,
    );
    const empty = await waitFor(() => screen.getByTestId("grow-lineage-empty-state"));
    const txt = (empty.textContent ?? "").toLowerCase();
    expect(txt).not.toMatch(/automatically (fix|repair|reconnect)/);
    expect(txt).toMatch(/never changes lineage automatically/);
  });
});
