import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvidenceCoveragePanel } from "@/components/EvidenceCoveragePanel";
import { buildEvidenceCoverageViewModel } from "@/lib/evidenceCoverageViewModel";

const validRef = {
  id: "ref-1",
  kind: "sensor_snapshot",
  source: "live",
  occurred_at: "2026-01-01T00:00:00Z",
};

describe("EvidenceCoveragePanel — category breakdown", () => {
  it("renders the Coverage by category heading and subcopy", () => {
    const vm = buildEvidenceCoverageViewModel({ alerts: [], actions: [] });
    render(<EvidenceCoveragePanel viewModel={vm} />);
    expect(
      screen.getByRole("heading", { name: /coverage by category/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/grouped counts only/i),
    ).toBeInTheDocument();
  });

  it("renders alert category rows", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        { metric: "vpd", originating_timeline_events: [validRef] },
        { metric: "vpd", originating_timeline_events: [] },
        { metric: "temp", originating_timeline_events: [validRef] },
      ],
      actions: [],
    });
    render(<EvidenceCoveragePanel viewModel={vm} />);
    expect(
      screen.getByTestId("evidence-coverage-alerts-by-category-row-vpd"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("evidence-coverage-alerts-by-category-row-temp"),
    ).toBeInTheDocument();
  });

  it("renders action category rows", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [],
      actions: [
        { action_type: "adjust_vpd", originating_timeline_events: [validRef] },
        { action_type: "check_runoff", originating_timeline_events: [] },
      ],
    });
    render(<EvidenceCoveragePanel viewModel={vm} />);
    expect(
      screen.getByTestId(
        "evidence-coverage-actions-by-category-row-adjust_vpd",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(
        "evidence-coverage-actions-by-category-row-check_runoff",
      ),
    ).toBeInTheDocument();
  });

  it("renders empty-state copy when no categories", () => {
    const vm = buildEvidenceCoverageViewModel({ alerts: [], actions: [] });
    render(<EvidenceCoveragePanel viewModel={vm} />);
    expect(
      screen.getByText(/no alert categories to summarize yet/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no action categories to summarize yet/i),
    ).toBeInTheDocument();
  });

  it("never renders raw refs, payloads, tokens, prompts, or automation/healthy claims", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        {
          metric: "vpd",
          originating_timeline_events: [
            {
              id: "leak-id-9999",
              kind: "sensor_snapshot",
              source: "live",
              occurred_at: "2026-01-01T00:00:00Z",
            },
          ],
        },
      ],
      actions: [
        { action_type: "adjust_vpd", originating_timeline_events: [] },
      ],
    });
    const { container } = render(<EvidenceCoveragePanel viewModel={vm} />);
    const html = container.innerHTML.toLowerCase();
    for (const banned of [
      "leak-id-9999",
      "raw_payload",
      "service_role",
      "bridge_token",
      "api_token",
      "access_token",
      "refresh_token",
      "jwt",
      "prompt",
      "completion",
      "model_output",
      "fake live",
      "auto execute",
      "device command",
      "guaranteed",
      "definitely",
    ]) {
      expect(html).not.toContain(banned);
    }
    expect(html).not.toMatch(/\bhealthy\b/);
  });
});
