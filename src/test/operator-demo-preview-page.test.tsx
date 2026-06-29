/**
 * OperatorDemoPreview page — render + safety tests.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({ status: "granted", granted: true, error: null }),
}));

import OperatorDemoPreview from "@/pages/OperatorDemoPreview";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function renderPage() {
  return render(
    <MemoryRouter>
      <OperatorDemoPreview />
    </MemoryRouter>,
  );
}

describe("OperatorDemoPreview", () => {
  it("renders heading and read-only preview copy", () => {
    renderPage();
    expect(
      screen.getByRole("heading", {
        name: /one-tent evidence chain demo preview/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no database writes are performed/i)).toBeInTheDocument();
  });

  it("renders Demo source badge (never Live)", () => {
    renderPage();
    const badge = screen.getByTestId("operator-demo-preview-source-badge");
    expect(badge.textContent?.trim()).toBe("Demo");
    expect(document.body.textContent ?? "").not.toMatch(/\bLive\b/);
  });

  it("renders alert section with evidence badges from safe refs", () => {
    renderPage();
    const alert = screen.getByTestId("operator-demo-preview-alert");
    const badges = within(alert).getByTestId("evidence-linkage-badges");
    expect(badges).toBeInTheDocument();
    expect(badges.getAttribute("data-count")).toBe("1");
  });

  it("renders action section with forwarded evidence badges + pending approval", () => {
    renderPage();
    const action = screen.getByTestId("operator-demo-preview-action");
    expect(
      within(action).getByTestId("operator-demo-preview-action-status").textContent,
    ).toMatch(/pending approval/i);
    expect(
      within(action).getByTestId("evidence-linkage-badges"),
    ).toBeInTheDocument();
  });

  it("renders post-grow eligibility section", () => {
    renderPage();
    const section = screen.getByTestId("operator-demo-preview-post-grow");
    expect(section.textContent ?? "").toMatch(/eligible/i);
    expect(section.textContent ?? "").toMatch(/archived/i);
  });

  it("does not render raw UUIDs in the grow label area", () => {
    renderPage();
    const header = screen.getByTestId("operator-demo-preview");
    // The walkthrough must not surface raw UUID-shaped strings as labels.
    // (Evidence refs themselves are short fixture ids, not UUIDs.)
    const headerText =
      header.querySelector("header")?.textContent ?? "";
    expect(UUID_RE.test(headerText)).toBe(false);
  });

  it("renders no mutation controls (buttons/forms)", () => {
    renderPage();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.querySelectorAll("form").length).toBe(0);
    expect(document.querySelectorAll("input,textarea,select").length).toBe(0);
  });

  it("does not render raw payload / token / debug content", () => {
    renderPage();
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const bad of [
      "raw_payload",
      "service_role",
      "bridge_token",
      "api_token",
      "access_token",
      "refresh_token",
      "model_output",
    ]) {
      expect(text).not.toContain(bad);
    }
  });

  it("does not claim demo data is healthy", () => {
    renderPage();
    const text = (document.body.textContent ?? "").toLowerCase();
    expect(text).not.toContain("healthy");
    expect(text).not.toContain("automatically executes");
    expect(text).not.toContain("device command");
  });
});
