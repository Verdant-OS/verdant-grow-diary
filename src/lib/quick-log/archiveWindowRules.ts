/**
 * Optional camera-archive metadata for a grower-authored Quick Log note.
 *
 * This is intentionally diary metadata only: it identifies footage the
 * grower reviewed, but never represents an uploaded video or live sensor.
 */

export const CAMERA_CODES = ["F4K", "V4K", "S1", "S2", "M2K"] as const;

export type CameraCode = (typeof CAMERA_CODES)[number];

export interface ArchiveWindowDraft {
  code?: unknown;
  start?: unknown;
  end?: unknown;
}

export interface ArchiveWindow {
  code: CameraCode;
  start: string;
  end: string;
}

export type ArchiveWindowValidation =
  | { ok: true; value: ArchiveWindow | null; warnings: readonly string[] }
  | { ok: false; value: null; warnings: readonly string[]; reason: ArchiveWindowReason };

export type ArchiveWindowReason =
  | "unknown_camera_code"
  | "invalid_timestamp"
  | "incomplete_archive_window"
  | "archive_end_before_start"
  | "archive_window_too_long";

const CAMERA_CODE_SET = new Set<string>(CAMERA_CODES);
const MAX_WINDOW_MS = 48 * 60 * 60 * 1000;

export function normalizeCameraCode(raw: unknown): CameraCode | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toUpperCase();
  return CAMERA_CODE_SET.has(normalized) ? (normalized as CameraCode) : null;
}

function parseIso(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)
  ) {
    return null;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Parse untrusted UI/jsonb values without throwing or inventing defaults. */
export function parseArchiveWindow(input: ArchiveWindowDraft | null | undefined): {
  code: CameraCode | null;
  start: string | null;
  end: string | null;
  warnings: readonly string[];
} {
  const draft = input ?? {};
  const warnings: string[] = [];
  const code = normalizeCameraCode(draft.code);
  const start = parseIso(draft.start);
  const end = parseIso(draft.end);
  if (typeof draft.code === "string" && draft.code.trim() !== "" && !code) {
    warnings.push("archive:unknown-camera-code");
  }
  if (typeof draft.start === "string" && draft.start.trim() !== "" && !start) {
    warnings.push("archive:invalid-start");
  }
  if (typeof draft.end === "string" && draft.end.trim() !== "" && !end) {
    warnings.push("archive:invalid-end");
  }
  return { code, start, end, warnings };
}

/**
 * A visible archive-review badge is intentionally all-or-nothing: camera,
 * start and end must all be present and valid. Empty input remains optional.
 */
export function validateArchiveWindow(
  input: ArchiveWindowDraft | null | undefined,
): ArchiveWindowValidation {
  const parsed = parseArchiveWindow(input);
  const raw = input ?? {};
  const isProvided = (value: unknown) => typeof value === "string" && value.trim() !== "";
  const codeProvided = isProvided(raw.code);
  const startProvided = isProvided(raw.start);
  const endProvided = isProvided(raw.end);
  const anyProvided = codeProvided || startProvided || endProvided;
  if (!anyProvided) return { ok: true, value: null, warnings: parsed.warnings };
  if (!codeProvided || !startProvided || !endProvided) {
    return {
      ok: false,
      value: null,
      warnings: parsed.warnings,
      reason: "incomplete_archive_window",
    };
  }
  if (!parsed.code) {
    return {
      ok: false,
      value: null,
      warnings: parsed.warnings,
      reason: "unknown_camera_code",
    };
  }
  if (!parsed.start || !parsed.end) {
    return {
      ok: false,
      value: null,
      warnings: parsed.warnings,
      reason: "invalid_timestamp",
    };
  }
  const startMs = Date.parse(parsed.start);
  const endMs = Date.parse(parsed.end);
  if (endMs < startMs) {
    return {
      ok: false,
      value: null,
      warnings: parsed.warnings,
      reason: "archive_end_before_start",
    };
  }
  if (endMs - startMs > MAX_WINDOW_MS) {
    return { ok: false, value: null, warnings: parsed.warnings, reason: "archive_window_too_long" };
  }
  return {
    ok: true,
    value: { code: parsed.code, start: parsed.start, end: parsed.end },
    warnings: [],
  };
}

export function buildArchiveWindowDetails(
  window: ArchiveWindow | null,
): Record<string, unknown> | null {
  if (!window) return null;
  return {
    archive_window: {
      camera_code: window.code,
      start_at: window.start,
      end_at: window.end,
    },
  };
}

/** Safely read stored metadata; malformed or partial legacy objects stay invisible. */
export function readArchiveWindowFromDetails(details: unknown): ArchiveWindow | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const record = details as Record<string, unknown>;
  const raw = record.archive_window ?? record.archiveWindow;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const validated = validateArchiveWindow({
    code: value.camera_code ?? value.cameraCode,
    start: value.start_at ?? value.startAt,
    end: value.end_at ?? value.endAt,
  });
  return validated.ok ? validated.value : null;
}

export function archiveWindowReasonToMessage(reason: ArchiveWindowReason): string {
  switch (reason) {
    case "archive_end_before_start":
      return "Archive end must be after start.";
    case "archive_window_too_long":
      return "Archive window must be 48 hours or less.";
    case "unknown_camera_code":
      return "Choose a camera before saving an archive window.";
    case "invalid_timestamp":
      return "Enter a valid archive start and end time.";
    case "incomplete_archive_window":
      return "Add a camera, archive start, and archive end, or leave all archive fields blank.";
  }
}

export function formatArchiveWindowLabel(window: ArchiveWindow | null): string | null {
  if (!window) return null;
  const start = window.start.replace("T", " ").slice(0, 16);
  const end = window.end.replace("T", " ").slice(0, 16);
  return `ARCHIVE REVIEW · ${window.code} · ${start}–${end} UTC`;
}
