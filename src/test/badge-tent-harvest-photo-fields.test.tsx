/**
 * Tent and harvest photo fields for owner badges.
 * A photo is optional. Saving with no file still persists the row.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";

const eqMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: eqMock }));
const insertMock = vi.fn();
const singleMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const insert = (...args: unknown[]) => {
        insertMock(table, ...args);
        return { select: () => ({ single: singleMock }) };
      };
      if (table === "tents") {
        return { update: updateMock, insert };
      }
      return { insert };
    },
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: {
      from: () => ({
        upload: vi.fn(),
        remove: vi.fn(),
      }),
    },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const growsState = vi.hoisted(() => ({
  grows: [{ id: "grow-1", name: "Room" }] as Array<{ id: string; name: string }>,
  activeGrowId: "grow-1" as string | null,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => growsState,
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: { multiTent: true } },
  }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({
  trackFunnelEvent: vi.fn(),
}));

import CreateTentDialog from "@/components/CreateTentDialog";
import EditTentDialog from "@/components/EditTentDialog";

const tent = {
  id: "tent-1",
  name: "Fixture Tent",
  brand: "Gorilla",
  size: "4x4",
  stage: "seedling",
  light: { on: true, schedule: "18/6", wattage: 240 },
};

function withClient(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("badge tent and harvest photo fields", () => {
  beforeEach(() => {
    eqMock.mockReset();
    updateMock.mockClear();
    insertMock.mockReset();
    singleMock.mockReset();
    rpcMock.mockReset();
    eqMock.mockResolvedValue({ error: null });
    singleMock.mockResolvedValue({
      data: { id: "tent-new", name: "Tent #1", grow_id: "grow-1" },
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000200" },
      error: null,
    });
  });

  it("renders an optional photo on create tent and saves without one", async () => {
    render(withClient(<CreateTentDialog initiallyOpen defaultGrowId="grow-1" />));
    expect(screen.getByTestId("create-tent-photo")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Tent #1"), {
      target: { value: "Tent #1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create tent|save/i }));
    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    const payload = insertMock.mock.calls[0]?.[1] as { photo_url?: string };
    expect(payload.photo_url ?? null).toBeNull();
  });

  it("renders an optional photo on edit tent and saves without one", async () => {
    render(withClient(<EditTentDialog tent={tent} />));
    fireEvent.click(screen.getByTestId("edit-tent-trigger"));
    expect(screen.getByTestId("edit-tent-photo")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("edit-tent-submit"));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const payload = (updateMock.mock.calls as unknown as Array<[{ photo_url?: string }]>)[0]?.[0];
    expect(payload.photo_url).toBeUndefined();
  });

  it("renders an optional harvest photo and saves the harvest form without one", async () => {
    render(
      withClient(
        <QuickLogAllActivitiesSection
          growId="grow-1"
          tentId="tent-1"
          plantId="plant-1"
          plantStage="flower"
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "More activity types" }));
    fireEvent.click(screen.getByTestId("quick-log-all-activities-picker-harvest"));
    expect(await screen.findByTestId("quick-log-all-activities-harvest-photo")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(insertMock).not.toHaveBeenCalled();
  });
});
