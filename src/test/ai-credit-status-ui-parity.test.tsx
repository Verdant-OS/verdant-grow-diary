/**
 * Shared AI credit UI parity tests for Doctor and Coach (post-transport
 * unification slice).
 *
 * Covers:
 *  - View model copy per surface, charged=false, no-paywall fence.
 *  - Shared presenter renders correct copy on both surfaces and never
 *    emits a paywall/upgrade CTA, pricing link, or "/pricing" anchor.
 *  - Doctor live-review presenter renders the service-degraded notice on
 *    `upstream_credit_exhausted` (and NOT a credit-limit notice).
 *  - Coach page renders the service-degraded notice via the shared
 *    presenter.
 *  - Shared adapter passes `credit_denied` and `upstream_credit_exhausted`
 *    through unchanged.
 *  - Badge hidden for missing / NaN / replayed-only credit on both
 *    surfaces.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  buildAiCreditServiceDegradedViewModel,
  type AiCreditServiceDegradedSurface,
} from "@/lib/aiCreditServiceDegradedViewModel";
import AiCreditServiceDegradedNotice from "@/components/AiCreditServiceDegradedNotice";
import AiCreditRemainingBadge from "@/components/AiCreditRemainingBadge";
import { adaptCreditedAiResponse } from "@/lib/aiCreditedResponseAdapter";

describe("AI credit service-degraded view model (upstream_credit_exhausted)", () => {
  it("doctor copy mentions Doctor unavailability and 'not charged'", () => {
    const vm = buildAiCreditServiceDegradedViewModel("doctor");
    expect(vm.title).toBe("AI Doctor is briefly unavailable.");
    expect(vm.body).toMatch(/not charged/i);
    expect(vm.charged).toBe(false);
    expect(vm.showPaywallCta).toBe(false);
  });

  it("coach copy mentions Coach unavailability and 'not charged'", () => {
    const vm = buildAiCreditServiceDegradedViewModel("coach");
    expect(vm.title).toBe("AI Coach is briefly unavailable.");
    expect(vm.body).toMatch(/not charged/i);
    expect(vm.charged).toBe(false);
    expect(vm.showPaywallCta).toBe(false);
  });

  it("never contains paywall/upgrade language on either surface", () => {
    for (const s of ["doctor", "coach"] as AiCreditServiceDegradedSurface[]) {
      const vm = buildAiCreditServiceDegradedViewModel(s);
      const text = `${vm.title} ${vm.body}`.toLowerCase();
      for (const banned of ["upgrade", "pro", "pricing", "buy", "subscribe", "paywall"]) {
        expect(text).not.toContain(banned);
      }
    }
  });
});

describe("<AiCreditServiceDegradedNotice />", () => {
  it("doctor surface renders Doctor copy and no paywall/link/button", () => {
    const { container } = render(
      <AiCreditServiceDegradedNotice surface="doctor" />,
    );
    expect(
      screen.getByTestId("doctor-upstream-credit-exhausted-notice"),
    ).toBeTruthy();
    expect(container.textContent).toContain("AI Doctor is briefly unavailable.");
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("coach surface renders Coach copy and no paywall/link/button", () => {
    const { container } = render(
      <AiCreditServiceDegradedNotice surface="coach" />,
    );
    expect(
      screen.getByTestId("coach-upstream-credit-exhausted-notice"),
    ).toBeTruthy();
    expect(container.textContent).toContain("AI Coach is briefly unavailable.");
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
});

describe("Adapter passes credit envelopes through unchanged", () => {
  const ok = (c: unknown) => ({ ok: true as const, result: c });
  it("passes credit_denied through with credit payload", () => {
    const outcome = adaptCreditedAiResponse(
      {
        ok: false,
        reason: "credit_denied",
        credit: {
          ok: false,
          status: "denied",
          reason: "limit_reached",
          scope: "per_grow",
          plan_id: "free",
        },
      },
      ok,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok === false) {
      expect(outcome.reason).toBe("credit_denied");
      expect(outcome.credit?.plan_id).toBe("free");
    }
  });

  it("passes upstream_credit_exhausted through", () => {
    const outcome = adaptCreditedAiResponse(
      { ok: false, reason: "upstream_credit_exhausted" },
      ok,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok === false) {
      expect(outcome.reason).toBe("upstream_credit_exhausted");
    }
  });
});

describe("Remaining badge — hidden for missing/invalid/replayed credit (both surfaces)", () => {
  for (const surface of ["doctor", "coach"] as const) {
    it(`${surface}: hidden when credit is null`, () => {
      const { container } = render(
        <AiCreditRemainingBadge credit={null} surface={surface} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it(`${surface}: hidden when remaining is NaN`, () => {
      const { container } = render(
        <AiCreditRemainingBadge
          credit={{ remaining: Number.NaN, scope: "per_month", scope_limit: 100 }}
          surface={surface}
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it(`${surface}: hidden for replayed-only payload (no remaining)`, () => {
      const { container } = render(
        <AiCreditRemainingBadge
          credit={{ replayed: true } as never}
          surface={surface}
        />,
      );
      expect(container.firstChild).toBeNull();
    });
  }

  it("doctor success renders doctor badge with 'AI Doctor credits left'", () => {
    render(
      <AiCreditRemainingBadge
        credit={{ remaining: 2, scope: "per_grow", scope_limit: 3 }}
        surface="doctor"
        data-testid="doctor-badge"
      />,
    );
    expect(screen.getByTestId("doctor-badge-label").textContent).toBe(
      "2 of 3 AI Doctor credits left for this grow",
    );
  });

  it("coach success renders coach badge with 'AI Coach credits left'", () => {
    render(
      <AiCreditRemainingBadge
        credit={{ remaining: 4, scope: "per_month", scope_limit: 100 }}
        surface="coach"
        data-testid="coach-badge"
      />,
    );
    expect(screen.getByTestId("coach-badge-label").textContent).toBe(
      "4 of 100 AI Coach credits left this month",
    );
  });
});
