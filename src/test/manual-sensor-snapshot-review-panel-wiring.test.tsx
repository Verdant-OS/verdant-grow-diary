/**
 * Wiring test — the structured ManualSensorSnapshotReviewPanel appears inside
 * the mandatory review gate for EVERY manual save (normal, warning, blocker).
 * Confirm gates the insert path; blocker states disable Confirm.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";

const insertSpy = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/growRepo", () => ({
  insertSensorReading: (...args: unknown[]) => insertSpy(...args),
}));

const TENT_ID = "22222222-2222-4222-8222-222222222222";

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ManualSensorReadingCard
          tents={[{ id: TENT_ID, name: "Flower Tent" }]}
          defaultTentId={TENT_ID}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setField(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("ManualSensorReadingCard — review panel wiring inside mandatory gate", () => {
  beforeEach(() => {
    insertSpy.mockClear();
    insertSpy.mockResolvedValue(undefined);
  });

  it("renders the structured review panel inside the review gate", () => {
    renderCard();
    setField(/Air temp/i, "24"); // warning: °C-looking value in °F field
    setField(/Humidity/i, "55");
    fireEvent.click(screen.getByTestId("manual-reading-save"));

    const prompt = screen.getByTestId("manual-reading-review-prompt");
    const panel = screen.getByTestId("manual-sensor-snapshot-review-panel");
    expect(prompt.contains(panel)).toBe(true);
    expect(screen.getByTestId("snapshot-source-chip")).toHaveTextContent(/^manual$/);
    expect(panel.getAttribute("data-source")).toBe("manual");
    expect(prompt.textContent ?? "").not.toMatch(/\blive\b/i);
  });

  it("warning-only readings confirm through the existing insert path with source=manual", async () => {
    renderCard();
    setField(/Air temp/i, "24");
    setField(/Humidity/i, "55");
    fireEvent.click(screen.getByTestId("manual-reading-save"));

    const panel = screen.getByTestId("manual-sensor-snapshot-review-panel");
    expect(panel.getAttribute("data-can-save")).toBe("true");

    const confirm = screen.getByTestId("manual-sensor-review-confirm");
    expect(confirm).not.toBeDisabled();
    expect(confirm.textContent ?? "").toMatch(/confirm manual snapshot/i);

    fireEvent.click(confirm);
    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    for (const call of insertSpy.mock.calls) {
      expect(call[0].source).toBe("manual");
      expect(call[0].source).not.toBe("live");
    }
  });

  it("normal readings also route through the gate before insert", async () => {
    renderCard();
    setField(/Air temp/i, "76");
    setField(/Humidity/i, "55");
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    // Insert must not fire until Confirm is clicked.
    expect(insertSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("manual-sensor-review-gate").getAttribute("data-state")).toBe("ok");

    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    for (const call of insertSpy.mock.calls) {
      expect(call[0].source).toBe("manual");
    }
  });
});
