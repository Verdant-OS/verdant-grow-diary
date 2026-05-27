/**
 * AUD-P3 copy polish render tests. Confirms the three audit items rendered
 * the new helper copy without changing runtime behavior:
 *   1. Bridge token card — shown once, store securely, revoke if exposed
 *   2. Sensor Source Health — source-only states, stale threshold in plain language
 *   3. Settings page — available / coming soon / not configured tiles
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ order: async () => ({ data: [], error: null }) }),
      }),
    }),
    functions: { invoke: async () => ({ data: { ok: true }, error: null }) },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { email: "grower@example.com" }, signOut: vi.fn() }),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import TentBridgeTokensCard from "@/components/TentBridgeTokensCard";
import TentSensorSourceHealthCard from "@/components/TentSensorSourceHealthCard";
import Settings from "@/pages/Settings";

describe("AUD-P3 bridge token copy", () => {
  it("explains shown-once, secure storage, and revoke-if-exposed", () => {
    render(<TentBridgeTokensCard tentId="tent-1" />);
    const helper = screen.getByTestId("bridge-token-security-helper");
    expect(helper).toHaveTextContent(/shown once/i);
    expect(helper.textContent ?? "").toMatch(/store .* secure|secrets vault|password manager/i);
    expect(helper).toHaveTextContent(/revoke/i);
    expect(helper).toHaveTextContent(/exposed|leaks?|logs/i);
  });

  it("recommends bridge tokens for long-running clients", () => {
    render(<TentBridgeTokensCard tentId="tent-1" />);
    expect(screen.getByText(/long-running/i)).toBeInTheDocument();
  });
});

describe("AUD-P3 sensor source health copy", () => {
  it("clarifies the states are source-only and plain-language stale threshold", () => {
    render(<TentSensorSourceHealthCard tentId="tent-1" />);
    const helper = screen.getByTestId("sensor-source-health-helper");
    expect(helper).toHaveTextContent(/source connection only/i);
    expect(helper).toHaveTextContent(/not the plant or environment/i);
    expect(helper).toHaveTextContent(/stale after/i);
    expect(helper).toHaveTextContent(/does not mean the tent is unhealthy/i);
  });
});

describe("AUD-P3 settings tile copy", () => {
  it("distinguishes available, coming-soon, and not-configured tiles", () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );
    const tiles = screen.getAllByTestId("settings-tile");
    const states = tiles.map((t) => t.getAttribute("data-tile-state"));
    expect(states).toContain("available");
    expect(states).toContain("coming_soon");
    expect(states).toContain("disabled");

    // Profile is available and live
    const profile = tiles.find((t) => within(t).queryByText("Profile"));
    expect(profile).toBeTruthy();
    expect(within(profile!).getByTestId("settings-tile-helper")).toHaveTextContent(/live/i);

    // Integrations tile no longer mislabels everything as "soon"
    const integrations = tiles.find((t) => within(t).queryByText("Integrations"));
    expect(integrations).toBeTruthy();
    expect(integrations!.textContent ?? "").not.toMatch(/· soon/);
    expect(within(integrations!).getByTestId("settings-tile-helper")).toHaveTextContent(
      /not connected|no data/i,
    );
  });
});
