/**
 * Verdant Release Readiness Status v1 — render + safety tests.
 *
 * Asserts:
 *  - HOLD overall status is rendered
 *  - page does not claim full CI GO / live green
 *  - blockers are visible (billing, full-suite, ecowitt)
 *  - Action Queue approval-required note is visible
 *  - static/manual source label is visible
 *  - manual commands render
 *  - no forbidden "live green" / "auto-fixed" wording
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReleaseReadiness from "@/pages/ReleaseReadiness";
import {
  RELEASE_READINESS_VIEW_MODEL,
  RELEASE_READINESS_FORBIDDEN_PHRASES,
} from "@/lib/releaseReadinessViewModel";

function renderPage() {
  return render(
    <MemoryRouter>
      <ReleaseReadiness />
    </MemoryRouter>,
  );
}

describe("ReleaseReadiness page", () => {
  it("renders the page shell and source label", () => {
    renderPage();
    expect(screen.getByTestId("release-readiness-page")).toBeInTheDocument();
    const src = screen.getByTestId("release-readiness-source-label");
    expect(src.textContent ?? "").toMatch(/static\s*\/\s*manual/i);
    expect(src.textContent ?? "").not.toMatch(/live ci feed of/i);
  });

  it("renders HOLD overall and release posture", () => {
    renderPage();
    const exec = screen.getByTestId("release-readiness-executive");
    expect(exec.textContent ?? "").toContain("HOLD");
    expect(exec.textContent ?? "").toMatch(/parser-generated/i);
  });

  it("renders required blockers", () => {
    renderPage();
    expect(
      screen.getByTestId("release-readiness-blocker-ci-billing"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("release-readiness-blocker-pr-112-receipt"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("release-readiness-blocker-ecowitt-artifact"),
    ).toBeInTheDocument();
  });

  it("renders Action Queue approval-required preservation check", () => {
    renderPage();
    const row = screen.getByTestId(
      "release-readiness-check-action-queue-approval",
    );
    expect(row.textContent ?? "").toMatch(/approval-required/i);
    expect(row.textContent ?? "").toContain("PRESERVED");
  });

  it("renders all manual commands from the view model", () => {
    renderPage();
    for (const cmd of RELEASE_READINESS_VIEW_MODEL.commands) {
      const el = screen.getByTestId(`release-readiness-command-${cmd.id}`);
      expect(el.textContent ?? "").toContain(cmd.command);
    }
  });

  it("never claims live CI / release-green / auto-fixed status", () => {
    const { container } = renderPage();
    const text = (container.textContent ?? "").toLowerCase();
    for (const phrase of RELEASE_READINESS_FORBIDDEN_PHRASES) {
      expect(text).not.toContain(phrase.toLowerCase());
    }
    // Defensive: avoid any "GO" verdict on the release line.
    const release = screen
      .getByTestId("release-readiness-executive")
      .textContent ?? "";
    expect(release).not.toMatch(/release\s*:\s*go/i);
  });

  it("view model overall status stays HOLD until receipts land", () => {
    expect(RELEASE_READINESS_VIEW_MODEL.overall.status).toBe("HOLD");
    expect(RELEASE_READINESS_VIEW_MODEL.release.status).toBe("HOLD");
  });

  describe("Evidence Receipts section", () => {
    it("renders the evidence section with HOLD posture", () => {
      renderPage();
      const section = screen.getByTestId("release-readiness-evidence");
      expect(section).toBeInTheDocument();
      expect(
        screen.getByTestId("release-readiness-evidence-posture").textContent,
      ).toBe("HOLD");
    });

    it("shows missing CI evidence message when receipt is absent", () => {
      renderPage();
      const missing = screen.getByTestId("release-readiness-evidence-missing");
      expect(missing.textContent ?? "").toMatch(
        /missing parser-generated full-suite ci receipt/i,
      );
    });

    it("shows local targeted disclaimer that it does not unlock GO", () => {
      renderPage();
      const el = screen.getByTestId(
        "release-readiness-evidence-disclaimer-local_targeted",
      );
      expect(el.textContent ?? "").toMatch(/does not unlock release go/i);
    });

    it("shows manual note disclaimer as context only", () => {
      renderPage();
      const el = screen.getByTestId(
        "release-readiness-evidence-disclaimer-manual_operator_note",
      );
      expect(el.textContent ?? "").toMatch(/context only/i);
    });

    it("never shows GO posture in the evidence section without passing CI", () => {
      renderPage();
      expect(
        screen.getByTestId("release-readiness-evidence-posture").textContent,
      ).not.toBe("GO");
    });

    it("page source does not add fetch / supabase writes / github API", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const src = fs.readFileSync(
        path.resolve(__dirname, "..", "pages", "ReleaseReadiness.tsx"),
        "utf8",
      );
      for (const term of [
        "fetch(",
        "supabase",
        "functions.invoke",
        "api.github.com",
        "service_role",
        "setInterval",
      ]) {
        expect(src).not.toContain(term);
      }
    });
  });
});
