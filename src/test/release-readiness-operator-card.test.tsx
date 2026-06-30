/**
 * ReleaseReadinessOperatorCard — role-aware visibility tests.
 *
 * Verifies:
 *  - non-operator, loading, error, unauthenticated states render nothing
 *    (the /operator/release-readiness path never appears in the DOM).
 *  - granted operators see a single navigation link with the documented copy.
 *  - the rendered card is navigation-only (no forms, no mutations) and never
 *    claims live CI / live data.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const roleState: {
  status: "loading" | "granted" | "denied" | "unauthenticated" | "error";
} = { status: "denied" };

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({
    status: roleState.status,
    granted: roleState.status === "granted",
    error: roleState.status === "error" ? new Error("rpc") : null,
  }),
}));

import ReleaseReadinessOperatorCard, {
  RELEASE_READINESS_PATH,
} from "@/components/ReleaseReadinessOperatorCard";

function renderCard() {
  return render(
    <MemoryRouter>
      <ReleaseReadinessOperatorCard />
    </MemoryRouter>,
  );
}

describe("ReleaseReadinessOperatorCard", () => {
  beforeEach(() => {
    roleState.status = "denied";
  });

  it("renders nothing for non-operator users", () => {
    renderCard();
    expect(screen.queryByTestId("release-readiness-operator-card")).toBeNull();
    expect(document.body.textContent ?? "").not.toContain(
      RELEASE_READINESS_PATH,
    );
  });

  for (const status of ["loading", "unauthenticated", "error"] as const) {
    it(`renders nothing while role status is "${status}"`, () => {
      roleState.status = status;
      renderCard();
      expect(screen.queryByTestId("release-readiness-operator-card")).toBeNull();
      expect(document.body.textContent ?? "").not.toContain(
        RELEASE_READINESS_PATH,
      );
    });
  }

  it("renders the card with link for operator users", () => {
    roleState.status = "granted";
    renderCard();
    const cta = screen.getByTestId("release-readiness-operator-card-cta");
    const anchor = cta.tagName === "A" ? cta : cta.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe(RELEASE_READINESS_PATH);
    expect(RELEASE_READINESS_PATH).toBe("/operator/release-readiness");
    expect(screen.getAllByText(/release readiness/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/static\s*\/\s*manual/i)).toBeInTheDocument();
  });

  it("renders no forms or submit buttons (navigation only)", () => {
    roleState.status = "granted";
    renderCard();
    const submit = document.querySelectorAll(
      "button[type='submit'], form",
    );
    expect(submit.length).toBe(0);
  });

  it("never claims live CI / live data in the copy", () => {
    roleState.status = "granted";
    renderCard();
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const phrase of [
      "live ci",
      "ci is green",
      "release is green",
      "live feed",
      "all systems go",
    ]) {
      expect(text).not.toContain(phrase);
    }
  });
});
