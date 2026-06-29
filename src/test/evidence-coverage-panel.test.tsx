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

describe("EvidenceCoveragePanel", () => {
  it("renders heading and counts for alerts/actions/overall", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        { originating_timeline_events: [validRef] },
        { originating_timeline_events: [] },
      ],
      actions: [{ originating_timeline_events: [validRef] }],
    });
    render(<EvidenceCoveragePanel viewModel={vm} status="ok" />);
    expect(
      screen.getByRole("heading", { name: /read-only evidence coverage/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("evidence-coverage-alerts-total")).toHaveTextContent("2");
    expect(screen.getByTestId("evidence-coverage-alerts-linked")).toHaveTextContent("1");
    expect(screen.getByTestId("evidence-coverage-alerts-fallback")).toHaveTextContent("1");
    expect(screen.getByTestId("evidence-coverage-actions-total")).toHaveTextContent("1");
    expect(screen.getByTestId("evidence-coverage-overall-total")).toHaveTextContent("3");
    expect(screen.getByTestId("evidence-coverage-overall-linked")).toHaveTextContent("2");
  });

  it("renders fallback-only explanation in notes", () => {
    const vm = buildEvidenceCoverageViewModel({ alerts: [], actions: [] });
    render(<EvidenceCoveragePanel viewModel={vm} />);
    const notes = screen.getByTestId("evidence-coverage-notes").textContent ?? "";
    expect(notes.toLowerCase()).toContain("fallback-only");
    expect(notes.toLowerCase()).toContain("does not infer");
  });

  it("does not render raw refs, payloads, tokens, prompts, or internal IDs", () => {
    const vm = buildEvidenceCoverageViewModel({
      alerts: [
        {
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
      actions: [],
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
    // "healthy" must not be claimed
    expect(html).not.toMatch(/\bhealthy\b/);
  });

  it("renders loading and unavailable states without crashing", () => {
    const vm = buildEvidenceCoverageViewModel({ alerts: [], actions: [] });
    const { rerender } = render(
      <EvidenceCoveragePanel viewModel={vm} status="loading" />,
    );
    expect(screen.getByText(/loading coverage/i)).toBeInTheDocument();
    rerender(<EvidenceCoveragePanel viewModel={vm} status="unavailable" />);
    expect(screen.getByText(/coverage unavailable/i)).toBeInTheDocument();
  });
});
