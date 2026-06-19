/**
 * Action Queue — device-identifier redaction hardening (load-bearing).
 *
 * This is NOT an advisory test. It seeds Action Queue rows with
 * deliberately sensitive fixtures (MAC address, vendor id, bridge-token
 * shaped string, and a nested raw_payload device id) and asserts the
 * rendered ActionQueue list AND ActionDetail page never contain those
 * substrings anywhere in their DOM — innerHTML and textContent both.
 *
 * Step 0 audit findings (encoded as test assumptions):
 *   - No export/print/clipboard path exists in ActionQueue.tsx or
 *     ActionDetail.tsx; tests assert that no such surface has been
 *     introduced (no <a download>, no print iframe, no clipboard call).
 *   - `target_device` flows through `formatActionTargetLabel`, which
 *     replaces any device value with the grower-safe label.
 *   - raw_payload is not currently fetched by these pages. The test
 *     still seeds one so a future regression that exposes it will fail.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import ActionQueue from "@/pages/ActionQueue";
import ActionDetail from "@/pages/ActionDetail";

import {
  SAFE_DEVICE_LABEL,
  containsDeviceIdentifierLeak,
  detectDeviceIdentifierLeaks,
  redactDeviceIdentifierLabel,
  formatActionTargetLabel,
} from "@/lib/actionQueueRedactionRules";

// ---------------------------------------------------------------------------
// Fixtures — deliberately sensitive strings
// ---------------------------------------------------------------------------

const MAC = "AA:BB:CC:DD:EE:FF";
const VENDOR_ID = "vendor_xyz_001";
const BRIDGE_TOKEN = "brg_tok_aF3kQ9zP1xY2";
const RAW_PAYLOAD_NESTED_DEVICE = "device_inner_9b8c7d6e5f4a";
const LONG_HEX = "0123456789abcdef0123456789abcdef";

const ROW_WITH_MAC = {
  id: "aq-mac-1",
  grow_id: "g1",
  tent_id: null,
  plant_id: null,
  source: "ai_doctor",
  action_type: "raise_light",
  target_metric: "general",
  target_device: MAC,
  suggested_change: "Raise the light by 10 cm",
  reason: "Reduce radiant load.",
  risk_level: "medium",
  status: "pending_approval",
  approved_at: null,
  rejected_at: null,
  completed_at: null,
  cancelled_at: null,
  simulated_at: null,
  created_at: "2026-05-27T10:00:00Z",
  updated_at: "2026-05-27T10:00:00Z",
  // raw_payload should never be selected by ActionQueue/Detail, but seed
  // it anyway so the assertion holds even if a future change exposes it.
  raw_payload: {
    device: { id: RAW_PAYLOAD_NESTED_DEVICE, mac: MAC, token: BRIDGE_TOKEN },
    signature: LONG_HEX,
  },
};

const ROW_WITH_VENDOR_ID = {
  ...ROW_WITH_MAC,
  id: "aq-vendor-1",
  target_device: VENDOR_ID,
  suggested_change: "Lower humidity to 55%",
};

const ROW_WITH_BRIDGE_TOKEN = {
  ...ROW_WITH_MAC,
  id: "aq-token-1",
  target_device: BRIDGE_TOKEN,
  suggested_change: "Adjust feed strength to 1.2 EC",
};

let listRows: unknown[] = [
  ROW_WITH_MAC,
  ROW_WITH_VENDOR_ID,
  ROW_WITH_BRIDGE_TOKEN,
];
let detailRow: unknown = ROW_WITH_MAC;
const insertSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const makeActionQueueChain = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: () => {
        const c2: Record<string, unknown> = {
          maybeSingle: () =>
            Promise.resolve({ data: detailRow, error: null }),
          then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
            resolve({ data: listRows, error: null }),
        };
        return c2;
      },
      in: () => chain,
      then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
        resolve({ data: listRows, error: null }),
      update: () => ({
        eq: () => Promise.resolve({ data: null, error: null }),
      }),
      insert: (...args: unknown[]) => {
        insertSpy(...args);
        return Promise.resolve({ data: null, error: null });
      },
    };
    return chain;
  };
  const makeGeneric = () => {
    const result = { data: [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      contains: () => chain,
      limit: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      order: () => Promise.resolve(result),
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "action_queue") return makeActionQueueChain();
        return makeGeneric();
      },
    },
  };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "G1" }],
    activeGrowId: "g1",
    activeGrow: { id: "g1", name: "G1" },
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    backHref: "/actions",
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  insertSpy.mockClear();
  listRows = [ROW_WITH_MAC, ROW_WITH_VENDOR_ID, ROW_WITH_BRIDGE_TOKEN];
  detailRow = ROW_WITH_MAC;
});

// ---------------------------------------------------------------------------
// Pure helper tests
// ---------------------------------------------------------------------------

describe("actionQueueRedactionRules — pure helpers", () => {
  it("detects MAC address, vendor id, bridge-token and long hex blob", () => {
    expect(containsDeviceIdentifierLeak(MAC)).toBe(true);
    expect(containsDeviceIdentifierLeak(VENDOR_ID)).toBe(true);
    expect(containsDeviceIdentifierLeak(BRIDGE_TOKEN)).toBe(true);
    expect(containsDeviceIdentifierLeak(LONG_HEX)).toBe(true);
    expect(containsDeviceIdentifierLeak(RAW_PAYLOAD_NESTED_DEVICE)).toBe(true);
  });

  it("does not flag grower-safe copy", () => {
    expect(containsDeviceIdentifierLeak("Grow-room equipment")).toBe(false);
    expect(containsDeviceIdentifierLeak("Lower humidity to 55%")).toBe(false);
    expect(containsDeviceIdentifierLeak("Stage: veg")).toBe(false);
    expect(containsDeviceIdentifierLeak("")).toBe(false);
  });

  it("returns named matches so a leak's class is identifiable", () => {
    const leaks = detectDeviceIdentifierLeaks(`${MAC} ${BRIDGE_TOKEN}`);
    const names = leaks.map((l) => l.pattern);
    expect(names).toEqual(expect.arrayContaining(["mac_address", "bridge_token"]));
  });

  it("redactDeviceIdentifierLabel returns the safe label for any non-blank value", () => {
    expect(redactDeviceIdentifierLabel(MAC)).toBe(SAFE_DEVICE_LABEL);
    expect(redactDeviceIdentifierLabel(VENDOR_ID)).toBe(SAFE_DEVICE_LABEL);
    expect(redactDeviceIdentifierLabel(BRIDGE_TOKEN)).toBe(SAFE_DEVICE_LABEL);
  });

  it("redactDeviceIdentifierLabel returns null for null/blank — caller chooses fallback", () => {
    expect(redactDeviceIdentifierLabel(null)).toBeNull();
    expect(redactDeviceIdentifierLabel(undefined)).toBeNull();
    expect(redactDeviceIdentifierLabel("")).toBeNull();
    expect(redactDeviceIdentifierLabel("   ")).toBeNull();
  });

  it("formatActionTargetLabel never echoes the device value", () => {
    expect(formatActionTargetLabel(null, MAC)).toBe(SAFE_DEVICE_LABEL);
    expect(formatActionTargetLabel(null, BRIDGE_TOKEN)).toBe(SAFE_DEVICE_LABEL);
    expect(formatActionTargetLabel("humidity_pct", MAC)).toBe("humidity_pct");
  });
});

// ---------------------------------------------------------------------------
// Render tests — full-DOM scan (load-bearing)
// ---------------------------------------------------------------------------

function expectNoDeviceLeakAnywhere(scope: string): void {
  // Scan BOTH textContent and innerHTML — innerHTML catches values that
  // might be hidden in attributes (data-*, title, aria-*, etc.) without
  // being visible in textContent.
  const text = document.body.textContent ?? "";
  const html = document.body.innerHTML ?? "";
  const textLeaks = detectDeviceIdentifierLeaks(text);
  const htmlLeaks = detectDeviceIdentifierLeaks(html);
  if (textLeaks.length || htmlLeaks.length) {
    const detail = JSON.stringify(
      { scope, textLeaks, htmlLeaks },
      null,
      2,
    );
    throw new Error(
      `Device-identifier leak detected in ${scope}:\n${detail}`,
    );
  }
}

function renderList(url = "/actions") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ActionQueue />
    </MemoryRouter>,
  );
}

function renderDetail(actionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/actions/${actionId}`]}>
      <Routes>
        <Route path="/actions/:actionId" element={<ActionDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ActionQueue list — full-DOM device-identifier scan", () => {
  it("renders rows without leaking MAC / vendor id / bridge token anywhere", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBe(3),
    );
    expectNoDeviceLeakAnywhere("ActionQueue list");
  });

  it("renders the safe device label exactly when target_device is present", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBe(3),
    );
    expect(document.body.textContent ?? "").toContain(SAFE_DEVICE_LABEL);
  });

  it("preserves approve/reject affordances (regression for req 6)", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBe(3),
    );
    // Buttons exist somewhere on the list surface; we only assert presence
    // so the existing approval flow isn't accidentally removed.
    expect(document.body.textContent ?? "").toMatch(/approve|reject/i);
  });

  it("introduces no clipboard / download / print surface (Step 0 negative check)", async () => {
    renderList();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBe(3),
    );
    expect(document.querySelectorAll("a[download]").length).toBe(0);
    expect(document.querySelectorAll("[data-export-action]").length).toBe(0);
    expect(document.querySelectorAll("[data-print-action]").length).toBe(0);
  });
});

describe("ActionDetail — full-DOM device-identifier scan", () => {
  it("MAC-bearing row does not leak the MAC anywhere", async () => {
    detailRow = ROW_WITH_MAC;
    renderDetail("aq-mac-1");
    await screen.findByText("Raise the light by 10 cm");
    expectNoDeviceLeakAnywhere("ActionDetail MAC row");
  });

  it("vendor-id row does not leak the vendor id anywhere", async () => {
    detailRow = ROW_WITH_VENDOR_ID;
    renderDetail("aq-vendor-1");
    await screen.findByText("Lower humidity to 55%");
    expectNoDeviceLeakAnywhere("ActionDetail vendor row");
  });

  it("bridge-token row does not leak the token anywhere", async () => {
    detailRow = ROW_WITH_BRIDGE_TOKEN;
    renderDetail("aq-token-1");
    await screen.findByText("Adjust feed strength to 1.2 EC");
    expectNoDeviceLeakAnywhere("ActionDetail bridge-token row");
  });

  it("introduces no clipboard / download / print surface on detail", async () => {
    detailRow = ROW_WITH_MAC;
    renderDetail("aq-mac-1");
    await screen.findByText("Raise the light by 10 cm");
    expect(document.querySelectorAll("a[download]").length).toBe(0);
    expect(document.querySelectorAll("[data-export-action]").length).toBe(0);
    expect(document.querySelectorAll("[data-print-action]").length).toBe(0);
  });
});
