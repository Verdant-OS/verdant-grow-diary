/**
 * diaryCalendarViewModel — expanded-detail tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDiaryCalendarViewModel,
  DIARY_CALENDAR_DETAILS_EMPTY,
} from "@/lib/diaryCalendarViewModel";
import { render, screen, fireEvent } from "@testing-library/react";
import DiaryCalendarSection from "@/components/DiaryCalendarSection";

const __dirname = dirname(fileURLToPath(import.meta.url));

function firstEvent(rawEntries: Parameters<typeof buildDiaryCalendarViewModel>[0]) {
  return buildDiaryCalendarViewModel(rawEntries)[0].events[0];
}

describe("diaryCalendarViewModel — expanded details", () => {
  it("watering exposes amount and method only from safe fields", () => {
    const ev = firstEvent([
      {
        id: "w1",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "watering",
        details: {
          watering_amount_ml: 350,
          method: "Bottom watering",
          mystery_key: "should-not-render",
        },
      },
    ]);
    expect(ev.details.sectionLabel).toBe("Watering details");
    expect(ev.details.fields).toEqual([
      { label: "Amount", value: "350 ml" },
      { label: "Method", value: "Bottom watering" },
    ]);
    expect(ev.details.fallback).toBeNull();
    expect(JSON.stringify(ev.details)).not.toMatch(/mystery_key|should-not-render/);
  });

  it("feeding exposes nutrients, pH, EC, water temp and an EC@25 preview (read-only)", () => {
    const ev = firstEvent([
      {
        id: "f1",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "feeding",
        details: {
          nutrients: "GH 3-2-1",
          ph: 6.2,
          ec: 1.6,
          ec_unit: "mS/cm",
          water_temp_c: 22,
        },
      },
    ]);
    expect(ev.details.sectionLabel).toBe("Feeding details");
    const labels = ev.details.fields.map((f) => f.label);
    expect(labels).toEqual(expect.arrayContaining(["Nutrients", "pH", "EC", "Water temp"]));
    expect(ev.details.ecPreview).not.toBeNull();
    expect(ev.details.ecPreview!.visible).toBe(true);
    expect(ev.details.ecPreview!.disclaimer).toMatch(/Not stored/i);
  });

  it("diagnosis exposes summary, confidence, severity", () => {
    const ev = firstEvent([
      {
        id: "d1",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "diagnosis",
        details: {
          summary: "Calcium deficiency suspected",
          confidence: 0.62,
          severity: "medium",
        },
      },
    ]);
    expect(ev.details.sectionLabel).toBe("Diagnosis details");
    const map = Object.fromEntries(ev.details.fields.map((f) => [f.label, f.value]));
    expect(map.Summary).toBe("Calcium deficiency suspected");
    expect(map.Confidence).toBe("62%");
    expect(map.Severity).toBe("Medium");
  });

  it("empty event with no details and no note shows calm fallback", () => {
    const ev = firstEvent([
      { id: "x", entry_at: "2026-06-10T09:00:00Z", event_type: "watering" },
    ]);
    expect(ev.details.fields).toEqual([]);
    expect(ev.details.ecPreview).toBeNull();
    expect(ev.details.fallback).toBe(DIARY_CALENDAR_DETAILS_EMPTY);
  });

  it("unknown arbitrary keys never become fields", () => {
    const ev = firstEvent([
      {
        id: "f2",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "feeding",
        details: {
          raw_payload: { secret: "tok_LEAK" },
          service_role: "srv_LEAK",
          internal_user_id: "uid_LEAK",
          arbitrary_xyz: 42,
          bearer_token: "Bearer abc",
        },
      },
    ]);
    const serialized = JSON.stringify(ev.details);
    expect(serialized).not.toMatch(/raw_payload|service_role|tok_LEAK|srv_LEAK|uid_LEAK|arbitrary_xyz|bearer_token/i);
    expect(ev.details.fields).toEqual([]);
  });

  it("EC@25 preview is hidden when EC or water temp is missing (never invented)", () => {
    const evNoTemp = firstEvent([
      {
        id: "f3",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "feeding",
        details: { ec: 1.6, ec_unit: "mS/cm" },
      },
    ]);
    expect(evNoTemp.details.ecPreview).toBeNull();
  });
});

describe("diaryCalendarViewModel — static safety (expanded details)", () => {
  it("never stores the EC@25 preview (presenter is marked Not stored)", () => {
    const src = readFileSync(resolve(__dirname, "../lib/diaryCalendarViewModel.ts"), "utf8");
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.rpc\(/);
    expect(src).not.toMatch(/ec_25c_stored|store.*compensated/i);
  });
});

describe("DiaryCalendarSection — expanded details rendering", () => {
  it("renders watering details inline when day is expanded", () => {
    render(
      <DiaryCalendarSection
        rawEntries={[
          {
            id: "w1",
            entry_at: "2026-06-10T09:00:00Z",
            event_type: "watering",
            details: { watering_amount_ml: 250, method: "Top watering" },
          },
        ]}
      />,
    );
    const details = screen.getByTestId("diary-calendar-event-details");
    expect(details).toHaveTextContent(/Watering details/i);
    expect(details).toHaveTextContent("250 ml");
    expect(details).toHaveTextContent("Top watering");
  });

  it("renders feeding EC @25°C preview with the Not-stored disclaimer", () => {
    render(
      <DiaryCalendarSection
        rawEntries={[
          {
            id: "f1",
            entry_at: "2026-06-10T09:00:00Z",
            event_type: "feeding",
            details: { ec: 1.6, ec_unit: "mS/cm", water_temp_c: 22 },
          },
        ]}
      />,
    );
    const preview = screen.getByTestId("diary-calendar-ec-preview");
    expect(preview).toHaveTextContent(/EC @25°C preview/i);
    expect(preview).toHaveTextContent(/Not stored/i);
  });

  it("renders the empty-details fallback for an empty event", () => {
    render(
      <DiaryCalendarSection
        rawEntries={[
          { id: "x", entry_at: "2026-06-10T09:00:00Z", event_type: "diagnosis" },
        ]}
      />,
    );
    expect(
      screen.getByText(/No extra details saved for this entry\./i),
    ).toBeInTheDocument();
  });

  it("expanded UI does not leak raw payload / service_role / token strings", () => {
    const { container } = render(
      <DiaryCalendarSection
        rawEntries={[
          {
            id: "w1",
            entry_at: "2026-06-10T09:00:00Z",
            event_type: "watering",
            details: {
              watering_amount_ml: 100,
              raw_payload: { secret: "tok_LEAK_xyz" },
              service_role: "srv_LEAK_xyz",
              internal_user_id: "uid_LEAK_xyz",
              bearer_token: "Bearer abc",
            },
          },
        ]}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/tok_LEAK_xyz|srv_LEAK_xyz|uid_LEAK_xyz|Bearer abc/);
    expect(html).not.toMatch(/raw_payload|service_role|bearer_token/i);
  });

  it("collapsing a day hides its expanded details", () => {
    render(
      <DiaryCalendarSection
        rawEntries={[
          {
            id: "w1",
            entry_at: "2026-06-10T09:00:00Z",
            event_type: "watering",
            details: { watering_amount_ml: 250 },
          },
        ]}
      />,
    );
    expect(screen.getByTestId("diary-calendar-event-details")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { expanded: true }));
    expect(screen.queryByTestId("diary-calendar-event-details")).not.toBeInTheDocument();
  });
});
