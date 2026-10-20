/**
 * #2258 review (Copilot r4319096900, r4319096944): the reconciled mark is
 * runtime-global, so a coordinator remount or an effect rerun must not leave
 * a prior-runtime attempt marked with nobody able to retry it.
 */
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY } from "@/lib/hierarchyCreateOutcomeRecovery";
import type { HierarchyCreateVisibleListReceipt } from "@/hooks/useHierarchyCreateOutcomeRecoveryCoordinator";

const IDS = {
  owner: "11111111-1111-4111-8111-111111111111",
  grow: "22222222-2222-4222-8222-222222222222",
  tent: "33333333-3333-4333-8333-333333333333",
  plant: "55555555-5555-4555-8555-555555555555",
} as const;

type ExactRead = { data: Record<string, unknown> | null; error: { message: string } | null };

const state = vi.hoisted(() => ({ reads: [] as ExactRead[] }));

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

function storedAttempts(): readonly unknown[] {
  const raw = window.sessionStorage.getItem(HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY);
  return raw ? ((JSON.parse(raw) as { attempts?: unknown[] }).attempts ?? []) : [];
}

function seedPriorAttempt(attempt: Record<string, unknown>): void {
  window.sessionStorage.setItem(
    HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY,
    JSON.stringify({ version: 1, attempts: [{ ...attempt, runtimeEpoch: "prior-page-runtime" }] }),
  );
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client }, children);
}

describe("hierarchy create outcome recovery across remounts", () => {
  beforeEach(() => {
    state.reads = [];
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  it("keeps an unreachable attempt retryable after the coordinator unmounts and remounts", async () => {
    seedPriorAttempt({
      entity: "plant",
      rowId: IDS.plant,
      ownerId: IDS.owner,
      growId: IDS.grow,
      tentId: IDS.tent,
    });
    const offline = { data: null, error: { message: "offline" } };
    state.reads.push(offline, offline, { data: null, error: null });
    const props = {
      ownerId: IDS.owner,
      refreshGrowsForRecovery: vi.fn(async () => ({ status: "not_visible" as const })),
    };

    const first = render(createElement(HierarchyCreateOutcomeRecoveryCoordinator, props), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(state.reads).toHaveLength(2));
    first.unmount();

    render(createElement(HierarchyCreateOutcomeRecoveryCoordinator, props), { wrapper: Wrapper });
    await act(async () => {
      await Promise.resolve();
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(storedAttempts()).toEqual([]));
  });

  it("re-reads a confirmed attempt when the list refresh is superseded mid-flight", async () => {
    const growRow = "66666666-6666-4666-8666-666666666666";
    seedPriorAttempt({ entity: "grow", rowId: growRow, ownerId: IDS.owner });
    const confirmed = { data: { id: growRow, user_id: IDS.owner }, error: null };
    state.reads.push(confirmed, confirmed);
    const pending = new Promise<HierarchyCreateVisibleListReceipt>(() => {});
    const stalled = vi.fn(() => pending);
    const visible = vi.fn(async () => ({ status: "visible" as const }));

    const view = render(
      createElement(HierarchyCreateOutcomeRecoveryCoordinator, {
        ownerId: IDS.owner,
        refreshGrowsForRecovery: stalled,
      }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(stalled).toHaveBeenCalledTimes(1));

    view.rerender(
      createElement(HierarchyCreateOutcomeRecoveryCoordinator, {
        ownerId: IDS.owner,
        refreshGrowsForRecovery: visible,
      }),
    );

    await waitFor(() => expect(visible).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(storedAttempts()).toEqual([]));
  });
});
