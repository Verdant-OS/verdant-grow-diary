/**
 * Wiring test — the structured ManualSensorSnapshotReviewPanel appears inside
 * the existing review prompt, exposes the "manual" source, and gates
 * "Save anyway" on canSave. Normal readings still bypass the prompt.
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

describe("ManualSensorReadingCard — review panel wiring", () => {
  beforeEach(() => {
    insertSpy.mockClear();
    insertSpy.mockResolvedValue(undefined);
  });

  it("renders the structured review panel inside the review prompt", () => {
    renderCard();
    setField(/Air temp/i, "24"); // suspicious → prompt opens
    setField(/Humidity/i, "55");
    fireEvent.click(screen.getByTestId("manual-reading-save"));

    const prompt = screen.getByTestId("manual-reading-review-prompt");
    expect(prompt).toBeInTheDocument();
    const panel = screen.getByTestId("manual-sensor-snapshot-review-panel");
    expect(prompt.contains(panel)).toBe(true);

    // Source label is always "manual", never "live".
    expect(screen.getByTestId("snapshot-source-chip")).toHaveTextContent(/^manual$/);
    expect(panel.getAttribute("data-source")).toBe("manual");
    expect(prompt.textContent ?? "").not.toMatch(/\blive\b/i);
  });

  it("Save anyway remains enabled when review has warnings only (canSave=true)", async () => {
    renderCard();
    setField(/Air temp/i, "24");
    setField(/Humidity/i, "55");
    fireEvent.click(screen.getByTestId("manual-reading-save"));

    const panel = screen.getByTestId("manual-sensor-snapshot-review-panel");
    expect(panel.getAttribute("data-can-save")).toBe("true");

    const saveAnyway = screen.getByTestId("manual-reading-review-save-anyway");
    expect(saveAnyway).not.toBeDisabled();

    fireEvent.click(saveAnyway);
    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    // Every payload row is source: "manual" — never "live".
    for (const call of insertSpy.mock.calls) {
      expect(call[0].source).toBe("manual");
    }
  });

  it("normal readings still save without the review prompt or panel appearing", async () => {
    renderCard();
    setField(/Air temp/i, "76");
    setField(/Humidity/i, "55");
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    expect(screen.queryByTestId("manual-reading-review-prompt")).toBeNull();
    expect(screen.queryByTestId("manual-sensor-snapshot-review-panel")).toBeNull();
  });
});
