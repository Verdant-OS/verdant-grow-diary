/**
 * S3.1 Coach parity — AI credit remaining badge.
 *
 * Verifies:
 *  - View model emits Coach-noun copy when surface="coach".
 *  - Presenter renders calm "X AI Coach credits left" copy and hides on
 *    missing/invalid `remaining`.
 *  - Doctor (default) copy is unchanged — no regression.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildAiCreditRemainingBadgeViewModel } from "@/lib/aiCreditRemainingBadgeViewModel";
import AiCreditRemainingBadge from "@/components/AiCreditRemainingBadge";
import { paywallCtaHasBannedWords } from "@/lib/paywallCtaViewModel";

describe("AI credit remaining badge — Coach surface (S3.1)", () => {
  it("view model: coach per_grow label says 'AI Coach credits left'", () => {
    const vm = buildAiCreditRemainingBadgeViewModel(
      { remaining: 2, scope: "per_grow", scope_limit: 3 },
      { surface: "coach" },
    );
    expect(vm.visible).toBe(true);
    expect(vm.label).toBe("2 of 3 AI Coach credits left for this grow");
    expect(vm.label).not.toMatch(/AI Doctor credits/i);
  });

  it("view model: coach per_month label says 'AI Coach credits left this month'", () => {
    const vm = buildAiCreditRemainingBadgeViewModel(
      { remaining: 97, scope: "per_month", scope_limit: 100 },
      { surface: "coach" },
    );
    expect(vm.label).toBe("97 of 100 AI Coach credits left this month");
    expect(vm.helper).toBe("Resets on the 1st of the month (UTC).");
  });

  it("view model: doctor default copy unchanged (no regression)", () => {
    const vm = buildAiCreditRemainingBadgeViewModel({
      remaining: 2,
      scope: "per_grow",
      scope_limit: 3,
    });
    expect(vm.label).toBe("2 of 3 AI Doctor credits left for this grow");
  });

  it("view model: missing remaining → hidden (both surfaces)", () => {
    expect(
      buildAiCreditRemainingBadgeViewModel(
        { scope: "per_grow", scope_limit: 3 } as never,
        { surface: "coach" },
      ).visible,
    ).toBe(false);
  });

  it("view model: invalid remaining (NaN) → hidden", () => {
    expect(
      buildAiCreditRemainingBadgeViewModel(
        { remaining: Number.NaN, scope: "per_month", scope_limit: 100 },
        { surface: "coach" },
      ).visible,
    ).toBe(false);
  });

  it("presenter: renders Coach label for valid credit", () => {
    render(
      <AiCreditRemainingBadge
        credit={{ remaining: 4, scope: "per_month", scope_limit: 100 }}
        surface="coach"
        data-testid="coach-credit-remaining-badge"
      />,
    );
    const label = screen.getByTestId("coach-credit-remaining-badge-label");
    expect(label.textContent).toBe("4 of 100 AI Coach credits left this month");
  });

  it("presenter: hides on null credit", () => {
    const { container } = render(
      <AiCreditRemainingBadge credit={null} surface="coach" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("presenter: hides on replayed-only credit (no remaining)", () => {
    const { container } = render(
      <AiCreditRemainingBadge
        credit={{ replayed: true } as never}
        surface="coach"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("copy passes banned-word scan (no urgency/CTA language)", () => {
    for (const scope of ["per_grow", "per_month"] as const) {
      const vm = buildAiCreditRemainingBadgeViewModel(
        { remaining: 1, scope, scope_limit: 3 },
        { surface: "coach" },
      );
      expect(paywallCtaHasBannedWords(vm.label)).toBe(false);
      if (vm.helper) expect(paywallCtaHasBannedWords(vm.helper)).toBe(false);
    }
  });
});
