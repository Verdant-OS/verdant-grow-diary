/**
 * Diary calendar event drawer — view model + UI tests.
 *
 * Safety:
 *  - Read-only UI. No writes, no Action Queue, no device control.
 *  - Drawer must never render raw payloads, vendor metadata, tokens,
 *    service_role strings, private keys, internal IDs, or unknown keys.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, fireEvent, within } from "@testing-library/react";
import DiaryCalendarSection from "@/components/DiaryCalendarSection";
import { buildDiaryCalendarViewModel } from "@/lib/diaryCalendarViewModel";
import {
  buildDiaryCalendarEventDrawerViewModel,
  DIARY_CALENDAR_DRAWER_CLOSE_LABEL,
  DIARY_CALENDAR_DRAWER_VIEW_LABEL,
  DIARY_CALENDAR_DRAWER_PHOTO_EMPTY,
  DIARY_CALENDAR_DRAWER_SENSOR_EMPTY,
  DIARY_CALENDAR_DRAWER_PHOTO_ATTACHED,
  DIARY_CALENDAR_DRAWER_SENSOR_LINKED,
} from "@/lib/diaryCalendarEventDrawerViewModel";

const __dirname = dirname(fileURLToPath(import.meta.url));

function firstEvent(raw: Parameters<typeof buildDiaryCalendarViewModel>[0]) {
  return buildDiaryCalendarViewModel(raw)[0].events[0];
}

function openFirstDrawer(rawEntries: any) {
  render(<DiaryCalendarSection rawEntries={rawEntries} />);
  const btns = screen.getAllByRole("button", {
    name: DIARY_CALENDAR_DRAWER_VIEW_LABEL,
  });
  fireEvent.click(btns[0]);
}

describe("diaryCalendarEventDrawerViewModel — pure", () => {
  it("watering drawer exposes safe summary + measurement fields only", () => {
    const ev = firstEvent([
      {
        id: "w1",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "watering",
        details: {
          watering_amount_ml: 350,
          method: "Bottom watering",
          ph: 6.2,
          plant_name: "Blue Dream A1",
          mystery_key: "should-not-render",
          service_role: "leak",
          raw_payload: { secret: "x" },
        },
      },
    ]);
    const model = buildDiaryCalendarEventDrawerViewModel(ev, {
      watering_amount_ml: 350,
      method: "Bottom watering",
      ph: 6.2,
      plant_name: "Blue Dream A1",
      mystery_key: "should-not-render",
      service_role: "leak",
      raw_payload: { secret: "x" },
      access_token: "Bearer abc",
    });
    expect(model.title).toBe("Watering");
    expect(model.summary.fields).toContainEqual({
      label: "Method",
      value: "Bottom watering",
    });
    expect(model.measurements.fields).toContainEqual({
      label: "Amount",
      value: "350 ml",
    });
    expect(model.measurements.fields).toContainEqual({
      label: "pH",
      value: "6.20",
    });
    expect(model.plantMemory.fields).toContainEqual({
      label: "Plant",
      value: "Blue Dream A1",
    });
    const serialized = JSON.stringify(model);
    expect(serialized).not.toMatch(/mystery_key|should-not-render/);
    expect(serialized).not.toMatch(/service_role|raw_payload|Bearer|access_token|secret/);
  });

  it("feeding drawer surfaces safe nutrients + EC@25 preview", () => {
    const ev = firstEvent([
      {
        id: "f1",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "feeding",
        details: {
          nutrients: "GH 3-2-1",
          ph: 6.1,
          ec: 1.6,
          ec_unit: "mS/cm",
          water_temp_c: 22,
        },
      },
    ]);
    const model = buildDiaryCalendarEventDrawerViewModel(ev, {
      nutrients: "GH 3-2-1",
      ph: 6.1,
      ec: 1.6,
      ec_unit: "mS/cm",
      water_temp_c: 22,
    });
    expect(model.summary.fields).toContainEqual({
      label: "Nutrients",
      value: "GH 3-2-1",
    });
    expect(model.measurements.fields.some((f) => f.label === "EC")).toBe(true);
    expect(model.measurements.ecPreview).not.toBeNull();
    expect(model.measurements.ecPreview?.disclaimer).toMatch(/Not stored/i);
  });

  it("environment-check style fields render safely when present", () => {
    const ev = firstEvent([
      {
        id: "w2",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "watering",
        details: {
          temp_c: 23.4,
          humidity_pct: 55,
          vpd_kpa: 1.1,
          co2_ppm: 800,
          ppfd: 600,
        },
      },
    ]);
    const model = buildDiaryCalendarEventDrawerViewModel(ev, {
      temp_c: 23.4,
      humidity_pct: 55,
      vpd_kpa: 1.1,
      co2_ppm: 800,
      ppfd: 600,
    });
    const labels = model.measurements.fields.map((f) => f.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Air temp", "Humidity", "VPD", "CO₂", "PPFD"]),
    );
  });

  it("diagnosis drawer summarizes summary/confidence/severity safely", () => {
    const ev = firstEvent([
      {
        id: "d1",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "diagnosis",
        details: {
          summary: "Possible nitrogen deficiency",
          likely_issue: "N deficiency",
          confidence: 0.62,
          severity: "medium",
        },
      },
    ]);
    const model = buildDiaryCalendarEventDrawerViewModel(ev, {
      summary: "Possible nitrogen deficiency",
      likely_issue: "N deficiency",
      confidence: 0.62,
      severity: "medium",
    });
    expect(model.summary.fields).toEqual([
      { label: "Summary", value: "Possible nitrogen deficiency" },
      { label: "Likely issue", value: "N deficiency" },
      { label: "Confidence", value: "62%" },
      { label: "Severity", value: "Medium" },
    ]);
  });

  it("early-stage milestone/vigor surface safely when present", () => {
    const ev = firstEvent([
      {
        id: "w3",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "watering",
        details: {
          stage: "seedling",
          milestone: "First true leaves",
          vigor: "good",
        },
      },
    ]);
    const model = buildDiaryCalendarEventDrawerViewModel(ev, {
      stage: "seedling",
      milestone: "First true leaves",
      vigor: "good",
    });
    expect(model.plantMemory.fields).toEqual(
      expect.arrayContaining([
        { label: "Stage", value: "Seedling" },
        { label: "Milestone", value: "First true leaves" },
        { label: "Vigor", value: "Good" },
      ]),
    );
  });

  it("missing attachments resolve to calm empty copy", () => {
    const ev = firstEvent([
      {
        id: "w4",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "watering",
        details: { method: "Top watering" },
      },
    ]);
    const model = buildDiaryCalendarEventDrawerViewModel(ev, {
      method: "Top watering",
    });
    expect(model.attachments.photoLabel).toBe(DIARY_CALENDAR_DRAWER_PHOTO_EMPTY);
    expect(model.attachments.sensorLabel).toBe(DIARY_CALENDAR_DRAWER_SENSOR_EMPTY);
  });

  it("attachments report presence only when allowlisted keys exist", () => {
    const ev = firstEvent([
      {
        id: "w5",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "watering",
        details: {
          photo_path: "private/tenant-1/abc.jpg",
          sensor_snapshot_id: "snap-internal-id-123",
        },
      },
    ]);
    const model = buildDiaryCalendarEventDrawerViewModel(ev, {
      photo_path: "private/tenant-1/abc.jpg",
      sensor_snapshot_id: "snap-internal-id-123",
    });
    expect(model.attachments.photoLabel).toBe(DIARY_CALENDAR_DRAWER_PHOTO_ATTACHED);
    expect(model.attachments.sensorLabel).toBe(DIARY_CALENDAR_DRAWER_SENSOR_LINKED);
    const serialized = JSON.stringify(model);
    expect(serialized).not.toMatch(/private\/tenant-1|abc\.jpg|snap-internal-id-123/);
  });
});

describe("DiaryCalendarSection — event drawer UI", () => {
  it("opens drawer from a calendar event with accessible name", () => {
    openFirstDrawer([
      {
        id: "w1",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "watering",
        details: { watering_amount_ml: 250, method: "Top watering" },
      },
    ]);
    const drawer = screen.getByTestId("diary-calendar-event-drawer");
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByText("Watering")).toBeInTheDocument();
    expect(within(drawer).getByText("Summary")).toBeInTheDocument();
    expect(within(drawer).getByText("Measurements")).toBeInTheDocument();
    expect(within(drawer).getByText("Plant memory")).toBeInTheDocument();
    expect(within(drawer).getByText("Attachments")).toBeInTheDocument();
    expect(within(drawer).getByText("Read-only diary event")).toBeInTheDocument();
    expect(
      within(drawer).getByText("Derived previews are not stored"),
    ).toBeInTheDocument();
  });

  it("closes drawer via accessible close control", () => {
    openFirstDrawer([
      {
        id: "w1",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "watering",
        details: { method: "Top watering" },
      },
    ]);
    const close = screen.getByRole("button", {
      name: DIARY_CALENDAR_DRAWER_CLOSE_LABEL,
    });
    fireEvent.click(close);
    expect(screen.queryByTestId("diary-calendar-event-drawer")).not.toBeInTheDocument();
  });

  it("feeding drawer renders safe fields and EC@25 preview", () => {
    openFirstDrawer([
      {
        id: "f1",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "feeding",
        details: {
          nutrients: "GH 3-2-1",
          ph: 6.1,
          ec: 1.6,
          ec_unit: "mS/cm",
          water_temp_c: 22,
        },
      },
    ]);
    const drawer = screen.getByTestId("diary-calendar-event-drawer");
    expect(within(drawer).getByText("GH 3-2-1")).toBeInTheDocument();
    expect(within(drawer).getByText("6.10")).toBeInTheDocument();
    expect(
      within(drawer).getByTestId("diary-calendar-event-drawer-ec-preview"),
    ).toBeInTheDocument();
  });

  it("diagnosis drawer surfaces summary/confidence/severity", () => {
    openFirstDrawer([
      {
        id: "d1",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "diagnosis",
        details: {
          summary: "Possible nitrogen deficiency",
          confidence: 0.62,
          severity: "medium",
        },
      },
    ]);
    const drawer = screen.getByTestId("diary-calendar-event-drawer");
    expect(
      within(drawer).getByText("Possible nitrogen deficiency"),
    ).toBeInTheDocument();
    expect(within(drawer).getByText("62%")).toBeInTheDocument();
    expect(within(drawer).getByText("Medium")).toBeInTheDocument();
  });

  it("missing attachments show calm empty states in drawer", () => {
    openFirstDrawer([
      {
        id: "w1",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "watering",
        details: { method: "Top watering" },
      },
    ]);
    const drawer = screen.getByTestId("diary-calendar-event-drawer");
    expect(
      within(drawer).getByText(DIARY_CALENDAR_DRAWER_PHOTO_EMPTY),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByText(DIARY_CALENDAR_DRAWER_SENSOR_EMPTY),
    ).toBeInTheDocument();
  });

  it("drawer never renders raw_payload/service_role/token/private keys/unknown keys", () => {
    openFirstDrawer([
      {
        id: "w1",
        entry_at: "2026-06-10T09:00:00Z",
        event_type: "watering",
        details: {
          watering_amount_ml: 250,
          method: "Top watering",
          raw_payload: { sensitive: "value" },
          service_role: "leak",
          access_token: "Bearer abc123",
          private_key: "-----BEGIN-----",
          internal_id: "uuid-internal-12345",
          mystery_unknown_key: "leak-me",
        },
      },
    ]);
    const drawer = screen.getByTestId("diary-calendar-event-drawer");
    const html = drawer.innerHTML;
    expect(html).not.toMatch(/raw_payload|sensitive/);
    expect(html).not.toMatch(/service_role|leak/);
    expect(html).not.toMatch(/Bearer|access_token|abc123/);
    expect(html).not.toMatch(/private_key|BEGIN/);
    expect(html).not.toMatch(/internal_id|uuid-internal-12345/);
    expect(html).not.toMatch(/mystery_unknown_key|leak-me/);
  });
});

describe("Diary calendar drawer — static safety", () => {
  const drawerVM = readFileSync(
    resolve(__dirname, "../lib/diaryCalendarEventDrawerViewModel.ts"),
    "utf-8",
  );
  const drawerComp = readFileSync(
    resolve(__dirname, "../components/DiaryCalendarEventDrawer.tsx"),
    "utf-8",
  );

  it("contains no Supabase write/insert/update/delete code", () => {
    for (const src of [drawerVM, drawerComp]) {
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    }
  });

  it("contains no Action Queue / device-control / automation strings", () => {
    for (const src of [drawerVM, drawerComp]) {
      expect(src).not.toMatch(/action_queue|actionQueue/i);
      expect(src).not.toMatch(/deviceControl|device_command|automation/i);
    }
  });
});
