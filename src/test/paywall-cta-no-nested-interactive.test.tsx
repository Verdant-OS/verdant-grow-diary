import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { buildPaywallCtaViewModel } from "@/lib/paywallCtaViewModel";
import PaywallCta from "@/components/PaywallCta";

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

    expect(
      container.querySelectorAll(
        '[data-testid="paywall-cta"] a button, [data-testid="paywall-cta"] button a',
      ).length,
    ).toBe(0);

    const control = within(screen.getByTestId("paywall-cta")).getByRole("link", {
      name: vm.primaryCtaLabel,
    });
    expect(control).toHaveAttribute("data-testid", "paywall-cta-link");
    expect(control).toHaveAttribute("href", vm.primaryCtaHref);
    expect(control).toBeInstanceOf(HTMLAnchorElement);
    if (!(control instanceof HTMLAnchorElement)) {
      throw new Error("primary CTA is not an anchor");
    }

    const user = userEvent.setup();
    await user.click(control);
    expect(onPrimaryCtaClick).toHaveBeenCalledTimes(1);
  });
});
