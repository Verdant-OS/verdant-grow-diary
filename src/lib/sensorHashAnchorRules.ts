/**
 * sensorHashAnchorRules — when the Sensors hash anchors are actually in the
 * document, and how the top Import CSV control reaches #csv-import.
 *
 * The page's loading and error shells omit both anchors. A hash effect that
 * runs during that shell and does not subscribe to the shell unmounting
 * never calls scrollIntoView. This module is the pure gate for that retry.
 * It does not read the clock, the network, or the DOM except through the
 * document the caller passes in.
 */

export const SENSOR_CSV_IMPORT_ANCHOR_ID = "csv-import";
export const SENSOR_CSV_IMPORT_ENTRY_LABEL = "Import CSV";

export interface SensorHashAnchorMountInput {
  tentsQueryError: boolean;
  readingsQueryError: boolean;
  tentsQueryLoading: boolean;
  readingsQueryLoading: boolean;
  resolutionPending: boolean;
  reselectionRequired: boolean;
  tentCount: number;
  selectedTentPresent: boolean;
}

export interface SensorHashAnchorTarget {
  scrollIntoView?: (options: ScrollIntoViewOptions) => void;
  focus?: (options?: FocusOptions) => void;
}

/**
 * True only when Sensors renders the main tree that contains #csv-import
 * and #manual-reading. Mirrors the page's error return and sensorPageLoading
 * formula, including the exact-target reselection path that keeps the
 * anchors mounted while readings are still loading.
 */
export function isSensorHashAnchorMounted(input: SensorHashAnchorMountInput): boolean {
  if (input.tentsQueryError || input.readingsQueryError) return false;
  const sensorPageLoading =
    input.tentsQueryLoading ||
    input.resolutionPending ||
    (input.tentCount > 0 &&
      !input.reselectionRequired &&
      (!input.selectedTentPresent || input.readingsQueryLoading));
  return !sensorPageLoading;
}

/** A click on an already-open #csv-import route must focus in place. */
export function sensorCsvImportEntryShouldNavigate(hash: string): boolean {
  return hash !== `#${SENSOR_CSV_IMPORT_ANCHOR_ID}`;
}

export function sensorCsvImportEntryHref(pathname: string, search: string): string {
  return `${pathname}${search}#${SENSOR_CSV_IMPORT_ANCHOR_ID}`;
}

export function focusSensorCsvImportAnchor(doc: {
  getElementById(id: string): SensorHashAnchorTarget | null;
}): boolean {
  const target = doc.getElementById(SENSOR_CSV_IMPORT_ANCHOR_ID);
  if (!target) return false;
  target.scrollIntoView?.({ behavior: "smooth", block: "start" });
  target.focus?.({ preventScroll: true });
  return true;
}
