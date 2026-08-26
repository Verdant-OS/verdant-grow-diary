import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY } from "@/lib/hierarchyCreateOutcomeRecovery";

const IDS = {
  owner: "11111111-1111-4111-8111-111111111111",
  grow: "22222222-2222-4222-8222-222222222222",
  tent: "33333333-3333-4333-8333-333333333333",
  plant: "44444444-4444-4444-8444-444444444444",
} as const;

type ListResponse = { data: readonly Record<string, unknown>[] | null; error: unknown };

const state = vi.hoisted(() => ({
  list: new Map<string, () => Promise<ListResponse>>(),
  growList: [] as Array<() => Promise<ListResponse>>,
  exact: new Map<string, () => Promise<{ data: Record<string, unknown> | null; error: unknown }>>(),
  calls: [] as string[],
  user: { id: "11111111-1111-4111-8111-111111111111" },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      let selected = "";
      const query = {
        select: (fields: string) => {
          selected = fields;
          return query;
        },
        eq: () => query,
        order: async () => {
          state.calls.push(table);
          if (table === "grows" && state.growList.length > 0) {
            const read = state.growList.shift();
            if (!read) throw new Error("missing mocked grow list");
            return read();
          }
          const read = state.list.get(table);
          if (!read) throw new Error(`missing mocked list for ${table}`);
          return read();
        },
        maybeSingle: async () => {
          state.calls.push(`${table}:exact:${selected}`);
          const read = state.exact.get(table);
          if (!read) throw new Error(`missing mocked exact read for ${table}`);
          return read();
        },
      };
      return query;
    },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: state.user }),
}));

import {
  refreshPlantListForRecovery,
  refreshTentListForRecovery,
} from "@/hooks/useHierarchyCreateOutcomeRecoveryCoordinator";
import { PLANTS_QUERY_KEY } from "@/hooks/use-plants";
import { TENTS_QUERY_KEY } from "@/hooks/use-tents";
import { GrowsProvider, useGrows } from "@/store/grows";

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  state.list.clear();
  state.growList = [];
  state.exact.clear();
  state.calls = [];
  state.user = { id: IDS.owner };
  window.sessionStorage.clear();
});

function GrowProbe() {
  const { grows } = useGrows();
  return createElement(
    "output",
    { "data-testid": "recovery-visible-grows" },
    grows.map((grow) => grow.id).join(","),
  );
}

describe("hierarchy create outcome recovery visual receipts", () => {
  it("cancels an older canonical Tent query, then publishes the post-confirmation exact row", async () => {
    const client = newQueryClient();
    const row = { id: IDS.tent, user_id: IDS.owner, grow_id: IDS.grow, name: "Tent" };
    client.setQueryData(TENTS_QUERY_KEY, []);
    state.list.set("tents", async () => ({ data: [row], error: null }));
    const cancelQueries = vi.spyOn(client, "cancelQueries");
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");

    await expect(
      refreshTentListForRecovery(
        client,
        { entity: "tent", rowId: IDS.tent, ownerId: IDS.owner, growId: IDS.grow },
        () => true,
      ),
    ).resolves.toEqual({ status: "visible" });

    expect(state.calls).toEqual(["tents"]);
    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: TENTS_QUERY_KEY, exact: true });
    expect(client.getQueryData(TENTS_QUERY_KEY)).toEqual([row]);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["grow", "tents"],
      refetchType: "none",
    });
  });

  it("does not publish or release a Plant receipt when the owner changes during its direct read", async () => {
    const client = newQueryClient();
    const read = deferred<ListResponse>();
    const row = {
      id: IDS.plant,
      user_id: IDS.owner,
      grow_id: IDS.grow,
      tent_id: IDS.tent,
      name: "Plant",
    };
    let ownerCurrent = true;
    client.setQueryData(PLANTS_QUERY_KEY, []);
    state.list.set("plants", () => read.promise);

    const result = refreshPlantListForRecovery(
      client,
      {
        entity: "plant",
        rowId: IDS.plant,
        ownerId: IDS.owner,
        growId: IDS.grow,
        tentId: IDS.tent,
      },
      () => ownerCurrent,
    );
    await Promise.resolve();
    ownerCurrent = false;
    read.resolve({ data: [row], error: null });

    await expect(result).resolves.toEqual({ status: "unavailable" });
    expect(client.getQueryData(PLANTS_QUERY_KEY)).toEqual([]);
  });

  it("keeps the canonical cache unchanged for an errored or hierarchy-mismatched list", async () => {
    const client = newQueryClient();
    const attempt = {
      entity: "tent" as const,
      rowId: IDS.tent,
      ownerId: IDS.owner,
      growId: IDS.grow,
    };
    client.setQueryData(TENTS_QUERY_KEY, []);

    state.list.set("tents", async () => ({ data: null, error: { message: "offline" } }));
    await expect(refreshTentListForRecovery(client, attempt, () => true)).resolves.toEqual({
      status: "unavailable",
    });
    expect(client.getQueryData(TENTS_QUERY_KEY)).toEqual([]);

    state.list.set("tents", async () => ({
      data: [{ id: IDS.tent, user_id: IDS.owner, grow_id: "other-grow" }],
      error: null,
    }));
    await expect(refreshTentListForRecovery(client, attempt, () => true)).resolves.toEqual({
      status: "not_visible",
    });
    expect(client.getQueryData(TENTS_QUERY_KEY)).toEqual([]);
  });

  it("does not let an earlier empty Grow read overwrite the late confirmed visible receipt", async () => {
    const client = newQueryClient();
    const initialRead = deferred<ListResponse>();
    const row = { id: IDS.grow, user_id: IDS.owner, name: "Recovered Grow" };
    state.growList.push(
      () => initialRead.promise,
      async () => ({ data: [row], error: null }),
    );
    state.exact.set("grows", async () => ({
      data: { id: IDS.grow, user_id: IDS.owner },
      error: null,
    }));
    window.sessionStorage.setItem(
      HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        attempts: [
          {
            entity: "grow",
            rowId: IDS.grow,
            ownerId: IDS.owner,
            runtimeEpoch: "prior-page-runtime",
          },
        ],
      }),
    );

    render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(GrowsProvider, null, createElement(GrowProbe)),
      ),
    );

    await waitFor(() =>
      expect(screen.getByTestId("recovery-visible-grows")).toHaveTextContent(IDS.grow),
    );
    await waitFor(() => {
      const stored = JSON.parse(
        window.sessionStorage.getItem(HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY) ?? "{}",
      ) as { attempts?: readonly unknown[] };
      expect(stored.attempts).toEqual([]);
    });

    await act(async () => {
      initialRead.resolve({ data: [], error: null });
      await Promise.resolve();
    });

    expect(screen.getByTestId("recovery-visible-grows")).toHaveTextContent(IDS.grow);
  });
});
