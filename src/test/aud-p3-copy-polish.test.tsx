/**
 * AUD-P3 copy polish render tests. Confirms the three audit items rendered
 * the new helper copy without changing runtime behavior:
 *   1. Bridge token card — shown once, store securely, revoke if exposed
 *   2. Sensor Source Health — source-only states, stale threshold in plain language
 *   3. Settings page — shipped controls remain actionable and capability-true
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock("@/integrations/supabase/client", () => {
  // Durable chainable query mock: every builder method returns the chain,
  // awaiting the chain resolves an empty list, and maybeSingle/single
  // resolve null rows. Survives chain reshuffles (e.g. useMyEntitlements
  // now reads billing_subscriptions AND subscriptions with
  // .eq().eq().order().limit().maybeSingle()).
  const makeQuery = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {};
    for (const m of ["select", "eq", "neq", "not", "in", "order", "limit", "range", "gte", "lte"]) {
      q[m] = () => q;
    }
    q.maybeSingle = async () => ({ data: null, error: null });
    q.single = async () => ({ data: null, error: null });
    q.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(onFulfilled);
    return q;
  };
  return {
    supabase: {
      from: () => makeQuery(),
      functions: { invoke: async () => ({ data: { ok: true }, error: null }) },
    },
  };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { email: "grower@example.com" }, signOut: vi.fn() }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { displayPlanId: "free", status: "active", isStaff: false },
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePaddleCancelNotice", () => ({
  usePaddleCancelNotice: () => ({
    visible: false,
    accessUntilIso: null,
    accessUntilLabel: "",
    reason: null,
  }),
}));

vi.mock("@/components/RewardedReferralCard", () => ({
  default: () => <div data-testid="rewarded-referral-card-stub">Referral card</div>,
}));

// Return a STABLE toast identity. A fresh `{ toast: vi.fn() }` on every render
// changes `toast`'s identity each render, which can spin an unbounded re-render
// loop in any component whose effect depends on a toast-derived callback (this
// OOMed the CI full-suite worker via ecowitt-bridge-status-page). Preventive.
const { toastApi } = vi.hoisted(() => ({ toastApi: { toast: vi.fn() } }));
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => toastApi,
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
  it("keeps every rendered tile actionable without placeholder states", () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );
    const tiles = screen.getAllByTestId("settings-tile");
    const states = tiles.map((t) => t.getAttribute("data-tile-state"));
    expect(new Set(states)).toEqual(new Set(["available"]));

    // Profile is available and live
    const profile = tiles.find((t) => within(t).queryByText("Profile"));
    expect(profile).toBeTruthy();
    expect(within(profile!).getByTestId("settings-tile-helper")).toHaveTextContent(/live/i);

    const notifications = tiles.find((t) => within(t).queryByText("Notifications"));
    expect(notifications).toBeTruthy();
    expect(within(notifications!).getByRole("link", { name: "Open alerts" })).toHaveAttribute(
      "href",
      "/alerts",
    );
    expect(notifications).not.toHaveTextContent(/email/i);

    const integrations = tiles.find((t) => within(t).queryByText("Sensor integrations"));
    expect(integrations).toBeTruthy();
    expect(within(integrations!).getByRole("link", { name: "Open sensor data" })).toHaveAttribute(
      "href",
      "/sensors",
    );
    expect(integrations).toHaveTextContent(/source-labeled sensor readings/i);
  });
});
