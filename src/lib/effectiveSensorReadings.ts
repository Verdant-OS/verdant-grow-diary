import { supabase } from "@/integrations/supabase/client";

export const EFFECTIVE_SENSOR_QUERY_VERSION = "effective-v1";

export function effectiveSensorReadingsQuery(client: Pick<typeof supabase, "from"> = supabase) {
  // This additive view retains the sensor_readings columns and adds validity
  // metadata. The generated schema predates the unpublished migration; retain
  // the existing query-builder types and validate the view contract on receipt.
  return client.from("sensor_readings_effective" as "sensor_readings");
}

export { requireEffectiveSensorReadings } from "@/lib/effectiveSensorReadingRules";
