/**
 * #1001 — ActionDetail must not render client-carried sensor refs as trusted
 * Live evidence. Each sensor_snapshot ref is read back from sensor_readings
 * under RLS and checked against the action's tent, stored source and
 * captured_at. Unmatched refs render as Unverified with a caution line.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import ActionDetail from "@/pages/ActionDetail";

const TENT = "11111111-1111-4111-8111-111111111111";
const READING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AT = "2026-09-30T12:00:00.000Z";

const ROW = {
  id: "aq-1",
  grow_id: "g1",
  tent_id: TENT,
  plant_id: null,
  source: "environment_alert",
  action_type: "lower_humidity",
  target_metric: "humidity",
  target_device: null,
  suggested_change: "Lower humidity to 55%",
  reason: "Humidity high. [alert:alert-abc]",
  risk_level: "medium",
  status: "pending_approval",
  approved_at: null,
  rejected_at: null,
  completed_at: null,
  cancelled_at: null,
  simulated_at: null,
  created_at: "2026-09-30T12:01:00Z",
  updated_at: "2026-09-30T12:01:00Z",
  originating_timeline_events: [
    { id: READING_ID, kind: "sensor_snapshot", source: "live", occurred_at: AT },
  ],
};

type SensorRow = {
  id: string;
  tent_id: string | null;
  source: string;
  quality: string;
  captured_at: string;
};

let detailRow: unknown = ROW;
let sensorRows: SensorRow[] = [];
let sensorReadError = false;
const sensorQueries: string[][] = [];

vi.mock("@/integrations/supabase/client", () => {
  const makeActionQueueChain = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: detailRow, error: null }),
        then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
          resolve({ data: [detailRow], error: null }),
      }),
      in: () => chain,
      then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
        resolve({ data: [detailRow], error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      insert: () => Promise.resolve({ data: null, error: null }),
    };
    return chain;
  };
  const makeGeneric = () => {
    const result = { data: [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      contains: () => chain,
      in: () => chain,
      limit: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      order: () => Promise.resolve(result),
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
      insert: () => Promise.resolve({ data: null, error: null }),
    };
    return chain;
  };
  const makeSensorReadingsChain = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      in: (_col: string, ids: string[]) => {
        sensorQueries.push(ids);
        return Promise.resolve(
          sensorReadError
            ? { data: null, error: { message: "boom" } }
            : { data: sensorRows.filter((r) => ids.includes(r.id)), error: null },
        );
      },
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) =>
        table === "action_queue"
          ? makeActionQueueChain()
          : table === "sensor_readings"
            ? makeSensorReadingsChain()
            : makeGeneric(),
    },
  };
});

vi.mock("@/store/auth", () => {
  const user = { id: "u1", email: "u@example.com" };
  return {
    useAuth: () => ({ user }),
  };
});
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "G1" }],
    activeGrowId: "g1",
    activeGrow: { id: "g1", name: "G1" },
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  detailRow = ROW;
  sensorRows = [];
  sensorReadError = false;
  sensorQueries.length = 0;
});

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/actions/aq-1"]}>
      <Routes>
        <Route path="/actions/:actionId" element={<ActionDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function evidenceItem() {
  const panel = await screen.findByTestId("action-detail-alert-evidence-linkage");
  await waitFor(() =>
    expect(
      panel
        .querySelector('[data-testid="evidence-linkage-badges-item"]')
        ?.getAttribute("data-verification"),
    ).not.toBe("unverified:not_checked"),
  );
  return panel.querySelector('[data-testid="evidence-linkage-badges-item"]') as HTMLElement;
}

describe("ActionDetail — sensor evidence verified against stored rows (#1001)", () => {
  it("a fabricated live ref with no stored row renders Unverified, not Live", async () => {
    renderDetail();
    const item = await evidenceItem();
    expect(sensorQueries).toEqual([[READING_ID]]);
    expect(item.getAttribute("data-verification")).toBe("unverified:not_found");
    expect(item.getAttribute("data-trusted")).toBe("false");
    const chip = item.querySelector('[data-testid="evidence-linkage-badges-source"]');
    expect(chip?.textContent).toBe("Unverified");
    expect(item.textContent).not.toMatch(/\bLive\b/);
    expect(
      item.querySelector('[data-testid="evidence-linkage-badges-caution"]')?.textContent,
    ).toMatch(/unverified context/i);
  });

  it("a stored row from another tent stays Unverified", async () => {
    sensorRows = [
      { id: READING_ID, tent_id: "other", source: "live", quality: "ok", captured_at: AT },
    ];
    renderDetail();
    const item = await evidenceItem();
    expect(item.getAttribute("data-verification")).toBe("unverified:wrong_tent");
  });

  it("a failed read is shown as unchecked, never Live", async () => {
    sensorReadError = true;
    renderDetail();
    const item = await evidenceItem();
    expect(item.getAttribute("data-verification")).toBe("unverified:read_failed");
    expect(item.getAttribute("data-trusted")).toBe("false");
  });

  it("a matching stored live row renders Live with the stored provenance", async () => {
    sensorRows = [
      { id: READING_ID, tent_id: TENT, source: "live", quality: "ok", captured_at: AT },
    ];
    renderDetail();
    const item = await evidenceItem();
    expect(item.getAttribute("data-verification")).toBe("verified");
    expect(item.getAttribute("data-trusted")).toBe("true");
    expect(item.querySelector('[data-testid="evidence-linkage-badges-source"]')?.textContent).toBe(
      "Live",
    );
  });

  it("a matching stored row with stale quality renders Stale with caution", async () => {
    sensorRows = [
      { id: READING_ID, tent_id: TENT, source: "live", quality: "stale", captured_at: AT },
    ];
    detailRow = {
      ...ROW,
      originating_timeline_events: [
        { id: READING_ID, kind: "sensor_snapshot", source: "unknown", occurred_at: AT },
      ],
    };
    renderDetail();
    const item = await evidenceItem();
    expect(item.getAttribute("data-verification")).toBe("verified");
    expect(item.getAttribute("data-trusted")).toBe("false");
    expect(item.querySelector('[data-testid="evidence-linkage-badges-source"]')?.textContent).toBe(
      "Stale",
    );
  });
});
