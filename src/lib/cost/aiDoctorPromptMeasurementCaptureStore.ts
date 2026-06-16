/**
 * aiDoctorPromptMeasurementCaptureStore — in-memory, bounded, diagnostics-only
 * sink for AI Doctor prompt measurements.
 *
 * Hard rules:
 *  - Stores ONLY `AiDoctorPromptMeasurement` plus the previously-approved
 *    `AiDoctorPromptMeasurementMetadata` sidecar.
 *  - Never stores prompt text, diary content, raw model output, secrets, or
 *    environment values.
 *  - In-memory ring buffer by default; no localStorage, no Supabase, no fetch.
 *  - The capacity is a STORAGE SAFETY BOUND, not a token threshold or budget.
 */

import type {
  AiDoctorPromptMeasurementBundle,
  AiDoctorPromptMeasurementMetadata,
} from "./aiDoctorPromptMeasurement";
import type { AiDoctorPromptMeasurement } from "./costDomains";

/** Storage safety bound — keeps the in-memory buffer small. NOT a token limit. */
export const CAPTURE_STORE_SAFETY_BOUND = 200;

export interface CapturedAiDoctorPromptMeasurement {
  readonly measurement: AiDoctorPromptMeasurement;
  readonly metadata: AiDoctorPromptMeasurementMetadata;
}

export interface AiDoctorPromptMeasurementCaptureStore {
  capture: (bundle: AiDoctorPromptMeasurementBundle) => void;
  list: () => readonly CapturedAiDoctorPromptMeasurement[];
  size: () => number;
  clear: () => void;
}

const FORBIDDEN_BUNDLE_KEYS = [
  "userPromptText",
  "promptText",
  "rawResponse",
  "providerResponse",
  "apiKey",
  "authorization",
];

function assertSafeBundle(bundle: AiDoctorPromptMeasurementBundle): void {
  const top = bundle as unknown as Record<string, unknown>;
  for (const k of FORBIDDEN_BUNDLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(top, k)) {
      throw new Error(
        `aiDoctorPromptMeasurementCaptureStore rejected forbidden field: ${k}`,
      );
    }
  }
  const m = bundle.measurement as unknown as Record<string, unknown>;
  for (const k of FORBIDDEN_BUNDLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(m, k)) {
      throw new Error(
        `aiDoctorPromptMeasurementCaptureStore rejected forbidden measurement field: ${k}`,
      );
    }
  }
}

export function createAiDoctorPromptMeasurementCaptureStore(
  capacity: number = CAPTURE_STORE_SAFETY_BOUND,
): AiDoctorPromptMeasurementCaptureStore {
  const max = Math.max(1, Math.floor(capacity));
  const buffer: CapturedAiDoctorPromptMeasurement[] = [];

  return {
    capture(bundle) {
      assertSafeBundle(bundle);
      buffer.push({ measurement: bundle.measurement, metadata: bundle.metadata });
      while (buffer.length > max) buffer.shift();
    },
    list() {
      return buffer.slice();
    },
    size() {
      return buffer.length;
    },
    clear() {
      buffer.length = 0;
    },
  };
}

// Default singleton for the app. Tests should prefer their own instances.
let defaultStore: AiDoctorPromptMeasurementCaptureStore | null = null;

export function getDefaultAiDoctorPromptMeasurementCaptureStore(): AiDoctorPromptMeasurementCaptureStore {
  if (!defaultStore) {
    defaultStore = createAiDoctorPromptMeasurementCaptureStore();
  }
  return defaultStore;
}

/** Test helper — resets the default singleton. */
export function __resetDefaultAiDoctorPromptMeasurementCaptureStoreForTests(): void {
  defaultStore = null;
}
