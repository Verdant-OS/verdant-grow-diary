/**
 * Re-export of the pure ai-coach sensor-snapshot annotator so vitest
 * (which scans `src/**`) can import it without crossing into
 * supabase/functions/. Single source of truth lives at
 * `supabase/functions/ai-coach/sensorSnapshotContext.ts`.
 */
export * from "../../supabase/functions/ai-coach/sensorSnapshotContext";
