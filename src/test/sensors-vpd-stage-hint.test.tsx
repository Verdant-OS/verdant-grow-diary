/**
 * Render test: confirms the stage-aware VPD helper copy appears on the
 * Sensors page (a key surface). Presenter-only assertion — no behavior change.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sensors from "@/pages/Sensors";
import { VPD_STAGE_HELPER_TEXT } from "@/lib/vpdStageTargetRules";

function renderSensors() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Sensors />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Sensors page — stage-aware VPD helper copy", () => {
  it("renders the stage-aware VPD helper text under the VPD chart card", () => {
    renderSensors();
    const hint = screen.getByTestId("sensors-vpd-stage-hint");
    expect(hint).toBeInTheDocument();
    expect(hint.textContent).toBe(VPD_STAGE_HELPER_TEXT);
  });
});
