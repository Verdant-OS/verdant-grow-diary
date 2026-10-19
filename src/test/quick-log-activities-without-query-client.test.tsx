/**
 * Activities section is mounted by tests that do not provide a QueryClient.
 * The archived-plant recheck must not require one just to render.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { startDailyCheckPlantArchiveDecision } from "@/lib/dailyCheckPlantSelectionRules";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";

describe("startDailyCheckPlantArchiveDecision", () => {
  it("stays ready and does not block when the plant query cannot start", () => {
    const started = startDailyCheckPlantArchiveDecision("p1", () => {
      throw new Error("no limit");
    });
    expect(started.ready).toBe(true);
    if (started.ready) expect(started.decision).toEqual({ block: false });
  });
});

describe("QuickLogAllActivitiesSection without a QueryClientProvider", () => {
  it("renders the activity picker", () => {
    render(<QuickLogAllActivitiesSection growId="g1" tentId="t1" plantId="p1" plantStage="veg" />);
    expect(screen.getByRole("button", { name: "More activity types" })).toBeInTheDocument();
  });
});
