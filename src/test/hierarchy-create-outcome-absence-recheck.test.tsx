import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY,
  recordHierarchyCreateOutcomeRecoveryAttempt,
} from "@/lib/hierarchyCreateOutcomeRecovery";

const IDS = {
  owner: "11111111-1111-4111-8111-111111111111",
  grow: "22222222-2222-4222-8222-222222222222",
  tent: "33333333-3333-4333-8333-333333333333",
  plant: "44444444-4444-4444-8444-444444444444",
} as const;

const PLANT_ATTEMPT = {
  entity: "plant" as const,
  rowId: IDS.plant,
  ownerId: IDS.owner,
  growId: IDS.grow,
  tentId: IDS.tent,
};

const ABSENT_PLANT = "Verdant confirmed your last plant was not saved. You can create another.";
const UNAVAILABLE_PLANT =
  "Verdant could not confirm whether your last plant was saved. Creating another stays paused. Verdant will check again when this tab is online and visible.";

type ExactRead = { data: Record<string, unknown> | null; error: { message: string } | null };

const state = vi.hoisted(() => ({
  reads: [] as ExactRead[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from() {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        maybeSingle() {
          const next = state.reads.shift();
          if (!next) throw new Error("missing mocked exact read");
          return Promise.resolve(next);
        },
      };
      return query;
    },
  },
}));

import { HierarchyCreateOutcomeRecoveryCoordinator } from "@/hooks/useHierarchyCreateOutcomeRecoveryCoordinator";

function storedAttempts(): readonly { entity?: string; runtimeEpoch?: string | null }[] {
  const raw = window.sessionStorage.getItem(HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as {
    attempts?: readonly { entity?: string; runtimeEpoch?: string | null }[];
  };
  return parsed.attempts ?? [];
}

function seedPriorPlantAttempt(): void {
  window.sessionStorage.setItem(
    HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      attempts: [{ ...PLANT_ATTEMPT, runtimeEpoch: "prior-page-runtime" }],
    }),
  );
}

function renderCoordinator() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const refreshGrowsForRecovery = vi.fn(async () => ({ status: "not_visible" as const }));
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  }
  render(
    createElement(HierarchyCreateOutcomeRecoveryCoordinator, {
      ownerId: IDS.owner,
      refreshGrowsForRecovery,
    }),
    { wrapper: Wrapper },
  );
  return { refreshGrowsForRecovery };
}

describe("hierarchy create outcome absence recheck", () => {
  let visibilityState: DocumentVisibilityState;

  beforeEach(() => {
    state.reads = [];
    visibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
  });

  it("clears a prior-runtime plant fence when the server confirms the plant does not exist", async () => {
    seedPriorPlantAttempt();
    state.reads.push({ data: null, error: null });

    renderCoordinator();

    await waitFor(() => {
      expect(screen.getByTestId("hierarchy-create-outcome-recovery-notice")).toHaveTextContent(
        ABSENT_PLANT,
      );
    });
    expect(storedAttempts()).toEqual([]);
    expect(screen.getByRole("status").textContent).toBe(ABSENT_PLANT);
  });

  it("keeps the fence while the server is unreachable, then clears it on window online", async () => {
    seedPriorPlantAttempt();
    state.reads.push({ data: null, error: { message: "offline" } }, { data: null, error: null });

    renderCoordinator();

    await waitFor(() => {
      expect(screen.getByTestId("hierarchy-create-outcome-recovery-notice")).toHaveTextContent(
        UNAVAILABLE_PLANT,
      );
    });
    expect(storedAttempts()).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("hierarchy-create-outcome-recovery-notice")).toHaveTextContent(
        ABSENT_PLANT,
      );
    });
    expect(storedAttempts()).toEqual([]);
  });

  it("rechecks when the document becomes visible and skips the check while it is hidden", async () => {
    seedPriorPlantAttempt();
    state.reads.push({ data: null, error: { message: "offline" } }, { data: null, error: null });

    renderCoordinator();

    await waitFor(() => {
      expect(screen.getByTestId("hierarchy-create-outcome-recovery-notice")).toHaveTextContent(
        UNAVAILABLE_PLANT,
      );
    });

    visibilityState = "hidden";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(storedAttempts()).toHaveLength(1);
    expect(screen.getByTestId("hierarchy-create-outcome-recovery-notice")).toHaveTextContent(
      UNAVAILABLE_PLANT,
    );
    expect(state.reads).toHaveLength(1);

    visibilityState = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(storedAttempts()).toEqual([]);
    });
    expect(screen.getByTestId("hierarchy-create-outcome-recovery-notice")).toHaveTextContent(
      ABSENT_PLANT,
    );
  });

  it("does not clear a same-runtime plant fence when the server reports no row", async () => {
    recordHierarchyCreateOutcomeRecoveryAttempt(PLANT_ATTEMPT);
    state.reads.push({ data: null, error: null });

    renderCoordinator();

    await act(async () => {
      await Promise.resolve();
    });

    expect(storedAttempts()).toHaveLength(1);
    expect(state.reads).toHaveLength(1);
    expect(screen.queryByTestId("hierarchy-create-outcome-recovery-notice")).toBeNull();
  });
});
