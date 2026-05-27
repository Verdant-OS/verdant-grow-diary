import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "fs";
import { resolve } from "path";
import VpdStageMissingBadge from "@/components/VpdStageMissingBadge";

const SRC = readFileSync(
  resolve(__dirname, "../components/VpdStageMissingBadge.tsx"),
  "utf8",
);

describe("VpdStageMissingBadge component", () => {
  it("renders the exact required copy", () => {
    render(<VpdStageMissingBadge testId="vpd-stage-missing-badge-test" />);
    expect(screen.getByText("Info")).toBeTruthy();
    expect(
      screen.getByText("Set plant stage to evaluate VPD targets."),
    ).toBeTruthy();
  });

  it("applies the supplied testId as data-testid", () => {
    render(<VpdStageMissingBadge testId="custom-id" />);
    expect(screen.getByTestId("custom-id")).toBeTruthy();
  });

  it("merges optional className with base classes", () => {
    render(
      <VpdStageMissingBadge testId="merge-id" className="mt-7-custom" />,
    );
    const el = screen.getByTestId("merge-id");
    expect(el.className).toContain("mt-7-custom");
    expect(el.className).toContain("rounded-lg");
  });

  it("has role='status' for assistive tech", () => {
    render(<VpdStageMissingBadge testId="role-id" />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("source contains no alert/queue/automation/device-control writes", () => {
    expect(SRC).not.toMatch(
      /saveAlert|logAlertEvent|action_queue|service_role|automation|device.control|from\(['"]alerts['"]\)/i,
    );
  });
});
