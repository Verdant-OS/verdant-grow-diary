/**
 * Breeding log new — grow-scoped navigation render pins.
 *
 * Follow-up to GDP-BREEDING-NAV-GROWID-001 / grow-detail-secondary-nav (#1605).
 * Grow Detail wires `/breeding/log/new?growId=`; these pins prove the log page
 * keeps that grow on back, empty-plant CTA, and post-save/cancel navigation.
 * Fail closed: missing growId stays on bare `/grows`.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import { logsPath } from "@/lib/routes";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";

const from = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from },
}));

const containerCallbacks = vi.hoisted(() => ({
  onCreated: null as (() => void) | null,
  onCancel: null as (() => void) | null,
}));

vi.mock("@/components/genetics/BreedingLogContainer", () => ({
  BreedingLogContainer: (props: { onCreated: () => void; onCancel: () => void }) => {
    containerCallbacks.onCreated = props.onCreated;
    containerCallbacks.onCancel = props.onCancel;
    return (
      <div data-testid="breeding-log-container-mock">
        <button type="button" data-testid="breeding-log-mock-created" onClick={props.onCreated}>
          Mock created
        </button>
        <button type="button" data-testid="breeding-log-mock-cancel" onClick={props.onCancel}>
          Mock cancel
        </button>
      </div>
    );
  },
}));

import BreedingLogNew from "@/pages/BreedingLogNew";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="nav-location">{`${loc.pathname}${loc.search}`}</div>;
}

function hrefForLink(name: string | RegExp): string | null {
  const link = screen.getByRole("link", { name });
  return link.getAttribute("href");
}

function mockSupabaseWithGrow(plants: Array<{ id: string; name: string; tent_id: string | null }>) {
  from.mockReset().mockImplementation((table: string) => {
    if (table === "tents") {
      return {
        select: () => ({
          eq: async () => ({ data: [{ id: "tent-1" }], error: null }),
        }),
      };
    }
    if (table === "grows") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: GROW, name: "North Tent Grow" },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "plants") {
      return {
        select: () => ({
          or: () => ({
            eq: async () => ({ data: plants, error: null }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

function renderLogNew(initialEntry: string, withProbe = false) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      {withProbe ? <LocationProbe /> : null}
      <BreedingLogNew />
    </MemoryRouter>,
  );
}

describe("BreedingLogNew grow-scoped navigation", () => {
  beforeEach(() => {
    containerCallbacks.onCreated = null;
    containerCallbacks.onCancel = null;
  });

  it("Back link retains growId when ?growId= is present", async () => {
    mockSupabaseWithGrow([{ id: "plant-1", name: "Mother", tent_id: "tent-1" }]);
    renderLogNew(`/breeding/log/new?growId=${GROW}`);

    await screen.findByRole("heading", { name: "Log Breeding Event" });
    expect(hrefForLink(/^Back$/)).toBe(`/grows/${GROW}`);
  });

  it("empty-plant CTA links back to the scoped grow", async () => {
    mockSupabaseWithGrow([]);
    renderLogNew(`/breeding/log/new?growId=${GROW}`);

    const cta = await screen.findByTestId("breeding-empty-cta");
    expect(cta).toHaveAttribute("href", `/grows/${GROW}`);
  });

  it("post-create navigation lands on grow-scoped timeline", async () => {
    mockSupabaseWithGrow([{ id: "plant-1", name: "Mother", tent_id: "tent-1" }]);
    const user = userEvent.setup();
    renderLogNew(`/breeding/log/new?growId=${GROW}`, true);

    await screen.findByTestId("breeding-log-container-mock");
    await user.click(screen.getByTestId("breeding-log-mock-created"));

    await waitFor(() => {
      expect(screen.getByTestId("nav-location")).toHaveTextContent(logsPath(GROW));
    });
  });

  it("cancel navigation returns to the scoped grow detail", async () => {
    mockSupabaseWithGrow([{ id: "plant-1", name: "Mother", tent_id: "tent-1" }]);
    const user = userEvent.setup();
    renderLogNew(`/breeding/log/new?growId=${GROW}`, true);

    await screen.findByTestId("breeding-log-container-mock");
    await user.click(screen.getByTestId("breeding-log-mock-cancel"));

    await waitFor(() => {
      expect(screen.getByTestId("nav-location")).toHaveTextContent(`/grows/${GROW}`);
    });
  });

  it("fail-closed without growId keeps Back on bare /grows", async () => {
    from.mockReset();
    renderLogNew("/breeding/log/new");

    await screen.findByRole("heading", { name: "Grow not found" });
    expect(hrefForLink(/^Back$/)).toBe("/grows");
  });

  it("fail-closed: empty growId query stays on /grows", async () => {
    from.mockReset();
    renderLogNew("/breeding/log/new?growId=");

    await screen.findByRole("heading", { name: "Grow not found" });
    expect(hrefForLink(/^Back$/)).toBe("/grows");
  });

  it("fail-closed: whitespace growId does not invent a grow", async () => {
    from.mockReset().mockImplementation((table: string) => {
      if (table === "tents") {
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        };
      }
      if (table === "grows") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === "plants") {
        return {
          select: () => ({
            or: () => ({
              eq: async () => ({ data: [], error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    renderLogNew("/breeding/log/new?growId=%20");

    await screen.findByRole("heading", { name: "Grow not found" });
    expect(hrefForLink(/^Back$/)).toBe("/grows");
  });
});
