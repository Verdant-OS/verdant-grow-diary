/**
 * AiCreditRemainingBadge — presenter tests (S3.1).
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import AiCreditRemainingBadge from "@/components/AiCreditRemainingBadge";

describe("<AiCreditRemainingBadge />", () => {
  it("renders nothing when credit is missing", () => {
    const { container } = render(<AiCreditRemainingBadge credit={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing on unknown scope", () => {
    const { container } = render(
      <AiCreditRemainingBadge
        credit={{ remaining: 5, scope: "weird", scope_limit: 10 }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders per_grow label, no helper, no link/CTA", () => {
    const { getByTestId, queryByRole, queryByTestId, container } = render(
      <AiCreditRemainingBadge
        credit={{ remaining: 2, scope: "per_grow", scope_limit: 3 }}
      />,
    );
    expect(getByTestId("ai-credit-remaining-badge-label").textContent).toBe(
      "2 of 3 AI Doctor credits left for this grow",
    );
    expect(queryByTestId("ai-credit-remaining-badge-helper")).toBeNull();
    expect(queryByRole("link")).toBeNull();
    expect(queryByRole("button")).toBeNull();
    // No anchor or button anywhere.
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders per_month label + helper, still no CTA", () => {
    const { getByTestId, queryByRole, container } = render(
      <AiCreditRemainingBadge
        credit={{
          remaining: 100,
          scope: "per_month",
          scope_limit: 100,
          period_key: "2026-06",
        }}
      />,
    );
    expect(getByTestId("ai-credit-remaining-badge-label").textContent).toBe(
      "100 of 100 AI Doctor credits left this month",
    );
    expect(getByTestId("ai-credit-remaining-badge-helper").textContent).toBe(
      "Resets on the 1st of the month (UTC).",
    );
    expect(queryByRole("link")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
});
