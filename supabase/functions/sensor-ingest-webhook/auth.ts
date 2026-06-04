// Re-export from the canonical Edge Function shared copy so deployed code
// and per-function code never drift. Do NOT add behavior here. Edit the
// shared twin at supabase/functions/_shared/sensorIngestAuth.ts instead.
export * from "../_shared/sensorIngestAuth.ts";
