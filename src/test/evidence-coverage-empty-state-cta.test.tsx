/**
 * Evidence Coverage Empty-State CTA v1 — view-model + presenter tests.
 *
 * Read-only. No writes. No automation. No device control.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  buildEvidenceCoverageViewModel,
  computeCoverageHint,
  EMPTY_EVIDENCE_COVERAGE_VIEW_MODEL,
  EVIDENCE_COVERAGE_FALLBACK_HINT_MIN,
  EVIDENCE_COVERAGE_HINT_FALLBACK_HIGH,
  type EvidenceCoverageBucket,
} from "@/lib/evidenceCoverageViewModel";
import { EvidenceCoveragePanel } from "@/components/EvidenceCoveragePanel";

function bucket(
  total: number,
  linked: number,
  fallbackOnly: number,
): EvidenceCoverageBucket {
  return {
    total,
    linked,
    fallbackOnly,
    invalidRefs: 0,
    linkedPct: total > 0 ? Math.round((linked / total) * 100) : 0,
  };
}

describe("computeCoverageHint", () => {
  it("returns null when total is zero", () => {
    expect(computeCoverageHint(bucket(0, 0, 0))).toBeNull();
  });

  it("returns hint when fallbackOnly >= linked and total > 0", () => {
    expect(computeCoverageHint(bucket(4, 2, 2))).toBe(
      EVIDENCE_COVERAGE_HINT_FALLBACK_HIGH,
    );
    expect(computeCoverageHint(bucket(3, 1, 2))).toBe(
      EVIDENCE_COVERAGE_HINT_FALLBACK_HIGH,
    );
  });

  it("returns hint when fallbackOnly >= 5 even if linked is greater", () => {
    expect(computeCoverageHint(bucket(20, 15, EVIDENCE_COVERAGE_FALLBACK_HINT_MIN))).toBe(
      EVIDENCE_COVERAGE_HINT_FALLBACK_HIGH,
    );
  });

  it("returns null when linked > fallbackOnly and fallbackOnly < 5", () => {
    expect(computeCoverageHint(bucket(10, 8, 2))).toBeNull();
    expect(computeCoverageHint(bucket(10, 6, 4))).toBeNull();
  });

  it("hint copy contains no action/automation/diagnosis language", () => {
    const copy = EVIDENCE_COVERAGE_HINT_FALLBACK_HIGH.toLowerCase();
    const banned = [
      "automatically executed",
      "auto execute",
      "device command",
      "set fan",
      "set light",
      "set irrigation",
      "dose nutrients",
      "guaranteed",
      "definitely",
      "diagnosed from photo",
      "raw_payload",
      "service_role",
      "bridge_token",
      "api_token",
      "fake live",
      "broken",
      "unsafe",
      "will backfill",
    ];
    for (const term of banned) {
      expect(copy).not.toContain(term);
    }
  });
});

describe("buildEvidenceCoverageViewModel — coverageHint wiring", () => {
  it("no rows → coverageHint is null", () => {
    const vm = buildEvidenceCoverageViewModel({ alerts: [], actions: [] });
    expect(vm.coverageHint).toBeNull();
  });

  it("fallback-heavy → coverageHint set", () => {
    const alerts = Array.from({ length: 6 }, () => ({}));
    const vm = buildEvidenceCoverageViewModel({ alerts, actions: [] });
    expect(vm.coverageHint).toBe(EVIDENCE_COVERAGE_HINT_FALLBACK_HIGH);
  });
});

describe("EvidenceCoveragePanel — hint render", () => {
  it("renders 'Evidence coverage note' when hint exists", () => {
    const alerts = Array.from({ length: 6 }, () => ({}));
    const vm = buildEvidenceCoverageViewModel({ alerts, actions: [] });
    render(<EvidenceCoveragePanel viewModel={vm} />);
    expect(screen.getByTestId("evidence-coverage-hint")).toBeInTheDocument();
    expect(screen.getByText("Evidence coverage note")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-coverage-hint-copy")).toHaveTextContent(
      /fallback-only rows/i,
    );
  });

  it("does not render hint when null", () => {
    render(
      <EvidenceCoveragePanel viewModel={EMPTY_EVIDENCE_COVERAGE_VIEW_MODEL} />,
    );
    expect(screen.queryByTestId("evidence-coverage-hint")).not.toBeInTheDocument();
    expect(screen.queryByText("Evidence coverage note")).not.toBeInTheDocument();
  });

  it("renders no CTA button inside the hint", () => {
    const alerts = Array.from({ length: 6 }, () => ({}));
    const vm = buildEvidenceCoverageViewModel({ alerts, actions: [] });
    const { container } = render(<EvidenceCoveragePanel viewModel={vm} />);
    const hint = container.querySelector('[data-testid="evidence-coverage-hint"]');
    expect(hint).not.toBeNull();
    expect(hint!.querySelectorAll("button").length).toBe(0);
    expect(hint!.querySelectorAll("a").length).toBe(0);
  });

  it("hint HTML contains no raw refs, payloads, or secrets", () => {
    const alerts = Array.from({ length: 6 }, () => ({}));
    const vm = buildEvidenceCoverageViewModel({ alerts, actions: [] });
    const { container } = render(<EvidenceCoveragePanel viewModel={vm} />);
    const html = (container.innerHTML || "").toLowerCase();
    for (const term of [
      "raw_payload",
      "service_role",
      "bridge_token",
      "api_token",
      "prompt",
      "completion",
      "model_output",
      "fake live",
    ]) {
      expect(html).not.toContain(term);
    }
  });
});
