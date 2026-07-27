import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from },
}));

vi.mock("@/components/genetics/BreedingLogContainer", () => ({
  BreedingLogContainer: () => null,
}));

import BreedingLogNew from "@/pages/BreedingLogNew";

describe("BreedingLogNew Action Queue copy", () => {
  beforeEach(() => {
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
                data: { id: "grow-1", name: "North Tent Grow" },
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
              eq: async () => ({
                data: [{ id: "plant-1", name: "Mother", tent_id: "tent-1" }],
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("states that approval-required suggestions are optional, selected, and non-controlling", async () => {
    render(
      <MemoryRouter
        initialEntries={["/breeding/log/new?growId=grow-1"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <BreedingLogNew />
      </MemoryRouter>,
    );

    const heading = await screen.findByRole("heading", { name: "Log Breeding Event" });
    const header = heading.closest("header");

    expect(header).toHaveTextContent(
      "Action Queue follow-up suggestions are optional and created only when you select them.",
    );
    expect(header).toHaveTextContent(
      "Every suggestion is approval-required; Verdant never controls devices.",
    );
    expect(header).not.toHaveTextContent("Verdant will suggest");
  });
});
