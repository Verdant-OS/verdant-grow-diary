/**
 * Outcomes for plant archive, restore, delete, and merge writes.
 * The database remains the authority; an update that matches no row is a failure.
 */

export interface PlantWriteResult {
  data?: unknown;
  error?: { message?: string } | null;
}

export class PlantLifecycleWriteRules {
  static rowWasWritten(result: PlantWriteResult): boolean {
    if (result.error) return false;
    if (Array.isArray(result.data)) return result.data.length > 0;
    if (result.data && typeof result.data === "object") return true;
    return false;
  }

  static failureMessage(result: PlantWriteResult, fallback: string): string {
    const message = result.error?.message?.trim();
    if (message) return message;
    return fallback;
  }

  /** Nested merge confirm must not dismiss the parent dialog before the write runs. */
  static holdMergeDialog(state: { confirming: boolean; busy: boolean }): boolean {
    return state.confirming || state.busy;
  }
}
