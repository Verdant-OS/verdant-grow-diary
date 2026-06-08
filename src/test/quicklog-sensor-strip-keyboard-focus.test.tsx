/**
 * QuickLog — attach switch focus order, accessible name, and the
 * session-local helper copy. The sensor strip is replaced with a tiny
 * stand-in that mirrors its testid + href so we can assert DOM/tab
 * order without spinning up the realtime hook.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpcMock = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: () => ({
      insert: vi.fn(),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
      subscribe: () => ({ unsubscribe: () => {} }),
      unsubscribe: () => {},
    }),
    removeChannel: () => {},
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "Tent 1", stage: "veg" }],
    activeGrow: { id: "g1", name: "Tent 1", stage: "veg" },
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "p1", name: "Blue Dream", strain: "BD", tent_id: "t1", grow_id: "g1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "t1", name: "Tent 1", grow_id: "g1" }] }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));
vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({
  default: () => (
    <a
      href="/sensors"
      data-testid="quicklog-sensor-snapshot-action"
      className="focus-visible:ring-2"
    >
      Refresh snapshot
    </a>
  ),
}));

import QuickLog from "@/components/QuickLog";

function renderQL() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("QuickLog — attach switch session helper + focus order", () => {
  beforeEach(() => rpcMock.mockClear());
  afterEach(() => cleanup());

  it("renders the session-local helper copy under the attach switch", () => {
    renderQL();
    const helper = screen.getByTestId("quick-log-snapshot-session-helper");
    expect(helper).toHaveTextContent(
      "Applies to this log only. Closing Quick Log resets this choice.",
    );
    expect(helper.textContent ?? "").not.toMatch(
      /localStorage|persist|remembered/i,
    );
  });

  it("attach Switch is described by the session helper", () => {
    renderQL();
    const sw = screen.getByRole("switch", {
      name: /attach sensor snapshot to this log/i,
    });
    expect(sw.getAttribute("aria-describedby")).toBe(
      "quick-log-snapshot-session-helper",
    );
  });

  it("attach Switch precedes the strip /sensors action in DOM/tab order", () => {
    renderQL();
    const sw = screen.getByRole("switch", {
      name: /attach sensor snapshot to this log/i,
    });
    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    const rel = sw.compareDocumentPosition(action);
    expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect((sw as HTMLElement).tabIndex).not.toBe(-1);
    expect((action as HTMLElement).tabIndex).not.toBe(-1);
  });

  it("strip action link is a real anchor with href='/sensors'", () => {
    renderQL();
    const action = screen.getByTestId(
      "quicklog-sensor-snapshot-action",
    ) as HTMLAnchorElement;
    expect(action.tagName).toBe("A");
    expect(action.getAttribute("href")).toBe("/sensors");
  });
});
