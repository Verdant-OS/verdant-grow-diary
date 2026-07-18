import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type GrowQueryResponse = {
  data: Array<{ id: string; name: string }> | null;
  error: { message: string } | null;
};

type DeferredRequest = {
  promise: Promise<GrowQueryResponse>;
  resolve: (value: GrowQueryResponse) => void;
};

const state = vi.hoisted(() => ({
  ownerId: "owner-a" as string | null,
  requests: [] as DeferredRequest[],
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: state.ownerId ? { id: state.ownerId } : null,
    session: null,
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => {
  function createBuilder() {
    let resolve!: (value: GrowQueryResponse) => void;
    const promise = new Promise<GrowQueryResponse>((resolvePromise) => {
      resolve = resolvePromise;
    });
    state.requests.push({ promise, resolve });

    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      then: (
        onFulfilled: (value: GrowQueryResponse) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => promise.then(onFulfilled, onRejected),
    };

    return builder;
  }

  return { supabase: { from: () => createBuilder() } };
});

import { useAuth } from "@/store/auth";
import { GrowsProvider, useGrows } from "@/store/grows";

type OwnerBSnapshot = {
  growIds: string[];
  activeGrowId: string | null;
  loading: boolean;
};

function GrowsProbe({ ownerBSnapshots }: { ownerBSnapshots: OwnerBSnapshot[] }) {
  const { user } = useAuth();
  const { grows, activeGrowId, loading } = useGrows();
  const ownerId = user?.id ?? "signed-out";

  if (ownerId === "owner-b") {
    ownerBSnapshots.push({
      growIds: grows.map((grow) => grow.id),
      activeGrowId,
      loading,
    });
  }

  return (
    <output data-testid="grows-state">
      {`${ownerId}|${loading ? "loading" : "ready"}|${activeGrowId ?? "none"}|${grows
        .map((grow) => grow.id)
        .join(",")}`}
    </output>
  );
}

beforeEach(() => {
  state.ownerId = "owner-a";
  state.requests.length = 0;
});

describe("GrowsProvider owner transitions", () => {
  it("never renders owner A state to owner B while B's grow fetch is pending", async () => {
    const ownerBSnapshots: OwnerBSnapshot[] = [];
    const view = render(
      <GrowsProvider>
        <GrowsProbe ownerBSnapshots={ownerBSnapshots} />
      </GrowsProvider>,
    );

    await waitFor(() => expect(state.requests).toHaveLength(1));
    await act(async () => {
      state.requests[0].resolve({
        data: [{ id: "owner-a-grow", name: "Owner A Grow" }],
        error: null,
      });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByTestId("grows-state")).toHaveTextContent(
        "owner-a|ready|owner-a-grow|owner-a-grow",
      ),
    );

    state.ownerId = "owner-b";
    view.rerender(
      <GrowsProvider>
        <GrowsProbe ownerBSnapshots={ownerBSnapshots} />
      </GrowsProvider>,
    );

    await waitFor(() => expect(state.requests).toHaveLength(2));

    expect(screen.getByTestId("grows-state")).toHaveTextContent("owner-b|loading|none|");
    expect(ownerBSnapshots).not.toHaveLength(0);
    expect(ownerBSnapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ loading: true, growIds: [], activeGrowId: null }),
      ]),
    );
    for (const snapshot of ownerBSnapshots) {
      expect(snapshot.growIds).not.toContain("owner-a-grow");
      expect(snapshot.activeGrowId).not.toBe("owner-a-grow");
    }
  });
});
