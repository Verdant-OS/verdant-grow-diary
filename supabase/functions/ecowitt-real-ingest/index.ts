// EcoWitt real-ingest Edge wrapper: validation-only endpoint.
// This wrapper authenticates, parses JSON, calls _shared validation logic, and returns
// a redacted accept/reject response. It does not persist sensor readings or enable live data.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleEcoWittRealIngestHttpRequest } from "../_shared/ecowittRealIngestHttp.ts";

const DEFAULT_FRESHNESS_WINDOW_MS = 5 * 60 * 1000;
const MAX_FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;

function parseFreshnessWindowMs(value: string | undefined): number {
  if (!value) return DEFAULT_FRESHNESS_WINDOW_MS;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_FRESHNESS_WINDOW_MS) {
    return DEFAULT_FRESHNESS_WINDOW_MS;
  }

  return Math.floor(parsed);
}

serve((request) => {
  return handleEcoWittRealIngestHttpRequest({
    request,
    expectedToken: Deno.env.get("ECOWITT_BRIDGE_TOKEN") ?? null,
    reference_time: new Date().toISOString(),
    freshness_window_ms: parseFreshnessWindowMs(
      Deno.env.get("ECOWITT_REAL_INGEST_FRESHNESS_WINDOW_MS") ?? undefined,
    ),
  });
});
