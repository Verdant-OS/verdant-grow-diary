/**
 * Activities section is mounted by tests that do not provide a QueryClient.
 * The archived-plant recheck must not require one just to render, and only
 * Daily Check registers it: other surfaces run no archive read.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  activeDailyCheckPlantArchiveSaveGuard,
  registerDailyCheckPlantArchiveSaveGuard,
} from "@/lib/dailyCheckPlantArchiveSaveGuard";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";

describe("Daily Check archive save guard registry", () => {
  it("has no guard until Daily Check registers one, and clears only its own", async () => {
    expect(activeDailyCheckPlantArchiveSaveGuard()).toBeNull();
    const first = vi.fn(async () => ({ block: false }) as const);
    const second = vi.fn(async () => ({ block: false }) as const);
    const unregisterFirst = registerDailyCheckPlantArchiveSaveGuard(first);
    expect(activeDailyCheckPlantArchiveSaveGuard()).toBe(first);
    const unregisterSecond = registerDailyCheckPlantArchiveSaveGuard(second);
    unregisterFirst();
    expect(activeDailyCheckPlantArchiveSaveGuard()).toBe(second);
    unregisterSecond();
    expect(activeDailyCheckPlantArchiveSaveGuard()).toBeNull();
  });
});

describe("QuickLogAllActivitiesSection without a QueryClientProvider", () => {
  it("renders the activity picker", () => {
    render(<QuickLogAllActivitiesSection growId="g1" tentId="t1" plantId="p1" plantStage="veg" />);
    expect(screen.getByRole("button", { name: "More activity types" })).toBeInTheDocument();
  });
});
