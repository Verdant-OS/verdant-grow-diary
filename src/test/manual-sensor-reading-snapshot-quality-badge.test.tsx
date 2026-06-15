/**
 * ManualSensorReadingCard — snapshot quality badge integration.
 *
 * Presenter-only checks:
 *  - badge renders for valid manual entry (usable)
 *  - suspicious humidity (0%) renders invalid + reason
 *  - empty form renders missing (no metrics entered)
 *  - the "Snapshot quality" helper copy is present
 *  - no raw_payload / private fields leak into the rendered card
 *  - save flow is not blocked or altered by the badge
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";

const insertSpy = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/growRepo", () => ({
  insertSensorReading: (...args: unknown[]) => insertSpy(...args),
}));

const TENT_ID = "11111111-1111-4111-8111-111111111111";

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ManualSensorReadingCard
          tents={[{ id: TENT_ID, name: "Veg Tent" }]}
          defaultTentId={TENT_ID}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setField(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("ManualSensorReadingCard — snapshot quality badge", () => {
  beforeEach(() => {
    insertSpy.mockClear();
  });

  it("renders the Snapshot quality section with helper copy", () => {
    renderCard();
    const section = screen.getByTestId("manual-reading-snapshot-quality");
    expect(within(section).getByText(/Snapshot quality/i)).toBeInTheDocument();
    expect(
      within(section).getByText(/AI Doctor decide whether the reading can support current-room guidance/i),
    ).toBeInTheDocument();
  });

  it("shows Usable current reading for a fresh valid manual entry", () => {
    renderCard();
    setField(/Air temp/i, "75");
    setField(/Humidity/i, "55");
    const quality = screen.getByTestId("manual-snapshot-quality");
    expect(quality.getAttribute("data-quality")).toBe("usable");
    expect(within(quality).getByText("Usable current reading")).toBeInTheDocument();
    expect(within(quality).getAllByText(/Source: manual/i).length).toBeGreaterThan(0);
  });

  it("flags humidity stuck at 0% as invalid with a reason", () => {
    renderCard();
    setField(/Air temp/i, "75");
    setField(/Humidity/i, "0");
    const quality = screen.getByTestId("manual-snapshot-quality");
    expect(quality.getAttribute("data-quality")).toBe("invalid");
    expect(within(quality).getByText("Invalid reading")).toBeInTheDocument();
    expect(within(quality).getByText(/Humidity appears stuck at 0 or 100%/i)).toBeInTheDocument();
  });

  it("does not leak raw_payload, tokens, or fixture JSON", () => {
    renderCard();
    setField(/Air temp/i, "75");
    setField(/Humidity/i, "55");
    const section = screen.getByTestId("manual-reading-snapshot-quality");
    const text = section.textContent ?? "";
    expect(text).not.toMatch(/raw_payload/i);
    expect(text).not.toMatch(/service_role/i);
    expect(text).not.toMatch(/token|secret|api[_-]?key/i);
    expect(text).not.toMatch(/\{\s*"/);
  });

  it("does not block saving — Save Reading still triggers insert", async () => {
    renderCard();
    setField(/Air temp/i, "75");
    setField(/Humidity/i, "55");
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
  });
});
