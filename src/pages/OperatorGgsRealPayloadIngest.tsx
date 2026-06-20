/**
 * Operator GGS Real-Payload Ingest page.
 *
 * Read-only diagnostics. No Supabase writes, no rpc, no Edge function
 * invocations, no alerts/Action-Queue mutation, no AI calls, no device
 * control, no raw-payload rendering, no MQTT publishing.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTents } from "@/hooks/use-tents";
import { useAuth } from "@/store/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GgsSentinelSmokeRunnerPanel } from "@/components/GgsSentinelSmokeRunnerPanel";
import {
  runGgsSentinelSmoke,
  REQUIRED_METRIC_KEYS,
  type SentinelSensorRow,
} from "@/lib/ggsSentinelSmokeRunner";
import { buildGgsSentinelSmokeRunnerPanelViewModel } from "@/lib/ggsSentinelSmokeRunnerViewModel";
import { SPIDER_FARMER_GGS_PROVIDER } from "@/lib/spiderFarmerGgsMappingRules";

const ROW_FETCH_LIMIT = 50;

export default function OperatorGgsRealPayloadIngest() {
  const auth = useAuth();
  const authAvailable = !!auth?.user?.id;
  const tentsQ = useTents();
  const tents = tentsQ.data ?? [];

  const [selectedTentId, setSelectedTentId] = useState<string>("");

  const ggsRowsQ = useQuery({
    queryKey: ["operator-ggs-real-payload", selectedTentId],
    enabled: authAvailable && !!selectedTentId,
    queryFn: async (): Promise<SentinelSensorRow[]> => {
      const { data, error } = await supabase
        .from("sensor_readings")
        .select("metric,value,source,quality,captured_at")
        .eq("tent_id", selectedTentId)
        .eq("source", SPIDER_FARMER_GGS_PROVIDER)
        .in("metric", [...REQUIRED_METRIC_KEYS])
        .order("captured_at", { ascending: false })
        .limit(ROW_FETCH_LIMIT);
      if (error) throw error;
      return (data ?? []) as SentinelSensorRow[];
    },
  });

  const verdict = useMemo(
    () =>
      runGgsSentinelSmoke({
        rows: ggsRowsQ.data ?? [],
        now: new Date(),
      }),
    [ggsRowsQ.data],
  );
  const panelVm = useMemo(() => buildGgsSentinelSmokeRunnerPanelViewModel(verdict), [verdict]);

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-4 md:p-6" data-testid="operator-ggs-real-payload-ingest">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">GGS Real-Payload Ingest</h1>
        <p className="text-sm text-muted-foreground">
          Operator Mode · Read-only Sentinel verdict over real Spider Farmer GGS rows.
        </p>
      </header>

      {!authAvailable && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Sentinel verdict requires an authenticated operator session.
          </CardContent>
        </Card>
      )}

      {(role.status === "denied" || role.status === "unauthenticated") && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldOff className="h-5 w-5 text-destructive" />
              <CardTitle>Operator access required</CardTitle>
            </div>
            <CardDescription>
              This screen is restricted to operators with the <code>admin</code> role.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            If you believe this is a mistake, ask an existing admin to grant the role.
          </CardContent>
        </Card>
      )}

      {role.status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Could not verify operator role</AlertTitle>
          <AlertDescription>
            {role.error ?? "Role check failed."} The ingest panel is disabled.
          </AlertDescription>
        </Alert>
      )}

      {role.status === "granted" && (
        <>
          <GgsRealPayloadIngestPanel />
          <GgsSentinelSmokeRunnerPanel />
        </>
      )}
    </div>
  );
}
