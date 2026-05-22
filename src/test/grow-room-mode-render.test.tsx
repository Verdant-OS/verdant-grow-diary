/**
 * Grow-Room Mode lightweight page-render smoke test.
 * Confirms the page mounts without throwing when data hooks return empty.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const EMPTY_TENTS: never[] = [];
const EMPTY_ALERTS: never[] = [];

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: EMPTY_TENTS, isLoading: false, error: null }),
}));

vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ alerts: EMPTY_ALERTS, isLoading: false, error: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
        order: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
        limit: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

import GrowRoomMode from "@/pages/GrowRoomMode";

describe("GrowRoomMode page render smoke", () => {
  it("mounts without throwing and shows the header", () => {
    render(
      <MemoryRouter>
        <GrowRoomMode />
      </MemoryRouter>,
    );
    expect(screen.getByText(/grow.?room/i)).toBeInTheDocument();
  });
});
