/**
 * GgsRealPayloadIngestPanel — dev/operator-only panel.
 *
 * SAFETY:
 *   - Never renders `raw_payload.payload` (the verbatim vendor body).
 *   - Commit button stays disabled until: payload parses, context is set,
 *     planner accepts, and the operator checks the attestation box.
 *   - All writes go through the existing validated `pi_ingest_commit_batch`
 *     RPC via `commitGgsRealPayload`. No direct table writes.
 *   - No alerts, Action Queue, AI, or device control side effects.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useTents } from "@/hooks/use-tents";
import {
  buildGgsRealPayloadIngestViewModel,
  describeRefusal,
} from "@/lib/ggsRealPayloadIngestViewModel";
import { commitGgsRealPayload, type GgsRealPayloadCommitResult } from "@/lib/ggsRealPayloadCommit";
import type { BridgeTokenRow } from "@/lib/bridgeTokenRules";
import { bridgeTokenStatus } from "@/lib/bridgeTokenRules";

const EXAMPLE_PAYLOAD = `{
  "timestamp": "2026-06-17T18:30:00Z",
  "sensor_id": "REAL_GGS_PROBE_ID",
  "moisture_vwc": 42.5,
  "soil_temp_c": 22.3,
  "ec_ms_cm": 0.85
}`;

export default function GgsRealPayloadIngestPanel() {
  const { user } = useAuth();
  const { data: tents = [] } = useTents();

  const [tentId, setTentId] = useState<string>("");
  const [bridgeId, setBridgeId] = useState<string>("");
  const [deviceId, setDeviceId] = useState<string>("");
  const [payloadText, setPayloadText] = useState<string>("");
  const [attested, setAttested] = useState<boolean>(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<GgsRealPayloadCommitResult | null>(null);

  const { data: bridgeTokens = [] } = useQuery({
    queryKey: ["ggs-real-payload-bridge-tokens", tentId],
    enabled: !!tentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bridge_tokens")
        .select(
          "id, name, token_prefix, expires_at, last_used_at, first_used_at, ingest_count, revoked_at, created_at",
        )
        .eq("tent_id", tentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BridgeTokenRow[];
    },
  });

  const activeTokens = useMemo(
    () => bridgeTokens.filter((t) => bridgeTokenStatus(t) === "active"),
    [bridgeTokens],
  );

  const vm = useMemo(() => {
    if (!user?.id || !tentId || !bridgeId || !deviceId.trim()) return null;
    return buildGgsRealPayloadIngestViewModel({
      payloadText,
      attested,
      context: {
        userId: user.id,
        bridgeId,
        tentId,
        deviceId: deviceId.trim(),
      },
    });
  }, [user?.id, tentId, bridgeId, deviceId, payloadText, attested]);

  async function onCommit() {
    if (!vm || vm.status !== "ok" || !vm.canCommit) return;
    setCommitting(true);
    setResult(null);
    try {
      const res = await commitGgsRealPayload(vm.commit);
      setResult(res);
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Real-device payloads only</AlertTitle>
        <AlertDescription className="space-y-1 text-sm">
          <p>Only paste values that came from the physical Spider Farmer GGS device.</p>
          <p>Do not use invented or hand-crafted values with <code>source: "live"</code>.</p>
          <p>Fixture/demo data cannot clear Sentinel live sign-off.</p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Tent &amp; bridge context</CardTitle>
          <CardDescription>
            Commit routes through the existing <code>pi_ingest_commit_batch</code> path; both the
            tent and bridge token must already exist for the operator.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Tent</Label>
            <Select value={tentId} onValueChange={(v) => { setTentId(v); setBridgeId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select tent" /></SelectTrigger>
              <SelectContent>
                {tents.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name ?? t.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Bridge token</Label>
            <Select value={bridgeId} onValueChange={setBridgeId} disabled={!tentId}>
              <SelectTrigger>
                <SelectValue placeholder={tentId ? "Select bridge token" : "Pick a tent first"} />
              </SelectTrigger>
              <SelectContent>
                {activeTokens.length === 0 ? (
                  <SelectItem value="__none" disabled>No active bridge tokens for this tent</SelectItem>
                ) : (
                  activeTokens.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {t.token_prefix}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ggs-device-id">Physical probe / sensor id</Label>
            <Input
              id="ggs-device-id"
              placeholder="e.g. GGS-PROBE-A1B2"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Paste real Spider Farmer GGS payload (JSON)</CardTitle>
          <CardDescription>
            Accepted shape includes <code>timestamp</code>, <code>sensor_id</code>,
            <code> moisture_vwc</code>, <code>soil_temp_c</code> (or <code>soil_temp_f</code>),
            <code> ec_ms_cm</code> (or <code>ec_us_cm</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            placeholder={EXAMPLE_PAYLOAD}
            rows={10}
            className="font-mono text-xs"
          />
          <div className="text-xs text-muted-foreground">
            The verbatim payload body is stored in <code>raw_payload</code> for audit but is
            never displayed in this panel or anywhere else in Verdant's UI.
          </div>
        </CardContent>
      </Card>

      <PreviewCard vm={vm} />

      <Card>
        <CardContent className="space-y-3 pt-6">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={attested}
              onCheckedChange={(v) => setAttested(v === true)}
              aria-label="Operator attestation"
            />
            <span>
              I confirm this JSON came from the physical Spider Farmer GGS 3-in-1 Soil Sensor Pro
              device. I am not pasting fixture, demo, or invented values.
            </span>
          </label>

          <Button
            onClick={onCommit}
            disabled={committing || !vm || vm.status !== "ok" || !vm.canCommit}
          >
            {committing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Committing…</>
            ) : (
              "Commit real GGS payload"
            )}
          </Button>

          {result && (
            <Alert variant={result.ok ? "default" : "destructive"}>
              {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertTitle>{result.ok ? "Commit complete" : "Commit failed"}</AlertTitle>
              <AlertDescription className="text-sm">
                {result.ok === true ? (
                  <>
                    Inserted: <strong>{result.inserted}</strong> · Duplicate / rejected:{" "}
                    <strong>{result.rejected}</strong>
                  </>
                ) : (
                  <>
                    {result.reason}
                    {result.details ? `: ${result.details}` : ""}
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewCard({
  vm,
}: {
  vm: ReturnType<typeof buildGgsRealPayloadIngestViewModel> | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Validation preview</CardTitle>
        <CardDescription>
          Only normalized, safe fields are shown. Raw vendor payload is never rendered.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!vm && (
          <p className="text-sm text-muted-foreground">
            Select tent, bridge token, sensor id, and paste a payload to preview.
          </p>
        )}
        {vm && vm.status === "refused" && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Payload refused — {vm.reason}</AlertTitle>
            <AlertDescription>{describeRefusal(vm.reason)}</AlertDescription>
          </Alert>
        )}
        {vm && vm.status === "ok" && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">source: {vm.preview.source}</Badge>
              <Badge variant="secondary">vendor: {vm.preview.vendor}</Badge>
              <Badge variant="outline">rows: {vm.preview.rowCount}</Badge>
              <Badge variant="outline">age: {vm.preview.ageSeconds}s</Badge>
            </div>
            <div className="grid gap-1">
              <div><span className="text-muted-foreground">captured_at:</span> {vm.preview.capturedAt}</div>
              <div><span className="text-muted-foreground">sensor_id:</span> {vm.preview.sensorId ?? "—"}</div>
            </div>
            <ul className="divide-y rounded-md border">
              {vm.preview.metrics.map((m) => (
                <li key={m.metric} className="flex items-center justify-between px-3 py-2">
                  <span>{m.label} <span className="text-muted-foreground">({m.metric})</span></span>
                  <span className="font-mono">{m.value} {m.unit}</span>
                </li>
              ))}
            </ul>
            {vm.preview.warnings.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Normalizer warnings</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5">
                    {vm.preview.warnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {!vm.canCommit && (
              <p className="text-sm text-amber-600">
                Commit disabled: {vm.blockers.join(", ")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
