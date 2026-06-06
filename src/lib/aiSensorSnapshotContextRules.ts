/**
 * Re-export of the canonical, source-aware AI sensor snapshot annotator
 * so vitest (which scans `src/**`) can import it without crossing into
 * `supabase/functions/`. The canonical implementation lives at
 * `supabase/functions/ai-coach/sensorSnapshotContextRules.ts` so the
 * ai-coach edge function bundle can also use it.
 */
export * from "../../supabase/functions/ai-coach/sensorSnapshotContextRules";
