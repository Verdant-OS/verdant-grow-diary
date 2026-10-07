/**
 * Shape of the sensor snapshot a Quick Log entry may carry.
 *
 * Moved here from the removed `createQuickLogEvent` module (#593) so the
 * live readers (`fetchLatestSensorSnapshot`, `quickLogSensorSnapshotValidation`)
 * keep one shared type without depending on dead code.
 */
export interface QuickLogSensorSnapshot {
  source: string | null;
  captured_at: string | null;
  metrics: Record<string, number>;
}
