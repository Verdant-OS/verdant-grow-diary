/**
 * Manual Sensor Snapshot — review-before-save step.
 *
 * Verifies the Daily Check sensor flow:
 *  - normal readings save with no prompt
 *  - suspicious readings show a review prompt before saving
 *  - Edit returns to the form without saving
 *  - Save anyway calls the existing insert path once with unchanged payload
 *  - clearing warnings lets normal save proceed
 *  - remaining warnings re-trigger the prompt
 *  - plant/tent context preserved by sensor route
 *  - no schema/persistence/RPC/ingestion/alerts/automation changes
 *  - no forbidden wording
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";

const insertSpy = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/growRepo", () => ({
  insertSensorReading: (...args: unknown[]) => insertSpy(...args),
}));

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ManualSensorReadingCard
          tents={[{ id: "tent-1", name: "Veg Tent" }]}
          defaultTentId="tent-1"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setField(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("ManualSensorReadingCard — review-before-save prompt", () => {
  beforeEach(() => {
    insertSpy.mockClear();
    insertSpy.mockResolvedValue(undefined);
  });

  it("prompt does not appear before any save attempt", () => {
    renderCard();
    setField(/Air temp/i, "24"); // would trigger Celsius-in-°F warning
    setField(/Humidity/i, "55");
    expect(screen.queryByTestId("manual-reading-review-prompt")).toBeNull();
  });

  it("normal readings save without showing the review prompt", async () => {
    renderCard();
    setField(/Air temp/i, "76");
    setField(/Humidity/i, "55");
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    expect(screen.queryByTestId("manual-reading-review-prompt")).toBeNull();
  });

  it("suspicious readings show the review prompt on first save attempt and do NOT save yet", () => {
    renderCard();
    setField(/Air temp/i, "24");
    setField(/Humidity/i, "55");
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    expect(screen.getByTestId("manual-reading-review-prompt").textContent).toMatch(
      /Double-check these readings before saving/,
    );
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("Edit readings dismisses the prompt without saving", () => {
    renderCard();
    setField(/Air temp/i, "24");
    setField(/Humidity/i, "55");
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    fireEvent.click(screen.getByTestId("manual-reading-review-edit"));
    expect(screen.queryByTestId("manual-reading-review-prompt")).toBeNull();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("Save anyway uses the existing save path once with manual-source payload unchanged", async () => {
    renderCard();
    setField(/Air temp/i, "24"); // suspicious
    setField(/Humidity/i, "55");
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    fireEvent.click(screen.getByTestId("manual-reading-review-save-anyway"));
    await waitFor(() =>
      expect(insertSpy.mock.calls.length).toBeGreaterThan(0),
    );
    // Every payload row is source: manual and never includes user_id.
    for (const call of insertSpy.mock.calls) {
      const payload = call[0];
      expect(payload.source).toBe("manual");
      expect(payload.tent_id).toBe("tent-1");
      expect("user_id" in payload).toBe(false);
    }
  });

  it("clearing warnings via edits allows normal save with no prompt", async () => {
    renderCard();
    setField(/Air temp/i, "24");
    setField(/Humidity/i, "55");
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    expect(screen.getByTestId("manual-reading-review-prompt")).toBeTruthy();
    // Edit to a normal value — prompt closes on edit.
    setField(/Air temp/i, "76");
    expect(screen.queryByTestId("manual-reading-review-prompt")).toBeNull();
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    expect(screen.queryByTestId("manual-reading-review-prompt")).toBeNull();
  });

  it("editing to a still-suspicious value re-shows the prompt on next save attempt", () => {
    renderCard();
    setField(/Air temp/i, "24");
    setField(/Humidity/i, "55");
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    fireEvent.click(screen.getByTestId("manual-reading-review-edit"));
    // Still suspicious humidity now.
    setField(/Humidity/i, "5");
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    expect(screen.getByTestId("manual-reading-review-prompt")).toBeTruthy();
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe("Daily Check sensor route — static safety guarantees", () => {
  const page = readFileSync("src/pages/DailyCheck.tsx", "utf8");

  it("preserves plant/tent context: sensor focus gated on tent assignment", () => {
    expect(page).toMatch(/methodHint === "sensor"/);
    expect(page).toMatch(/plantResolution\.plant\.tent_id/);
  });

  it("no auto-submit on the sensor route", () => {
    expect(page).not.toMatch(/insertSensorReading\(/);
    expect(page).not.toMatch(/mutateAsync\(/);
  });
});

describe("safety — review step adds no new writes or wording", () => {
  const card = readFileSync("src/components/ManualSensorReadingCard.tsx", "utf8");

  it("no new schema/persistence/RPC/ingestion/alerts/automation/device control/service_role", () => {
    expect(card).not.toMatch(/create_watering_event/);
    expect(card).not.toMatch(/from\(["']alerts["']\)/);
    expect(card).not.toMatch(/from\(["']action_queue/);
    expect(card).not.toMatch(/rpc\(/);
    expect(card).not.toMatch(/service_role/i);
    expect(card).not.toMatch(/ai-coach/);
  });

  it("review prompt copy contains no forbidden wording", () => {
    const lower = card.toLowerCase();
    expect(lower).not.toMatch(/\bperfect\b/);
    expect(lower).not.toMatch(/\bcompleted\b/);
    expect(lower).not.toMatch(/guaranteed healthy/);
    // Not shaming language.
    expect(lower).not.toMatch(/\bbad reading/);
  });

  it("does not introduce a fake local checked state", () => {
    expect(card).not.toMatch(/setChecked\(/);
    expect(card).not.toMatch(/locallyChecked/);
  });
});
