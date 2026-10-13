/**
 * Pins the production error-reporting disclosure on the privacy policy.
 * Not legal advice — this test pins product copy, not legal sufficiency.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import PrivacyPolicy from "@/pages/PrivacyPolicy";

const REMOVED_DATA =
  /user details, cookies, request headers and bodies, URL query strings, and error message text/i;
const RETENTION_PERIOD = /\d+\s*(day|month|year)/i;

function renderPolicy() {
  return render(
    <MemoryRouter>
      <PrivacyPolicy />
    </MemoryRouter>,
  );
}

describe("privacy policy error reporting copy", () => {
  it("names Sentry", () => {
    renderPolicy();
    expect(document.body.textContent ?? "").toMatch(/Sentry/);
  });

  it("says error reporting runs whether or not you accept analytics", () => {
    renderPolicy();
    expect(document.body.textContent ?? "").toMatch(/runs whether or not you accept analytics/i);
  });

  it("discloses the IP address in transit", () => {
    renderPolicy();
    expect(document.body.textContent ?? "").toMatch(/IP address in transit/i);
  });

  it("lists the data removed before a report leaves the browser", () => {
    renderPolicy();
    expect(document.body.textContent ?? "").toMatch(REMOVED_DATA);
  });

  it("says retention is not yet confirmed and states no retention period on the error-reporting item", () => {
    renderPolicy();
    expect(document.body.textContent ?? "").toMatch(/not yet confirmed/i);
    const item = screen.getByText(/Error reporting — Sentry/i).closest("li");
    expect(item).not.toBeNull();
    expect(item?.textContent ?? "").not.toMatch(RETENTION_PERIOD);
  });
});
