import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "@/lib/react-router-compat";
import AppShell from "@/components/AppShell";
import Sensors from "@/pages/Sensors";
import { clearPrivateClientStateBeforeAuthIdentityChange } from "@/lib/authIdentityTransitionFence";

const TENT_A = "11111111-1111-4111-8111-111111111111";
const TENT_B = "22222222-2222-4222-8222-222222222222";
const REQUIRED_A = `/sensors?tentId=${TENT_A}&tentIntent=required#manual-reading`;
const DEEP_LINK_B = `/sensors?tentId=${TENT_B}`;
const state = vi.hoisted(() => ({
  owner: "owner-a" as string | null,
  getUser: vi.fn(),
  insert: vi.fn(),
  readScope: vi.fn(),
  tents: [
    { id: "11111111-1111-4111-8111-111111111111", name: "Tent A", growId: "grow-a" },
    { id: "22222222-2222-4222-8222-222222222222", name: "Tent B", growId: "grow-b" },
  ],
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: state.owner ? { id: state.owner, email_confirmed_at: "2026-09-01" } : null,
    loading: false,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => state.getUser(), signOut: vi.fn() },
    from: () => {
      throw new Error("Unexpected backend call in Sensors continuity fixture");
    },
  },
}));
// AppShell and useRequireAuth are real: only unrelated shell chrome/data are stubbed.
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: { isActive: true, effectivePlanId: "pro" },
  }),
}));
vi.mock("@/hooks/useAlertsList", () => ({ useAlertsList: () => ({ alerts: [] }) }));
vi.mock("@/hooks/useCheckoutReturnCompletionTracking", () => ({
  useCheckoutReturnCompletionTracking: () => undefined,
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SidebarTrigger: () => null,
}));
vi.mock("@/components/AppSidebar", () => ({ default: () => null }));
vi.mock("@/components/MobileNav", () => ({ default: () => null }));
vi.mock("@/components/AuthStatusIndicator", () => ({ default: () => null }));
vi.mock("@/components/SignOutConfirmDialog", () => ({ default: () => null }));
vi.mock("@/components/VerificationPendingBanner", () => ({ default: () => null }));
vi.mock("@/components/SubscriptionPastDueBanner", () => ({
  SubscriptionPastDueBanner: () => null,
}));
vi.mock("@/components/GlobalSearchDialog", () => ({ default: () => null }));
vi.mock("@/components/LegalFooterLinks", () => ({ default: () => null }));
vi.mock("@/components/BrandLogo", () => ({ default: () => null }));
vi.mock("@/components/QuickLog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Sheet", () => ({ default: () => null }));

// The Sensors page reads active plants for its stage (BUG-006 follow-up).
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: [], isError: false }) }));
vi.mock("@/hooks/useGrowData", () => ({
  clearGrowDataMeta: vi.fn(),
  useGrowTents: () => ({ data: state.tents, isSuccess: true, isError: false, isLoading: false }),
  useGrowSensorReadings: (tentId: string | null) => {
    state.readScope(tentId);
    return { data: [], isLoading: false, isError: false, refetch: vi.fn() };
  },
}));
vi.mock("@/hooks/useSensorsQuickLogManualReadings", () => ({
  useSensorsQuickLogManualReadings: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useSoilMoistureCalibrations", () => ({
  useSoilMoistureCalibrations: () => ({
    data: [],
    availability: "available",
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({ status: "denied", granted: false, error: null }),
}));
vi.mock("@/hooks/useEcowittIngestAuditProofRows", () => ({
  useEcowittIngestAuditProofRows: () => ({ status: "idle", rows: [] }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
vi.mock("@/hooks/useInsertSensorReading", () => ({
  useInsertSensorReading: () => ({ mutateAsync: state.insert, isPending: false }),
}));
vi.mock("@/hooks/useInsertSensorReadings", () => ({
  useInsertSensorReadings: () => ({ mutateAsync: state.insert, isPending: false }),
}));
vi.mock("@/components/EnvironmentCsvImportLauncher", () => ({ default: () => null }));
vi.mock("@/components/SensorBridgeHealthCard", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/SensorsTestbenchPanel", () => ({ default: () => null }));
vi.mock("@/components/ManualSensorTrendChart", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}
type AuthResult = {
  data: { user: { id: string | null } | null };
  error: { message: string } | null;
};
const authenticated = (): AuthResult => ({ data: { user: { id: state.owner } }, error: null });

function RouteControls() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <output data-testid="fixture-location">
        {location.pathname}
        {location.search}
        {location.hash}
      </output>
      <button onClick={() => navigate("/sensors")}>Ordinary Sensors route</button>
      <button onClick={() => navigate(REQUIRED_A)}>Required Tent A route</button>
      <button onClick={() => navigate(-1)}>Browser Back</button>
    </>
  );
}

function renderProtectedSensors(initialEntry: string = REQUIRED_A) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <RouteControls />
        <AppShell>
          <Sensors />
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { ...view, client, refreshOwner: () => view.rerender(tree()) };
}

async function expectTarget(name: "A" | "B") {
  await waitFor(() =>
    expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent(
      `Saving to: Tent ${name}`,
    ),
  );
}

async function pauseOrdinaryRoute() {
  const gate = deferred<ReturnType<typeof authenticated>>();
  const calls = state.getUser.mock.calls.length;
  state.getUser.mockReturnValueOnce(gate.promise);
  fireEvent.click(screen.getByRole("button", { name: "Ordinary Sensors route" }));
  await waitFor(() => expect(state.getUser).toHaveBeenCalledTimes(calls + 1));
  await waitFor(() =>
    expect(screen.queryByTestId("manual-reading-tent-row")).not.toBeInTheDocument(),
  );
  expect(screen.getByText("Loading…")).toBeInTheDocument();
  expect(screen.queryByLabelText(/Humidity/i)).not.toBeInTheDocument();
  return gate;
}

beforeEach(() => {
  state.owner = "owner-a";
  state.getUser.mockReset().mockImplementation(async () => authenticated());
  state.insert.mockReset().mockResolvedValue(undefined);
  state.readScope.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

describe("Sensors continuity through the real protected auth remount", () => {
  it("preserves a conscious page Tent B choice and humidity across auth loading, but new required A clears B values", async () => {
    renderProtectedSensors();
    await expectTarget("A");
    fireEvent.click(screen.getByRole("button", { name: "Tent B" }));
    await expectTarget("B");
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "57" } });
    const pending = await pauseOrdinaryRoute();
    await act(async () => pending.resolve(authenticated()));
    await expectTarget("B");
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(57);
    fireEvent.click(screen.getByRole("button", { name: "Required Tent A route" }));
    await expectTarget("A");
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(null);
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("keeps the protected form absent when route revalidation fails", async () => {
    renderProtectedSensors();
    await expectTarget("A");
    const pending = await pauseOrdinaryRoute();
    await act(async () =>
      pending.resolve({ data: { user: null }, error: { message: "Auth offline" } }),
    );
    expect(await screen.findByTestId("app-shell-revalidation-failed")).toBeInTheDocument();
    expect(screen.queryByTestId("manual-reading-tent-row")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Humidity/i)).not.toBeInTheDocument();
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("preserves a humidity draft through transport revalidation and Retry recovery", async () => {
    renderProtectedSensors();
    await expectTarget("A");
    fireEvent.click(screen.getByRole("button", { name: "Tent B" }));
    await expectTarget("B");
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "57" } });
    const pending = await pauseOrdinaryRoute();
    await act(async () =>
      pending.resolve({ data: { user: null }, error: { message: "upstream unavailable" } }),
    );
    expect(await screen.findByTestId("app-shell-revalidation-failed")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Humidity/i)).not.toBeInTheDocument();
    state.getUser.mockImplementation(async () => authenticated());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await expectTarget("B");
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(57);
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("honours a tentId deep link after auth loading without reverting to tent A", async () => {
    const gate = deferred<AuthResult>();
    state.getUser.mockReturnValueOnce(gate.promise);
    renderProtectedSensors(DEEP_LINK_B);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByTestId("manual-reading-tent-row")).not.toBeInTheDocument();
    await act(async () => gate.resolve(authenticated()));
    await expectTarget("B");
    expect(state.readScope).toHaveBeenLastCalledWith(TENT_B);
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("treats Browser Back to required A as a new exact target after preserving B on the ordinary route", async () => {
    renderProtectedSensors();
    await expectTarget("A");
    fireEvent.click(screen.getByRole("button", { name: "Tent B" }));
    await expectTarget("B");
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "57" } });
    const pending = await pauseOrdinaryRoute();
    await act(async () => pending.resolve(authenticated()));
    await expectTarget("B");
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(57);
    fireEvent.click(screen.getByRole("button", { name: "Browser Back" }));
    await expectTarget("A");
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(null);
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("preserves the card's independent Tent B dropdown while the page remains on Tent A", async () => {
    renderProtectedSensors();
    await expectTarget("A");
    fireEvent.keyDown(screen.getByTestId("manual-reading-tent-select"), { key: "ArrowDown" });
    fireEvent.click(await screen.findByTestId(`manual-reading-tent-option-${TENT_B}`));
    await expectTarget("B");
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "57" } });
    const pending = await pauseOrdinaryRoute();
    await act(async () => pending.resolve(authenticated()));
    await expectTarget("B");
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(57);
    expect(state.readScope).toHaveBeenLastCalledWith(TENT_A);
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("clears private values on sign-out and a late save cannot restore them for another owner", async () => {
    const pendingSave = deferred<void>();
    state.insert.mockReturnValueOnce(pendingSave.promise);
    const view = renderProtectedSensors();
    await expectTarget("A");
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "57" } });
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
    await waitFor(() => expect(state.insert).toHaveBeenCalledTimes(1));

    act(() => {
      clearPrivateClientStateBeforeAuthIdentityChange(view.client);
      state.owner = null;
      view.refreshOwner();
    });
    await waitFor(() => expect(screen.queryByLabelText(/Humidity/i)).not.toBeInTheDocument());
    expect(view.client.getQueryCache().getAll()).toHaveLength(0);
    await act(async () => pendingSave.resolve());
    expect(view.client.getQueryCache().getAll()).toHaveLength(0);

    state.owner = "owner-b";
    view.refreshOwner();
    fireEvent.click(screen.getByRole("button", { name: "Required Tent A route" }));
    await expectTarget("A");
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(null);
    expect(screen.queryByTestId("manual-reading-saved-confirmation")).not.toBeInTheDocument();
    expect(screen.queryByTestId("manual-reading-save-unconfirmed")).not.toBeInTheDocument();
    expect(state.insert).toHaveBeenCalledTimes(1);
  });
});
