import { describe, expect, it, vi } from "vitest";
import {
  SENSOR_CSV_IMPORT_ENTRY_LABEL,
  focusSensorCsvImportAnchor,
  isSensorHashAnchorMounted,
  sensorCsvImportEntryHref,
  sensorCsvImportEntryShouldNavigate,
} from "@/lib/sensorHashAnchorRules";

const settled = {
  tentsQueryError: false,
  readingsQueryError: false,
  tentsQueryLoading: false,
  readingsQueryLoading: false,
  resolutionPending: false,
  reselectionRequired: false,
  tentCount: 1,
  selectedTentPresent: true,
};

describe("sensor hash anchor mount gate", () => {
  it("keeps the anchor unmounted while a fast tent response is still waiting on readings", () => {
    expect(isSensorHashAnchorMounted({ ...settled, readingsQueryLoading: true })).toBe(false);
  });

  it("mounts the anchor once tents and readings have both settled", () => {
    expect(isSensorHashAnchorMounted(settled)).toBe(true);
  });

  it("stays unmounted on a tent or readings error shell", () => {
    expect(isSensorHashAnchorMounted({ ...settled, tentsQueryError: true })).toBe(false);
    expect(isSensorHashAnchorMounted({ ...settled, readingsQueryError: true })).toBe(false);
  });

  it("stays unmounted while tent resolution is pending or the tent list is loading", () => {
    expect(isSensorHashAnchorMounted({ ...settled, resolutionPending: true })).toBe(false);
    expect(isSensorHashAnchorMounted({ ...settled, tentsQueryLoading: true })).toBe(false);
    expect(
      isSensorHashAnchorMounted({ ...settled, selectedTentPresent: false, tentCount: 1 }),
    ).toBe(false);
  });

  it("keeps the anchor mounted for an exact-target reselection even while readings load", () => {
    expect(
      isSensorHashAnchorMounted({
        ...settled,
        reselectionRequired: true,
        readingsQueryLoading: true,
        selectedTentPresent: false,
      }),
    ).toBe(true);
  });
});

describe("Import CSV entry", () => {
  it("keeps the top control label distinct from the importer card", () => {
    expect(SENSOR_CSV_IMPORT_ENTRY_LABEL).toBe("Import CSV");
  });

  it("navigates only when the route is not already #csv-import", () => {
    expect(sensorCsvImportEntryShouldNavigate("")).toBe(true);
    expect(sensorCsvImportEntryShouldNavigate("#manual-reading")).toBe(true);
    expect(sensorCsvImportEntryShouldNavigate("#csv-import")).toBe(false);
    expect(sensorCsvImportEntryHref("/sensors", "?tentId=tent-a")).toBe(
      "/sensors?tentId=tent-a#csv-import",
    );
  });

  it("scrolls and focuses #csv-import without opening the file picker", () => {
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    const focused = focusSensorCsvImportAnchor({
      getElementById: (id) => (id === "csv-import" ? { scrollIntoView, focus } : null),
    });
    expect(focused).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(
      focusSensorCsvImportAnchor({
        getElementById: () => null,
      }),
    ).toBe(false);
  });
});
