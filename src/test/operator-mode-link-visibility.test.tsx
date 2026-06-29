/**
 * OperatorModeLink + OperatorModeCallout — role-aware visibility tests.
 *
 * The operator path (/operator/demo-preview) must never be rendered to the
 * DOM for non-operators or while the role check is loading. Granted users see
 * a single link that navigates only (no writes, no mutations).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const roleState: { status: string } = { status: "denied" };

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({
    status: roleState.status,
    granted: roleState.status === "granted",
    error: null,
  }),
}));

import OperatorModeLink, { OPERATOR_MODE_PATH } from "@/components/OperatorModeLink";
import OperatorModeCallout from "@/components/OperatorModeCallout";

function renderLink(variant: "sidebar" | "mobile" = "sidebar") {
  return render(
    <MemoryRouter>
      <OperatorModeLink variant={variant} />
    </MemoryRouter>,
  );
}
function renderCallout() {
  return render(
    <MemoryRouter>
      <OperatorModeCallout />
    </MemoryRouter>,
  );
}

describe("OperatorModeLink", () => {
  beforeEach(() => { roleState.status = "denied"; });

  it("renders nothing for non-operator users", () => {
    renderLink();
    expect(screen.queryByTestId("operator-mode-link-sidebar")).toBeNull();
    expect(document.body.textContent ?? "").not.toContain(OPERATOR_MODE_PATH);
    expect((document.body.textContent ?? "").toLowerCase()).not.toContain("operator mode");
  });

  it("renders nothing while role status is loading", () => {
    roleState.status = "loading";
    renderLink();
    expect(screen.queryByTestId("operator-mode-link-sidebar")).toBeNull();
    expect(document.body.textContent ?? "").not.toContain(OPERATOR_MODE_PATH);
  });

  it("renders the link for operator users pointing at /operator/demo-preview", () => {
    roleState.status = "granted";
    renderLink();
    const link = screen.getByTestId("operator-mode-link-sidebar");
    expect(link.getAttribute("href")).toBe(OPERATOR_MODE_PATH);
    expect(OPERATOR_MODE_PATH).toBe("/operator/demo-preview");
    expect(link.textContent).toMatch(/operator mode/i);
  });

  it("renders the mobile variant with its own test id", () => {
    roleState.status = "granted";
    renderLink("mobile");
    expect(screen.getByTestId("operator-mode-link-mobile")).toBeInTheDocument();
  });
});

describe("OperatorModeCallout", () => {
  beforeEach(() => { roleState.status = "denied"; });

  it("renders nothing for non-operator users", () => {
    renderCallout();
    expect(screen.queryByTestId("operator-mode-callout")).toBeNull();
  });

  it("renders nothing while role status is loading", () => {
    roleState.status = "loading";
    renderCallout();
    expect(screen.queryByTestId("operator-mode-callout")).toBeNull();
  });

  it("renders CTA for operator users with link to /operator/demo-preview", () => {
    roleState.status = "granted";
    renderCallout();
    const cta = screen.getByTestId("operator-mode-callout-cta");
    const anchor = cta.tagName === "A" ? cta : cta.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("/operator/demo-preview");
    expect(screen.getByText(/open the protected demo preview/i)).toBeInTheDocument();
  });

  it("renders no buttons that submit forms or mutate data", () => {
    roleState.status = "granted";
    renderCallout();
    const submit = document.querySelectorAll("button[type='submit'], form");
    expect(submit.length).toBe(0);
  });
});
