import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { buildPaywallCtaViewModel } from "@/lib/paywallCtaViewModel";
import PaywallCta from "@/components/PaywallCta";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

describe("PaywallCta primary CTA is one focusable link", () => {
  function renderCta(onPrimaryCtaClick?: () => void) {
    const vm = buildPaywallCtaViewModel({
      featureTitle: "Advanced timeline filtering",
      requiredPlanLabel: "Pro",
      currentPlanLabel: "Free",
    });
    return {
      vm,
      ...render(
        <MemoryRouter>
          <PaywallCta vm={vm} onPrimaryCtaClick={onPrimaryCtaClick} />
        </MemoryRouter>,
      ),
    };
  }

  it("does not nest a button inside the See plans link", async () => {
    const onPrimaryCtaClick = vi.fn();
    const { container, vm } = renderCta(onPrimaryCtaClick);
    const root = container.querySelector('[data-testid="paywall-cta"]');
    expect(root).not.toBeNull();

    expect(
      container.querySelectorAll(
        '[data-testid="paywall-cta"] a button, [data-testid="paywall-cta"] button a',
      ).length,
    ).toBe(0);

    const labelled = [...(root?.querySelectorAll(FOCUSABLE_SELECTOR) ?? [])].filter(
      (element) => (element.textContent ?? "").trim() === vm.primaryCtaLabel,
    );
    expect(labelled).toHaveLength(1);
    const control = labelled[0];
    expect(control?.tagName).toBe("A");
    expect(control).toHaveAttribute("data-testid", "paywall-cta-link");
    expect(control).toHaveAttribute("href", vm.primaryCtaHref);

    const user = userEvent.setup();
    await user.click(control as HTMLElement);
    expect(onPrimaryCtaClick).toHaveBeenCalledTimes(1);
  });
});
