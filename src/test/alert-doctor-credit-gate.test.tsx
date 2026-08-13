/**
 * alert_doctor_credit gate — out-of-credits interception on the tent-alerts
 * "Ask AI Doctor" row action.
 *
 * When a FREE grow's fixed AI Doctor allotment is spent, the doctor CTA is
 * a dead end (the review section can only show the server-side quota
 * denial), so the row action swaps — honestly labeled — to the pricing
 * surface, with one calm reason line at panel level. These tests pin:
 *
 *  - the pure gate rules: fail-open on every unresolved input, free-plan
 *    eligibility via the aiCreditsPerGrow capability (never a plan-string
 *    comparison), and "low" state deliberately NOT intercepting;
 *  - the swap itself: doctor CTA replaced by a /pricing link, reason note
 *    rendered, both id-free;
 *  - the funnel wiring: paywall_cta_clicked on click and ONE deduped
 *    paywall_viewed impression per mount, only when the gated state
 *    actually rendered;
 *  - the fallback: no gate prop / intercept=false → the panel behaves
 *    exactly as before (the canonical ai_doctor_cta_clicked path, shipped
 *    in #930, is untouched);
 *  - PlantDetail wiring: gate computed from presentation-only reads, with
 *    the usage query enabled only for resolved per-grow-allotment plans.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

const spies = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock("@/lib/funnelAnalytics", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/funnelAnalytics")>();
  return { ...real, trackFunnelEvent: spies.track };
});

import {
  ALERT_DOCTOR_CREDIT_GATE_SURFACE,
  buildAlertDoctorCreditGate,
  type AlertDoctorCreditGateView,
} from "@/lib/alertDoctorCreditGateRules";
import {
  AI_DOCTOR_CREDITS_TEASER_COPY,
  AI_DOCTOR_CREDITS_TEASER_CTA_LABEL,
} from "@/lib/aiDoctorCreditsExhaustedTeaserRules";
import { paywallCtaHasBannedWords } from "@/lib/paywallCtaViewModel";
import { sanitizeFunnelParams } from "@/lib/funnelAnalytics";
import { enforceFunnelEventSchema } from "@/lib/funnelEventSchema";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: () => ({ status: "ok", rows: mocks.rows }),
}));

vi.mock("@/components/ui/card", () => {
  const P = ({ children, ...r }: { children?: ReactNode; [k: string]: unknown }) => (
    <div {...r}>{children}</div>
  );
  return { Card: P, CardContent: P, CardHeader: P, CardTitle: P };
});

import PlantAssignedTentAlertsPanel from "@/components/PlantAssignedTentAlertsPanel";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const ROW = {
  id: "alert-1",
  title: "Temperature high",
  reason: "28.4C above the flower band",
  severity: "warning" as const,
  severityLabel: "Warning",
  metric: "temp",
  status: "open" as const,
  lastSeenAt: null,
};

const INTERCEPT_GATE: AlertDoctorCreditGateView = buildAlertDoctorCreditGate({
  aiCreditsPerGrow: 3,
  entitlementReady: true,
  creditsUsed: 3,
  hasPackCredits: false,
});

function renderPanel(gate: AlertDoctorCreditGateView | null | undefined) {
  return render(
    <MemoryRouter initialEntries={["/plants/plant-1"]}>
      <PlantAssignedTentAlertsPanel
        tentId="tent-1"
        tentName="Flower Tent"
        growId="grow-1"
        plantId="plant-1"
        doctorCreditGate={gate}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  spies.track.mockClear();
  mocks.rows = [ROW];
});

describe("buildAlertDoctorCreditGate — pure rules", () => {
  it("intercepts exactly when a resolved free allotment is exhausted", () => {
    expect(INTERCEPT_GATE.intercept).toBe(true);
    expect(INTERCEPT_GATE.href).toBe("/pricing");
    expect(INTERCEPT_GATE.note).toBe(AI_DOCTOR_CREDITS_TEASER_COPY);
    expect(INTERCEPT_GATE.ctaLabel).toBe(AI_DOCTOR_CREDITS_TEASER_CTA_LABEL);
  });

  it("intercepts when usage overshot a since-reduced allotment", () => {
    const v = buildAlertDoctorCreditGate({
      aiCreditsPerGrow: 3,
      entitlementReady: true,
      creditsUsed: 5,
      hasPackCredits: false,
    });
    expect(v.intercept).toBe(true);
  });

  it("does NOT intercept on the LOW state — a remaining credit keeps a working CTA", () => {
    const v = buildAlertDoctorCreditGate({
      aiCreditsPerGrow: 3,
      entitlementReady: true,
      creditsUsed: 2,
      hasPackCredits: false,
    });
    expect(v.intercept).toBe(false);
  });

  it("fails open while the entitlement is unresolved or failed", () => {
    const v = buildAlertDoctorCreditGate({
      aiCreditsPerGrow: 3,
      entitlementReady: false,
      creditsUsed: 3,
      hasPackCredits: false,
    });
    expect(v.intercept).toBe(false);
  });

  it("fails open while usage has not loaded", () => {
    const v = buildAlertDoctorCreditGate({
      aiCreditsPerGrow: 3,
      entitlementReady: true,
      creditsUsed: undefined,
      hasPackCredits: false,
    });
    expect(v.intercept).toBe(false);
  });

  it("never intercepts monthly-pool plans (aiCreditsPerGrow null)", () => {
    const v = buildAlertDoctorCreditGate({
      aiCreditsPerGrow: null,
      entitlementReady: true,
      creditsUsed: 999,
      hasPackCredits: false,
    });
    expect(v.intercept).toBe(false);
  });

  it("treats a zero/negative allotment as unresolved, not as exhausted", () => {
    expect(
      buildAlertDoctorCreditGate({
        aiCreditsPerGrow: 0,
        entitlementReady: true,
        creditsUsed: 0,
        hasPackCredits: false,
      }).intercept,
    ).toBe(false);
  });

  it("never intercepts while pack ownership is unresolved", () => {
    const v = buildAlertDoctorCreditGate({
      aiCreditsPerGrow: 3,
      entitlementReady: true,
      creditsUsed: 3,
      hasPackCredits: undefined,
    });
    expect(v.intercept).toBe(false);
  });

  it("never intercepts a pack owner — overflow could fund the spend server-side", () => {
    // The spend contract lets EVERY plan draw pack credits once the
    // included allowance is spent, so an exhausted allowance alone never
    // proves the doctor CTA is a dead end.
    const v = buildAlertDoctorCreditGate({
      aiCreditsPerGrow: 3,
      entitlementReady: true,
      creditsUsed: 3,
      hasPackCredits: true,
    });
    expect(v.intercept).toBe(false);
  });

  it("is deterministic", () => {
    const a = buildAlertDoctorCreditGate({
      aiCreditsPerGrow: 3,
      entitlementReady: true,
      creditsUsed: 3,
      hasPackCredits: false,
    });
    const b = buildAlertDoctorCreditGate({
      aiCreditsPerGrow: 3,
      entitlementReady: true,
      creditsUsed: 3,
      hasPackCredits: false,
    });
    expect(a).toEqual(b);
  });

  it("gate copy and CTA label are calm — no banned marketing words", () => {
    expect(paywallCtaHasBannedWords(INTERCEPT_GATE.note)).toBe(false);
    expect(paywallCtaHasBannedWords(INTERCEPT_GATE.ctaLabel)).toBe(false);
  });

  it("the funnel surface token survives the real sanitizer chain on both events", () => {
    // Vacuity check: a surface token that the sanitizer or per-event schema
    // rejected would silently strip, leaving impressions with empty props.
    for (const event of ["paywall_viewed", "paywall_cta_clicked"] as const) {
      const out = enforceFunnelEventSchema(
        event,
        sanitizeFunnelParams({ surface: ALERT_DOCTOR_CREDIT_GATE_SURFACE }),
      );
      expect(out).toEqual({ surface: ALERT_DOCTOR_CREDIT_GATE_SURFACE });
    }
  });
});

describe("panel interception — behavior", () => {
  it("swaps the doctor CTA for the plans link and renders the reason note", () => {
    renderPanel(INTERCEPT_GATE);
    expect(screen.queryByTestId("plant-assigned-tent-alert-ask-doctor")).toBeNull();
    const plans = screen.getByTestId("plant-assigned-tent-alert-doctor-plans");
    expect(plans.getAttribute("href")).toBe("/pricing");
    expect(plans.textContent).toContain(AI_DOCTOR_CREDITS_TEASER_CTA_LABEL);
    expect(screen.getByTestId("plant-assigned-tent-alerts-credits-note").textContent).toBe(
      AI_DOCTOR_CREDITS_TEASER_COPY,
    );
    // The row's other affordances are untouched.
    expect(screen.getByTestId("plant-assigned-tent-alert-view")).toBeInTheDocument();
    expect(screen.getByTestId("plant-assigned-tent-alert-target-band")).toBeInTheDocument();
  });

  it("reports the click as paywall_cta_clicked with the fixed id-free surface", () => {
    renderPanel(INTERCEPT_GATE);
    fireEvent.click(screen.getByTestId("plant-assigned-tent-alert-doctor-plans"));
    const clicks = spies.track.mock.calls.filter(([name]) => name === "paywall_cta_clicked");
    expect(clicks).toHaveLength(1);
    expect(clicks[0][1]).toEqual({ surface: ALERT_DOCTOR_CREDIT_GATE_SURFACE });
    // Never the doctor navigation event — the grower did not reach the review.
    expect(spies.track.mock.calls.map(([n]) => n)).not.toContain("ai_doctor_cta_clicked");
    const serialized = JSON.stringify(spies.track.mock.calls);
    expect(serialized).not.toContain("alert-1");
    expect(serialized).not.toContain("plant-1");
    expect(serialized).not.toContain("tent-1");
    expect(serialized).not.toContain("grow-1");
  });

  it("fires ONE paywall_viewed impression per exposure, only when rows rendered", () => {
    const view = renderPanel(INTERCEPT_GATE);
    const impressions = () => spies.track.mock.calls.filter(([name]) => name === "paywall_viewed");
    expect(impressions()).toHaveLength(1);
    expect(impressions()[0][1]).toEqual({ surface: ALERT_DOCTOR_CREDIT_GATE_SURFACE });
    // Re-render of the SAME exposure must not double-count the impression.
    view.rerender(
      <MemoryRouter initialEntries={["/plants/plant-1"]}>
        <PlantAssignedTentAlertsPanel
          tentId="tent-1"
          tentName="Flower Tent"
          growId="grow-1"
          plantId="plant-1"
          doctorCreditGate={INTERCEPT_GATE}
        />
      </MemoryRouter>,
    );
    expect(impressions()).toHaveLength(1);
  });

  it("a new plant exposure on the reused route component fires a fresh, still id-free impression", () => {
    // /plants/:id navigations reuse the route component, so the panel is
    // NOT remounted between plants — the second plant's visibly-rendered
    // paywall must still count, or the funnel undercounts exactly the
    // highest-intent repeat exposures.
    const view = renderPanel(INTERCEPT_GATE);
    const impressions = () => spies.track.mock.calls.filter(([name]) => name === "paywall_viewed");
    expect(impressions()).toHaveLength(1);
    view.rerender(
      <MemoryRouter initialEntries={["/plants/plant-2"]}>
        <PlantAssignedTentAlertsPanel
          tentId="tent-1"
          tentName="Flower Tent"
          growId="grow-1"
          plantId="plant-2"
          doctorCreditGate={INTERCEPT_GATE}
        />
      </MemoryRouter>,
    );
    expect(impressions()).toHaveLength(2);
    // The exposure key stays client-side: every payload is surface-only.
    for (const call of impressions()) {
      expect(call[1]).toEqual({ surface: ALERT_DOCTOR_CREDIT_GATE_SURFACE });
    }
    expect(JSON.stringify(impressions())).not.toContain("plant-2");
  });

  it("no impression when there are no alert rows to gate", () => {
    mocks.rows = [];
    renderPanel(INTERCEPT_GATE);
    expect(spies.track.mock.calls.map(([n]) => n)).not.toContain("paywall_viewed");
    expect(screen.queryByTestId("plant-assigned-tent-alerts-credits-note")).toBeNull();
  });

  it("intercept=false leaves the panel exactly as before — doctor CTA and its event intact", () => {
    const openGate = buildAlertDoctorCreditGate({
      aiCreditsPerGrow: 3,
      entitlementReady: true,
      creditsUsed: 1,
      hasPackCredits: false,
    });
    renderPanel(openGate);
    expect(screen.queryByTestId("plant-assigned-tent-alert-doctor-plans")).toBeNull();
    expect(screen.queryByTestId("plant-assigned-tent-alerts-credits-note")).toBeNull();
    fireEvent.click(screen.getByTestId("plant-assigned-tent-alert-ask-doctor"));
    const names = spies.track.mock.calls.map(([n]) => n);
    expect(names).toContain("ai_doctor_cta_clicked");
    expect(names).not.toContain("paywall_viewed");
    expect(names).not.toContain("paywall_cta_clicked");
  });

  it("an omitted gate prop keeps today's behavior for callers that do not resolve credits", () => {
    renderPanel(undefined);
    expect(screen.getByTestId("plant-assigned-tent-alert-ask-doctor")).toBeInTheDocument();
    expect(screen.queryByTestId("plant-assigned-tent-alert-doctor-plans")).toBeNull();
    expect(spies.track.mock.calls.map(([n]) => n)).not.toContain("paywall_viewed");
  });

  it("Stage Targets keeps its own event while the doctor CTA is intercepted", () => {
    renderPanel(INTERCEPT_GATE);
    fireEvent.click(screen.getByTestId("plant-assigned-tent-alert-target-band"));
    const names = spies.track.mock.calls.map(([n]) => n);
    expect(names).toContain("blueprint_cta_clicked");
    expect(names).not.toContain("paywall_cta_clicked");
  });
});

describe("wiring guardrails", () => {
  const PANEL = read("src/components/PlantAssignedTentAlertsPanel.tsx");
  const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

  it("PlantDetail computes the gate from presentation-only reads and passes it to the panel", () => {
    expect(PLANT_DETAIL).toMatch(/useMyEntitlements\(\)/);
    expect(PLANT_DETAIL).toMatch(/buildAlertDoctorCreditGate\(\{/);
    expect(PLANT_DETAIL).toMatch(/doctorCreditGate=\{doctorCreditGate\}/);
    // The usage read is enabled ONLY once the entitlement resolved to a
    // per-grow-allotment plan — monthly-pool viewers never pay the query.
    expect(PLANT_DETAIL).toMatch(
      /useAlertDoctorCreditGateReads\(\s*entitlementReady && typeof perGrowAiCredits === "number"\s*\?\s*\(plant\?\.growId \?\? null\)\s*:\s*null,?\s*\)/,
    );
    expect(PLANT_DETAIL).toMatch(
      /const entitlementReady = !entitlementLoading && !entitlementLookupFailed;/,
    );
    // A failed refresh keeps stale data alongside isError — the caller must
    // discard cached evidence so the gate fails open rather than keep
    // intercepting on a balance that may have changed.
    expect(PLANT_DETAIL).toMatch(/isError:\s*doctorCreditReadsFailed/);
    expect(PLANT_DETAIL).toMatch(
      /creditsUsed:\s*doctorCreditReadsFailed \? undefined : doctorCreditReads\?\.allowanceUsed,/,
    );
    expect(PLANT_DETAIL).toMatch(
      /hasPackCredits:\s*doctorCreditReadsFailed \? undefined : doctorCreditReads\?\.hasPackCredits,/,
    );
  });

  it("the panel stays hook-free of data reads — the gate arrives as a prop", () => {
    expect(PANEL).not.toMatch(/useMyEntitlements|useAlertDoctorCreditGateReads|useQuery\(/);
    expect(PANEL).toMatch(/doctorCreditGate\?: AlertDoctorCreditGateView \| null/);
  });

  it("gate loader mirrors the allowance arm and only detects (never balances) packs", () => {
    const HOOK = read("src/hooks/useAlertDoctorCreditGateReads.ts");
    // Read-only, own rows, weight + funded_by marker only — never `result`.
    expect(HOOK).toMatch(/\.from\(\s*["']ai_credit_spends["']\s*\)/);
    expect(HOOK).toMatch(/\.select\(\s*["']weight, funded_by:meta->>funded_by["']\s*\)/);
    expect(HOOK).toMatch(/\.eq\(\s*["']user_id["']\s*,\s*user!?\.id\s*\)/);
    expect(HOOK).toMatch(/\.eq\(\s*["']grow_id["']\s*,\s*growId/);
    expect(HOOK).not.toMatch(/\.select\([^)]*result/);
    expect(HOOK).not.toMatch(
      /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(|functions\.invoke/,
    );
    // Allowance filter happens CLIENT-side so NULL meta rows still count
    // (PostgREST neq drops NULLs — the trap this pin guards against).
    expect(HOOK).toMatch(/r\.funded_by === "pack" \? sum : sum \+ \(r\.weight \?\? 0\)/);
    // Pack arm: presence-only grants read; the balance stays server-owned.
    expect(HOOK).toMatch(/\.from\(\s*["']ai_credit_grants["']\s*\)/);
    expect(HOOK).toMatch(/\.select\(\s*["']credits, expires_at["']\s*\)/);
    expect(HOOK).toMatch(/enabled:\s*!!user\s*&&\s*!!growId/);
  });

  it("a CONCLUDED review attempt invalidates the gate reads (no stale dead-end CTA)", () => {
    const LIVE_REVIEW = read("src/components/PlantDetailAiDoctorLiveReview.tsx");
    // The refresh keys on the review-status transition — result AND error
    // both settle credit state (spend / refund / revealed denial) — and
    // must NOT be coupled to session persistence, which is optional and
    // can fail independently while the spend stays consumed.
    const dedupe = LIVE_REVIEW.indexOf("if (review.status === prev) return;");
    const terminalGate = LIVE_REVIEW.indexOf(
      'if (review.status !== "result" && review.status !== "error") return;',
      dedupe,
    );
    const invalidate = LIVE_REVIEW.indexOf(
      'invalidateQueries({ queryKey: ["ai_credit_gate_reads"] })',
      terminalGate,
    );
    expect(dedupe).toBeGreaterThan(-1);
    expect(terminalGate).toBeGreaterThan(dedupe);
    expect(invalidate).toBeGreaterThan(terminalGate);
    // Decoupled from persistence: handlePersisted's callback body carries
    // no gate invalidation.
    const persisted = LIVE_REVIEW.indexOf("const handlePersisted");
    const reviewBinding = LIVE_REVIEW.indexOf("const review = useAiDoctorLiveReview");
    expect(persisted).toBeGreaterThan(-1);
    expect(reviewBinding).toBeGreaterThan(persisted);
    expect(LIVE_REVIEW.slice(persisted, reviewBinding)).not.toContain("ai_credit_gate_reads");
    // The hook's exported key builder shares the same prefix, so the
    // invalidation above actually hits this cache.
    const HOOK = read("src/hooks/useAlertDoctorCreditGateReads.ts");
    expect(HOOK).toMatch(/return \["ai_credit_gate_reads", userId \?\? null, growId \?\? null\]/);
  });

  it("no plan-string gate anywhere in the slice — capability field only", () => {
    const RULES = read("src/lib/alertDoctorCreditGateRules.ts");
    for (const src of [PANEL, RULES]) {
      expect(src).not.toMatch(/effectivePlanId\s*===|plan\s*===\s*["']/);
    }
    expect(RULES).toMatch(/typeof input\.aiCreditsPerGrow === "number"/);
  });

  it("the panel still writes nothing", () => {
    expect(PANEL).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(PANEL).not.toMatch(/functions\.invoke/);
  });
});
