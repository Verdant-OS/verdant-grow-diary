/**
 * Doctor launch dialog — freshness surface ARIA / screen-reader coverage.
 *
 * Pins the a11y contract for the 48h snapshot-freshness gate:
 *  - the stale-snapshot explanation is a polite live region with the
 *    exact ISO instants exposed as data attributes (locale-independent),
 *  - the readiness notice is a polite live region,
 *  - context readiness rows carry "label: state" accessible names,
 *  - the blocked Continue keeps its accessible name and is described by
 *    the notice + blocked sentence,
 *  - GATE SEMANTICS: a stale-but-recent snapshot leaves Continue ENABLED
 *    (readiness "partial"); only insufficient context blocks it,
 *  - axe is clean in stale, fresh, and blocked states.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { axe } from "vitest-axe";

vi.setConfig({ testTimeout: 30_000 });

const useRecentMock = vi.fn();
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: (id: string | null | undefined) => useRecentMock(id),
}));

const useTimelineMemoryMock = vi.fn();
vi.mock("@/hooks/useTimelineMemory", () => ({
  useTimelineMemory: (...args: unknown[]) => useTimelineMemoryMock(...args),
  TIMELINE_MEMORY_DEFAULT_LIMIT: 100,
}));

vi.mock("@/hooks/useLogAiDoctorReadinessToDiary", () => ({
  useLogAiDoctorReadinessToDiary: () => ({
    log: vi.fn().mockResolvedValue({ ok: true }),
    logging: false,
  }),
}));

import PlantDetailDoctorLaunchDialog from "@/components/PlantDetailDoctorLaunchDialog";
import { AI_DOCTOR_SNAPSHOT_FRESH_MS } from "@/lib/aiDoctorContextRules";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const CUTOFF_ISO = new Date(NOW.getTime() - AI_DOCTOR_SNAPSHOT_FRESH_MS).toISOString();
// Two diary events well inside the 7d activity window.
const RECENT_ACTIVITY_ISO = "2026-05-31T08:00:00.000Z";
// 74h old: past the 48h cutoff but inside the 7d window → readiness "partial".
const STALE_SNAPSHOT_ISO = "2026-05-29T10:00:00.000Z";
// 26h old: inside the 48h cutoff.
const FRESH_SNAPSHOT_ISO = "2026-05-31T10:00:00.000Z";

const activityItems = () => [
  {
    kind: "diary",
    key: "d1",
    occurredAt: RECENT_ACTIVITY_ISO,
    eventType: "watering",
    hasPhoto: false,
    note: null,
  },
  {
    kind: "diary",
    key: "d2",
    occurredAt: RECENT_ACTIVITY_ISO,
    eventType: "note",
    hasPhoto: false,
    note: "ok",
  },
];

const snapshotItem = (occurredAt: string) => ({
  kind: "manual_sensor_snapshot",
  key: "s1",
  occurredAt,
  card: { severity: "ok" },
});

function renderDialog(
  props: Partial<React.ComponentProps<typeof PlantDetailDoctorLaunchDialog>> = {},
) {
  return render(
    <MemoryRouter>
      <PlantDetailDoctorLaunchDialog
        plantId="p1"
        stage="veg"
        hasPlantPhoto={false}
        now={NOW}
        {...props}
      />
    </MemoryRouter>,
  );
}

async function openDialog() {
  fireEvent.click(screen.getByTestId("plant-detail-doctor-launch-trigger"));
  // Radix portals the dialog outside the render container; axe and all
  // assertions must target the dialog element itself.
  return screen.findByRole("dialog");
}

// jsdom performs no layout, so color-contrast cannot be evaluated.
const AXE_OPTS = { rules: { "color-contrast": { enabled: false } } };

describe("Doctor launch dialog — freshness a11y", () => {
  beforeEach(() => {
    useRecentMock.mockReset();
    useRecentMock.mockReturnValue({ data: [], isLoading: false });
    useTimelineMemoryMock.mockReset();
    useTimelineMemoryMock.mockReturnValue({ items: [] });
  });

  it("stale snapshot: polite live region with exact ISO instants, Continue stays ENABLED", async () => {
    useTimelineMemoryMock.mockReturnValue({
      items: [...activityItems(), snapshotItem(STALE_SNAPSHOT_ISO)],
    });
    renderDialog();
    await openDialog();

    const staleBox = screen.getByTestId(
      "plant-detail-doctor-launch-snapshot-stale-explanation",
    );
    expect(staleBox.getAttribute("role")).toBe("status");
    expect(staleBox.getAttribute("aria-live")).toBe("polite");
    // Locale-independent: assert the machine-readable instants, and the
    // exact cutoff arithmetic (now - 48h) against the shared constant.
    expect(staleBox.getAttribute("data-snapshot-at")).toBe(STALE_SNAPSHOT_ISO);
    expect(staleBox.getAttribute("data-cutoff-at")).toBe(CUTOFF_ISO);
    expect(CUTOFF_ISO).toBe("2026-05-30T12:00:00.000Z");
    // The sentence exists and is non-empty (text itself is locale-formatted).
    expect(
      screen.getByTestId("plant-detail-doctor-launch-snapshot-stale-sentence").textContent
        ?.length ?? 0,
    ).toBeGreaterThan(0);

    // GATE SEMANTICS: stale + recent activity → "partial", Continue enabled.
    expect(screen.queryByTestId("plant-detail-doctor-launch-continue-blocked")).toBeNull();
    const cont = screen.getByTestId("plant-detail-doctor-launch-continue");
    expect(cont).toHaveAccessibleName("Continue to AI Doctor with plant context");
    expect(cont.getAttribute("href")).toBe("/doctor?plantId=p1");
    expect(
      screen
        .getByTestId("plant-detail-doctor-launch-log-readiness-to-diary")
        .getAttribute("data-snapshot-freshness"),
    ).toBe("stale");
  });

  it("fresh snapshot: no stale live region, freshness attribute reports fresh", async () => {
    useTimelineMemoryMock.mockReturnValue({
      items: [...activityItems(), snapshotItem(FRESH_SNAPSHOT_ISO)],
    });
    renderDialog();
    await openDialog();

    expect(
      screen.queryByTestId("plant-detail-doctor-launch-snapshot-stale-explanation"),
    ).toBeNull();
    expect(
      screen
        .getByTestId("plant-detail-doctor-launch-log-readiness-to-diary")
        .getAttribute("data-snapshot-freshness"),
    ).toBe("fresh");
    expect(screen.getByTestId("plant-detail-doctor-launch-continue")).toBeInTheDocument();
  });

  it("readiness rows carry 'label: state' accessible names and the list is named", async () => {
    useTimelineMemoryMock.mockReturnValue({ items: [] });
    renderDialog();
    await openDialog();

    expect(screen.getByTestId("plant-detail-doctor-launch-list")).toHaveAccessibleName(
      "AI Doctor context readiness",
    );
    expect(
      screen.getByTestId("plant-detail-doctor-launch-item-sensor_snapshot"),
    ).toHaveAccessibleName("Recent sensor snapshot: Missing");
    expect(screen.getByTestId("plant-detail-doctor-launch-item-stage")).toHaveAccessibleName(
      "Stage: Available",
    );
  });

  it("readiness notice is a polite live region", async () => {
    renderDialog();
    await openDialog();
    const notice = screen.getByTestId("plant-detail-doctor-launch-readiness-notice");
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.getAttribute("aria-live")).toBe("polite");
  });

  it("blocked Continue keeps its accessible name and is described by the notice + blocked sentence", async () => {
    // Empty timeline → insufficient readiness → blocked.
    renderDialog();
    await openDialog();

    const blocked = screen.getByTestId("plant-detail-doctor-launch-continue-blocked");
    expect(blocked).toBeDisabled();
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    expect(blocked).toHaveAccessibleName(/Continue to AI Doctor/);

    const describedBy = blocked.getAttribute("aria-describedby") ?? "";
    const ids = describedBy.split(/\s+/).filter(Boolean);
    expect(ids).toContain("plant-detail-doctor-launch-readiness-notice");
    expect(ids).toContain("plant-detail-doctor-launch-blocked-sentence");
    for (const id of ids) {
      const el = document.getElementById(id);
      expect(el, `aria-describedby id ${id} must resolve`).not.toBeNull();
      expect((el?.textContent ?? "").length).toBeGreaterThan(0);
    }
    // The description names why it is blocked.
    expect(
      document.getElementById("plant-detail-doctor-launch-blocked-sentence")?.textContent,
    ).toMatch(/AI Doctor is blocked until you add/);
  });

  it("axe: no violations with a stale snapshot", async () => {
    useTimelineMemoryMock.mockReturnValue({
      items: [...activityItems(), snapshotItem(STALE_SNAPSHOT_ISO)],
    });
    renderDialog();
    const dialog = await openDialog();
    expect((await axe(dialog, AXE_OPTS)).violations).toEqual([]);
  });

  it("axe: no violations with a fresh snapshot", async () => {
    useTimelineMemoryMock.mockReturnValue({
      items: [...activityItems(), snapshotItem(FRESH_SNAPSHOT_ISO)],
    });
    renderDialog();
    const dialog = await openDialog();
    expect((await axe(dialog, AXE_OPTS)).violations).toEqual([]);
  });

  it("axe: no violations in the blocked state", async () => {
    renderDialog();
    const dialog = await openDialog();
    expect((await axe(dialog, AXE_OPTS)).violations).toEqual([]);
  });
});
