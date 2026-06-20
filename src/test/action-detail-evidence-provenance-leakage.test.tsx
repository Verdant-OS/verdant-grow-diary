/**
 * Action Detail evidence/origin panel leakage guards.
 *
 * Renders the alert-derived ("Action source") and AI Doctor-derived
 * ("Suggestion origin") provenance panels on Action Detail with mock
 * rows whose non-rendered fields are seeded with deliberately
 * malicious noise (raw_payload, service_role, Bearer tokens, private
 * keys, device-control language). Asserts:
 *
 *   1. None of those unsafe strings appear in the rendered DOM.
 *   2. The review-only evidence-quality copy still renders.
 *   3. Missing-evidence help text + the Review timeline link still
 *      render and use the centralized helper / safe route.
 *   4. The review-timeline link is a navigation Link, not an approval
 *      button, and uses the safe aria-label.
 *
 * Test-only. No production behavior changes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ActionDetail from "@/pages/ActionDetail";
import {
  ACTION_EVIDENCE_MISSING_PANEL_HELP,
  ACTION_EVIDENCE_QUALITY_UNAVAILABLE_LABEL,
} from "@/lib/actionQueueEvidenceViewModel";
import {
  ACTION_EVIDENCE_REVIEW_LINK_ARIA_LABEL,
  ACTION_EVIDENCE_REVIEW_LINK_LABEL,
} from "@/lib/actionQueueMissingEvidenceLink";
import { plantDetailPath } from "@/lib/routes";

// --- Malicious / noisy strings that MUST NEVER appear in the DOM ------------
const UNSAFE_STRINGS = [
  "raw_payload",
  "service_role",
  "Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRIVATE_API_KEY",
  "sk_live_51AbCdEfGhIjKlMnOpQrStUvWxYz",
  "turn on equipment",
  "send command",
  "control device",
  "mqtt://broker.example.com:1883",
  "pump.on",
  "dose(",
] as const;

// --- Common malicious extras seeded onto every mock row ---------------------
const TOXIC_EXTRAS = {
  // Non-schema "extra" fields. Asserts the panel never blindly dumps the row.
  raw_payload: { secret: "PRIVATE_API_KEY=sk_live_51AbCdEfGhIjKlMnOpQrStUvWxYz" },
  service_role_key: "service_role:Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig",
  bridge_token: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig",
  device_command: "turn on equipment; pump.on; dose(5ml); mqtt://broker.example.com:1883",
};

const BASE_ROW = {
  id: "aq-leak-1",
  grow_id: "g1",
  tent_id: "t1",
  plant_id: "p1",
  // target_device is rendered nowhere; seed it with noise anyway.
  target_device: "control device pump.on relay_2",
  target_metric: "humidity",
  status: "pending_approval",
  approved_at: null,
  rejected_at: null,
  completed_at: null,
  cancelled_at: null,
  simulated_at: null,
  created_at: "2026-05-29T10:00:00Z",
  updated_at: "2026-05-29T10:00:00Z",
  risk_level: "medium" as const,
  ...TOXIC_EXTRAS,
};

const ALERT_ROW = {
  ...BASE_ROW,
  source: "environment_alert",
  action_type: "lower_humidity",
  suggested_change: "Lower humidity to 55%",
  reason: "Mold risk rising. [alert:alert-abc]",
};

const AI_DOCTOR_ROW = {
  ...BASE_ROW,
  id: "aq-leak-2",
  source: "ai_doctor",
  action_type: "reduce_light_intensity",
  suggested_change: "Raise light by 10 cm",
  reason: "Reduce radiant load. [session:sess-xyz]",
};

let detailRow: unknown = ALERT_ROW;

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
  return {
    supabase: {
      from: (table: string) =>
        table === "action_queue" ? makeActionQueueChain() : makeGeneric(),
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
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  detailRow = ALERT_ROW;
});

function renderDetail(actionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/actions/${actionId}`]}>
      <Routes>
        <Route path="/actions/:actionId" element={<ActionDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

function assertNoUnsafeStrings(dom: string) {
  for (const tok of UNSAFE_STRINGS) {
    expect(dom, `unsafe token leaked into DOM: ${tok}`).not.toContain(tok);
  }
}

describe("ActionDetail evidence/origin panels — alert-derived leakage guards", () => {
  it("renders the evidence quality copy and missing-evidence help without leaking unsafe fields", async () => {
    detailRow = ALERT_ROW;
    const { container } = renderDetail("aq-leak-1");

    // Positive UI present.
    const quality = await screen.findByTestId("action-detail-evidence-quality");
    expect(quality.textContent).toBe(ACTION_EVIDENCE_QUALITY_UNAVAILABLE_LABEL);

    const missingHelp = await screen.findByTestId(
      "action-detail-evidence-missing-help",
    );
    expect(missingHelp.textContent).toBe(ACTION_EVIDENCE_MISSING_PANEL_HELP);

    // No unsafe strings anywhere in the rendered DOM.
    assertNoUnsafeStrings(container.textContent ?? "");
    assertNoUnsafeStrings(container.innerHTML);
  });

  it("renders the Review timeline link as a Link to a safe scoped route, not an approval button", async () => {
    detailRow = ALERT_ROW;
    renderDetail("aq-leak-1");

    const link = (await screen.findByTestId(
      "action-detail-evidence-review-link",
    )) as HTMLAnchorElement;

    expect(link.tagName).toBe("A");
    expect(link.textContent).toBe(ACTION_EVIDENCE_REVIEW_LINK_LABEL);
    expect(link.getAttribute("aria-label")).toBe(
      ACTION_EVIDENCE_REVIEW_LINK_ARIA_LABEL,
    );
    // Uses the plant-scoped safe route helper.
    expect(link.getAttribute("href")).toBe(plantDetailPath("p1"));
    // Not a submit/approval surface.
    expect(link.getAttribute("type")).not.toBe("submit");
    expect(link.getAttribute("role")).not.toBe("button");
  });
});

describe("ActionDetail evidence/origin panels — AI Doctor leakage guards", () => {
  it("renders the AI Doctor suggestion origin panel without leaking unsafe fields", async () => {
    detailRow = AI_DOCTOR_ROW;
    const { container } = renderDetail("aq-leak-2");

    const origin = await screen.findByTestId(
      "action-detail-ai-doctor-provenance",
    );
    expect(origin.textContent ?? "").toContain("Suggestion origin");
    expect(origin.textContent ?? "").toContain("Grower review required");

    const quality = await screen.findByTestId("action-detail-evidence-quality");
    expect(quality.textContent).toBe(ACTION_EVIDENCE_QUALITY_UNAVAILABLE_LABEL);

    const missingHelp = await screen.findByTestId(
      "action-detail-evidence-missing-help",
    );
    expect(missingHelp.textContent).toBe(ACTION_EVIDENCE_MISSING_PANEL_HELP);

    assertNoUnsafeStrings(container.textContent ?? "");
    assertNoUnsafeStrings(container.innerHTML);
  });

  it("renders the Review timeline link inside the AI Doctor panel using the scoped helper", async () => {
    detailRow = AI_DOCTOR_ROW;
    renderDetail("aq-leak-2");

    const link = (await screen.findByTestId(
      "action-detail-evidence-review-link",
    )) as HTMLAnchorElement;

    expect(link.tagName).toBe("A");
    expect(link.textContent).toBe(ACTION_EVIDENCE_REVIEW_LINK_LABEL);
    expect(link.getAttribute("href")).toBe(plantDetailPath("p1"));
  });

  it("does not render device-control / automation language anywhere in the panel", async () => {
    detailRow = AI_DOCTOR_ROW;
    const { container } = renderDetail("aq-leak-2");
    await screen.findByTestId("action-detail-ai-doctor-provenance");

    const lower = (container.textContent ?? "").toLowerCase();
    for (const tok of [
      "turn on",
      "turn off",
      "actuator",
      "relay",
      "mqtt",
      "pump.on",
      "dose(",
      "auto-execute",
      "auto-run",
      "automatically turn",
      "send command",
      "control device",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });

  it("does not render raw back-pointer tokens or seeded extra payload fields", async () => {
    detailRow = AI_DOCTOR_ROW;
    const { container } = renderDetail("aq-leak-2");
    await screen.findByTestId("action-detail-ai-doctor-provenance");

    const text = container.textContent ?? "";
    expect(text).not.toContain("[alert:");
    expect(text).not.toContain("[session:");
    expect(text.toLowerCase()).not.toContain("bridge_token");
    expect(text.toLowerCase()).not.toContain("service_role_key");
    expect(text.toLowerCase()).not.toContain("target_device");
  });
});

// --- Static safety scans ----------------------------------------------------
const DETAIL_SRC = readFileSync(
  resolve(__dirname, "../..", "src/pages/ActionDetail.tsx"),
  "utf8",
);

describe("ActionDetail evidence panels — static safety", () => {
  it("does not reference raw_payload, service_role, or Bearer tokens in source", () => {
    expect(DETAIL_SRC).not.toMatch(/raw_payload/i);
    expect(DETAIL_SRC).not.toMatch(/service_role/i);
    expect(DETAIL_SRC).not.toMatch(/Bearer\s+ey/);
    expect(DETAIL_SRC).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(DETAIL_SRC).not.toMatch(/PRIVATE_API_KEY/);
    expect(DETAIL_SRC).not.toMatch(/sk_live_/);
  });

  it("does not render target_device verbatim inside provenance panels", () => {
    // target_device should never appear in JSX text-content slots.
    expect(DETAIL_SRC).not.toMatch(/\{[^}]*target_device[^}]*\}\s*</);
  });

  it("uses the centralized missing-evidence helper, not ad-hoc strings", () => {
    expect(DETAIL_SRC).toContain("ACTION_EVIDENCE_MISSING_PANEL_HELP");
    expect(DETAIL_SRC).toContain("buildMissingEvidenceReviewLink");
  });

  it("review-timeline link uses the safe aria-label constant, not free text", () => {
    expect(DETAIL_SRC).toContain(
      "aria-label={ACTION_EVIDENCE_REVIEW_LINK_ARIA_LABEL}",
    );
  });
});
