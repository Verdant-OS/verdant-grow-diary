/**
 * Operator GGS Real-Payload Ingest page.
 *
 * Operator-gated commit plus a read-only Sentinel verdict. The write crosses
 * a JWT-authenticated Edge boundary; Sentinel remains read-only. No alerts,
 * Action Queue mutation, AI calls, device control, raw-payload rendering, or
 * MQTT publishing.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTents } from "@/hooks/use-tents";
import { useAuth } from "@/store/auth";
import { useHasRole } from "@/hooks/useHasRole";
import {
  GGS_OPERATOR_EVALUATION_INTERVAL_MS,
  useGgsOperatorEvaluationClock,
} from "@/hooks/useGgsOperatorEvaluationClock";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import GgsRealPayloadIngestPanel from "@/components/GgsRealPayloadIngestPanel";
import { GgsSentinelSmokeRunnerPanel } from "@/components/GgsSentinelSmokeRunnerPanel";
import type { GgsSentinelInputRow } from "@/lib/ggsSentinelSmokeRunner";
import { buildGgsSentinelEvaluationPanelViewModel } from "@/lib/ggsSentinelSmokeRunnerViewModel";
import {
  GGS_OPERATOR_SENTINEL_METRICS,
  GGS_OPERATOR_SENTINEL_SOURCE,
  GGS_OPERATOR_SENTINEL_PROVENANCE_CONTAINS,
  evaluateGgsOperatorAttestedSentinelReadiness,
} from "@/lib/ggsOperatorRealPayloadSentinelRules";

const ROW_FETCH_LIMIT = 50;

export default function OperatorGgsRealPayloadIngest() {
  const auth = useAuth();
  const authAvailable = !!auth?.user?.id;
  const role = useHasRole("operator");
  const tentsQ = useTents();
  const tents = tentsQ.data ?? [];

  const [selectedTentId, setSelectedTentId] = useState<string>("");
  const queryEnabled = authAvailable && role.status === "granted" && !!selectedTentId;
  const evaluationNowMs = useGgsOperatorEvaluationClock({
    enabled: queryEnabled,
  });

  const ggsRowsQ = useQuery({
    queryKey: ["operator-ggs-real-payload", selectedTentId],
    enabled: queryEnabled,
    queryFn: async (): Promise<GgsSentinelInputRow[]> => {
      const { data, error } = await supabase
        .from("sensor_readings")
        .select("metric,value,source,quality,device_id,captured_at,raw_payload")
        .eq("tent_id", selectedTentId)
        .eq("source", GGS_OPERATOR_SENTINEL_SOURCE)
        .contains("raw_payload", GGS_OPERATOR_SENTINEL_PROVENANCE_CONTAINS)
        .in("metric", [...GGS_OPERATOR_SENTINEL_METRICS])
        .order("captured_at", { ascending: false })
        .order("created_at", { ascending: false })
        .order("device_id", { ascending: true })
        .order("metric", { ascending: true })
        .limit(ROW_FETCH_LIMIT);
      if (error) throw error;
      return (data ?? []) as GgsSentinelInputRow[];
    },
    refetchInterval: GGS_OPERATOR_EVALUATION_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const verdict = useMemo(
    () =>
      evaluateGgsOperatorAttestedSentinelReadiness({
        rows: ggsRowsQ.data ?? [],
        snapshot: null,
        now: new Date(evaluationNowMs),
      }),
    [evaluationNowMs, ggsRowsQ.data],
  );
  const panelVm = useMemo(() => buildGgsSentinelEvaluationPanelViewModel(verdict), [verdict]);

  return (
    <div
      className="container mx-auto max-w-3xl space-y-6 p-4 md:p-6"
      data-testid="operator-ggs-real-payload-ingest"
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">GGS Real-Payload Ingest</h1>
        <p className="text-sm text-muted-foreground">
          Operator Mode · Commit validated, attested Spider Farmer GGS readings through the gated
          Edge boundary, then review the read-only Sentinel verdict. Operator attestation is
          preserved and is not presented as independently verified live telemetry.
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
              This screen is restricted to accounts with the <code>operator</code> role.
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
          <GgsRealPayloadIngestPanel
            selectedTentId={selectedTentId}
            onSelectedTentIdChange={setSelectedTentId}
            onCommitSuccess={() => ggsRowsQ.refetch()}
          />
          <GgsSentinelSmokeRunnerPanel viewModel={panelVm} />
        </>
      )}
    </div>
  );
}
