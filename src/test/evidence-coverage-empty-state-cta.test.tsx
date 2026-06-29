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

describe("buildEvidenceCoverageViewModel — coverageHint determinism", () => {
  // Fixed fixture refs. Valid linked rows must carry a safe ref with id + source.
  const linkedRow = (id: string) => ({
    originating_timeline_events: [
      { id, kind: "diary_entry", source: "manual", occurred_at: "2026-01-01T00:00:00Z" },
    ],
  });
  const fallbackRow = () => ({ originating_timeline_events: null });
  const invalidRow = () => ({ originating_timeline_events: [{ raw_payload: "x" }] });

  function shuffleFixed<T>(arr: readonly T[]): T[] {
    // Deterministic reorder: reverse + odd/even interleave. No randomness.
    const rev = [...arr].reverse();
    const evens = rev.filter((_, i) => i % 2 === 0);
    const odds = rev.filter((_, i) => i % 2 === 1);
    return [...evens, ...odds];
  }

  it("hint-rendering case: same counts, different order → same hint (fallback >= linked)", () => {
    const orderA = [
      linkedRow("a-1"),
      linkedRow("a-2"),
      fallbackRow(),
      fallbackRow(),
      fallbackRow(),
      invalidRow(),
    ];
    const orderB = shuffleFixed(orderA);
    const a = buildEvidenceCoverageViewModel({ alerts: orderA, actions: [] });
    const b = buildEvidenceCoverageViewModel({ alerts: orderB, actions: [] });
    expect(a.overall.total).toBe(b.overall.total);
    expect(a.overall.linked).toBe(b.overall.linked);
    expect(a.overall.fallbackOnly).toBe(b.overall.fallbackOnly);
    expect(a.overall.invalidRefs).toBe(b.overall.invalidRefs);
    expect(a.coverageHint).toBe(EVIDENCE_COVERAGE_HINT_FALLBACK_HIGH);
    expect(b.coverageHint).toBe(a.coverageHint);
  });

  it("hint-rendering case: fallbackOnly >= 5 trigger, order-independent", () => {
    const orderA = [
      linkedRow("b-1"),
      linkedRow("b-2"),
      linkedRow("b-3"),
      linkedRow("b-4"),
      linkedRow("b-5"),
      linkedRow("b-6"),
      linkedRow("b-7"),
      fallbackRow(),
      fallbackRow(),
      fallbackRow(),
      fallbackRow(),
      fallbackRow(),
    ];
    const orderB = shuffleFixed(orderA);
    // Split across alerts/actions buckets too — overall must still aggregate equal.
    const a = buildEvidenceCoverageViewModel({
      alerts: orderA.slice(0, 6),
      actions: orderA.slice(6),
    });
    const b = buildEvidenceCoverageViewModel({
      alerts: orderB.slice(0, 6),
      actions: orderB.slice(6),
    });
    expect(a.overall).toEqual(b.overall);
    expect(a.coverageHint).toBe(EVIDENCE_COVERAGE_HINT_FALLBACK_HIGH);
    expect(b.coverageHint).toBe(a.coverageHint);
  });

  it("no-hint case: linked > fallbackOnly and fallbackOnly < 5, order-independent", () => {
    const orderA = [
      linkedRow("c-1"),
      linkedRow("c-2"),
      linkedRow("c-3"),
      linkedRow("c-4"),
      linkedRow("c-5"),
      linkedRow("c-6"),
      linkedRow("c-7"),
      linkedRow("c-8"),
      fallbackRow(),
      fallbackRow(),
    ];
    const orderB = shuffleFixed(orderA);
    const a = buildEvidenceCoverageViewModel({ alerts: orderA, actions: [] });
    const b = buildEvidenceCoverageViewModel({ alerts: orderB, actions: [] });
    expect(a.overall).toEqual(b.overall);
    expect(a.coverageHint).toBeNull();
    expect(b.coverageHint).toBeNull();
  });
});
