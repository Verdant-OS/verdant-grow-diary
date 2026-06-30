/**
 * Verdant Release Readiness Status — render + safety tests.
 *
 * Reflects post-PR-#112-merge snapshot:
 *  - PR #112 row renders as MERGED
 *  - Full-suite parser receipt renders as PASS with documented run details
 *  - Auth loading smoke renders as WARNING and is visible
 *  - Overall release posture stays HOLD (not "fully released" / "live green")
 *  - Old PR #112 pending/billing blocker copy is gone
 *  - Static / manual / doc-receipt labeling remains visible
 *  - No live fetch / Supabase / GitHub API calls are introduced
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

  it("renders HOLD overall and release posture with verification-pending reason", () => {
    renderPage();
    const exec = screen.getByTestId("release-readiness-executive");
    expect(exec.textContent ?? "").toContain("HOLD");
    expect(exec.textContent ?? "").toMatch(/verification pending/i);
  });

  it("renders the post-merge ecowitt-artifact blocker and drops closed blockers", () => {
    renderPage();
    expect(
      screen.getByTestId("release-readiness-blocker-ecowitt-artifact"),
    ).toBeInTheDocument();
    // Closed blockers must NOT be re-rendered.
    expect(
      screen.queryByTestId("release-readiness-blocker-ci-billing"),
    ).toBeNull();
    expect(
      screen.queryByTestId("release-readiness-blocker-pr-112-receipt"),
    ).toBeNull();
  });

  it("renders PR #112 batched full-suite as MERGED with merge details", () => {
    renderPage();
    const row = screen.getByTestId(
      "release-readiness-check-pr-112-batched-full-suite",
    );
    const text = row.textContent ?? "";
    expect(text).toContain("MERGED");
    expect(text).toContain("4eb63ba");
    expect(text).toContain("5bc657fc");
    expect(text).toMatch(/16\s*\/\s*16/);
    expect(text).toContain("22,187");
    expect(text).toMatch(/0 oo?ms?/i);
  });

  it("renders the full-suite parser receipt as PASS (no pending copy)", () => {
    renderPage();
    const row = screen.getByTestId(
      "release-readiness-check-full-suite-parser",
    );
    expect(row.textContent ?? "").toContain("PASS");
    expect(row.textContent ?? "").toContain("28463133281");
    expect(row.textContent ?? "").not.toMatch(/blocked behind ci billing/i);
    expect(row.textContent ?? "").not.toMatch(/pr\s*#?112\s*parser-generated\s*full-suite\s*receipt\s*pending/i);
  });

  it("renders Auth loading smoke WARNING and tracks it separately", () => {
    renderPage();
    const row = screen.getByTestId(
      "release-readiness-check-auth-loading-smoke",
    );
    expect(row.textContent ?? "").toContain("WARNING");
    expect(row.textContent ?? "").toMatch(/flaky/i);
    expect(row.textContent ?? "").toMatch(/repo-wide/i);
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

  it("never claims live CI / release-green / fully-released status", () => {
    const { container } = renderPage();
    const text = (container.textContent ?? "").toLowerCase();
    for (const phrase of RELEASE_READINESS_FORBIDDEN_PHRASES) {
      expect(text).not.toContain(phrase.toLowerCase());
    }
    const release = screen
      .getByTestId("release-readiness-executive")
      .textContent ?? "";
    expect(release).not.toMatch(/release\s*:\s*go/i);
    expect(release).not.toMatch(/fully released/i);
  });

  it("view model overall status stays HOLD until remaining gates are proven on main", () => {
    expect(RELEASE_READINESS_VIEW_MODEL.overall.status).toBe("HOLD");
    expect(RELEASE_READINESS_VIEW_MODEL.release.status).toBe("HOLD");
  });

  describe("Evidence Receipts section", () => {
    it("renders the evidence section with HOLD posture (active blockers)", () => {
      renderPage();
      const section = screen.getByTestId("release-readiness-evidence");
      expect(section).toBeInTheDocument();
      expect(
        screen.getByTestId("release-readiness-evidence-posture").textContent,
      ).toBe("HOLD");
    });

    it("does not show missing CI evidence message now that PR #112 receipt is PASS", () => {
      renderPage();
      expect(
        screen.queryByTestId("release-readiness-evidence-missing"),
      ).toBeNull();
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

    it("never shows GO posture while active blockers remain", () => {
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
