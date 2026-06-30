/**
 * LineageRepairCta tests — grower-facing dashboard/archive CTA must:
 *   - render a link to /grow-lineage
 *   - not expose operator-only copy
 *   - not imply automatic mutation
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LineageRepairCta from "@/components/LineageRepairCta";
import { APP_ROUTES } from "@/lib/appRouteManifest";

function wrap() {
  return render(
    <MemoryRouter>
      <LineageRepairCta />
    </MemoryRouter>,
  );
}

describe("LineageRepairCta", () => {
  it("renders a link to /grow-lineage", () => {
    wrap();
    const link = screen.getByTestId("lineage-repair-cta-link").querySelector("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/grow-lineage");
  });

  it("uses grower-facing copy and does not mention operator/admin/automation", () => {
    wrap();
    const body = screen.getByTestId("lineage-repair-cta-body").textContent ?? "";
    expect(body.toLowerCase()).not.toMatch(/operator|admin|automatic|device|debug/);
    expect(body).toMatch(/approve/i);
  });

  it("targets a manifest 'auth' route, not operator/internal", () => {
    const entry = APP_ROUTES.find((r) => r.path === "/grow-lineage");
    expect(entry?.access).toBe("auth");
  });
});
