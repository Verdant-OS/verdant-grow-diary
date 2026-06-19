/**
 * Component tests for the First-Run Checklist presenter.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FirstRunChecklist from "@/components/FirstRunChecklist";
import { FIRST_RUN_DISMISS_STORAGE_KEY } from "@/lib/firstRunChecklistViewModel";

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(() => {
  cleanup();
  try {
    window.localStorage.removeItem(FIRST_RUN_DISMISS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

describe("FirstRunChecklist component", () => {
  it("renders when setup is incomplete", () => {
    renderWithRouter(
      <FirstRunChecklist
        growCount={0}
        tentCount={0}
        plantCount={0}
        quickLogCount={0}
        sensorSnapshotCount={0}
      />,
    );
    expect(screen.getByTestId("first-run-checklist")).toBeTruthy();
    expect(screen.getByText(/First-Run One-Tent Checklist/i)).toBeTruthy();
  });

  it("renders all five steps with labels and CTAs", () => {
    renderWithRouter(
      <FirstRunChecklist growCount={0} tentCount={0} plantCount={0} />,
    );
    expect(screen.getByTestId("first-run-step-create_grow")).toBeTruthy();
    expect(screen.getByTestId("first-run-step-add_tent")).toBeTruthy();
    expect(screen.getByTestId("first-run-step-add_plant")).toBeTruthy();
    expect(screen.getByTestId("first-run-step-first_quick_log")).toBeTruthy();
    expect(
      screen.getByTestId("first-run-step-first_sensor_snapshot"),
    ).toBeTruthy();
    expect(screen.getByText(/Create grow/)).toBeTruthy();
    expect(screen.getByText(/Add tent/)).toBeTruthy();
    expect(screen.getByText(/Add plant/)).toBeTruthy();
  });

  it("dismiss button writes localStorage", () => {
    renderWithRouter(
      <FirstRunChecklist growCount={1} tentCount={0} plantCount={0} />,
    );
    fireEvent.click(screen.getByTestId("first-run-checklist-dismiss"));
    expect(
      window.localStorage.getItem(FIRST_RUN_DISMISS_STORAGE_KEY),
    ).toBe("1");
  });

  it("hides when dismissed with partial (non-zero-grow) setup", () => {
    window.localStorage.setItem(FIRST_RUN_DISMISS_STORAGE_KEY, "1");
    renderWithRouter(
      <FirstRunChecklist growCount={1} tentCount={0} plantCount={0} />,
    );
    expect(screen.queryByTestId("first-run-checklist")).toBeNull();
    expect(screen.getByTestId("first-run-checklist-restore")).toBeTruthy();
  });

  it("zero-grow override: stays visible even when dismissed", () => {
    window.localStorage.setItem(FIRST_RUN_DISMISS_STORAGE_KEY, "1");
    renderWithRouter(
      <FirstRunChecklist growCount={0} tentCount={0} plantCount={0} />,
    );
    expect(screen.getByTestId("first-run-checklist")).toBeTruthy();
    expect(screen.queryByTestId("first-run-checklist-restore")).toBeNull();
  });

  it("'Show setup checklist' restores the card", () => {
    window.localStorage.setItem(FIRST_RUN_DISMISS_STORAGE_KEY, "1");
    renderWithRouter(
      <FirstRunChecklist growCount={1} tentCount={1} plantCount={0} />,
    );
    fireEvent.click(screen.getByTestId("first-run-checklist-restore"));
    expect(screen.getByTestId("first-run-checklist")).toBeTruthy();
    expect(window.localStorage.getItem(FIRST_RUN_DISMISS_STORAGE_KEY)).toBeNull();
  });

  it("renders nothing when fully activated", () => {
    renderWithRouter(
      <FirstRunChecklist
        growCount={1}
        tentCount={1}
        plantCount={1}
        quickLogCount={1}
        sensorSnapshotCount={1}
      />,
    );
    expect(screen.queryByTestId("first-run-checklist")).toBeNull();
    expect(screen.queryByTestId("first-run-checklist-restore")).toBeNull();
  });
});
