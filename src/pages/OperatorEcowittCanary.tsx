/**
 * Operator EcoWitt Canary Audit page.
 *
 * Read-only diagnostics. NO Supabase writes, NO rpc, NO functions.invoke,
 * NO alerts/Action Queue writes, NO AI calls, NO device control.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTents } from "@/hooks/use-tents";
import { useAuth } from "@/store/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  buildAuditReport,
  computeVerdict,
  evaluatePreflight,
  parseCanaryPaste,
  type CanaryReportInput,
  type CardStatus,
  type PreflightResult,
  type VerdictResult,
} from "@/lib/ecowittCanaryAuditRules";

const ENDPOINT_PATH = "/functions/v1/ecowitt-ingest";

function StatusPill({ status }: { status: CardStatus }) {
  const map: Record<CardStatus, { label: string; cls: string }> = {
    pass: { label: "PASS", cls: "bg-primary/15 text-primary border-primary/40" },
    fail: { label: "FAIL", cls: "bg-destructive/15 text-destructive border-destructive/40" },
    incomplete: { label: "INCOMPLETE", cls: "bg-muted text-muted-foreground border-border" },
    unknown: { label: "UNKNOWN", cls: "bg-muted text-muted-foreground border-border" },
  };
  const v = map[status];
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}

export default function OperatorEcowittCanary() {
  const auth = useAuth();
  const authAvailable = !!auth?.user?.id;
  const tentsQ = useTents();
  const tents = tentsQ.data ?? [];

  const [selectedTentId, setSelectedTentId] = useState<string>("");
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [paste, setPaste] = useState("");
  const [report, setReport] = useState<CanaryReportInput | null>(null);
  const [parseNotes, setParseNotes] = useState<string[]>([]);
  const [logReviewed, setLogReviewed] = useState(false);

  // Read-only tent fetch for preflight (RLS-enforced).
  const tentQ = useQuery({
    queryKey: ["operator-ecowitt-tent", selectedTentId],
    enabled: !!selectedTentId && authAvailable,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tents")
        .select("id,name,is_archived,hardware_config")
        .eq("id", selectedTentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const runPreflight = () => {
    setPreflight(
      evaluatePreflight({
        authAvailable,
        tent: (tentQ.data ?? null) as never,
      }),
    );
  };

  const verdict: VerdictResult = useMemo(
    () => computeVerdict({ preflight, report, logReviewed }),
    [preflight, report, logReviewed],
  );

  const handleImport = () => {
    const parsed = parseCanaryPaste(paste);
    setReport(parsed.report);
    setParseNotes(parsed.parseNotes);
  };

  const downloadReport = () => {
    const tent = tentQ.data ? { id: tentQ.data.id, name: tentQ.data.name } : null;
    const body = buildAuditReport({
      tent,
      endpoint: ENDPOINT_PATH,
      preflight,
      report,
      verdict,
    });
    const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ecowitt-canary-audit-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4 md:p-6" data-testid="operator-ecowitt-canary">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">EcoWitt Canary Audit</h1>
        <p className="text-sm text-muted-foreground">
          Operator Mode · Read-only diagnostics · Endpoint: <code className="font-mono">{ENDPOINT_PATH}</code>
        </p>
      </header>

      {!authAvailable && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Preflight DB checks require an authenticated operator session.
          </CardContent>
        </Card>
      )}

      {/* Pre-POST Validator */}
      <Card>
        <CardHeader>
          <CardTitle>Pre-POST Validator</CardTitle>
          <CardDescription>Read-only check of the selected tent's EcoWitt mapping.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Select canary tent"
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={selectedTentId}
              onChange={(e) => {
                setSelectedTentId(e.target.value);
                setPreflight(null);
              }}
            >
              <option value="">Select tent…</option>
              {tents.map((t: { id: string; name: string }) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button onClick={runPreflight} disabled={!authAvailable || !selectedTentId || tentQ.isLoading}>
              Run Pre-POST Validator
            </Button>
            {tentQ.isLoading && <span className="text-xs text-muted-foreground">Loading tent…</span>}
          </div>

          {preflight && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <StatusPill
                  status={preflight.status === "pass" ? "pass" : preflight.status === "fail" ? "fail" : "incomplete"}
                />
                <span className="text-sm">{preflight.reason}</span>
              </div>
              <ul className="space-y-1 text-sm">
                {preflight.checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2">
                    <StatusPill status={c.status} />
                    <div>
                      <div>{c.label}</div>
                      {c.detail && <div className="text-xs text-muted-foreground">{c.detail}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Canary Results Import */}
      <Card>
        <CardHeader>
          <CardTitle>Canary Results Import</CardTitle>
          <CardDescription>
            Paste the harness JSON report. Plain text is accepted but cannot reach a GO verdict.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            aria-label="Paste canary harness output"
            placeholder='{ "main_row_counts": { "temperature_c": 1, ... }, ... }'
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={8}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={handleImport} disabled={!paste.trim()}>
              Import Canary Results
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={logReviewed}
                onChange={(e) => setLogReviewed(e.target.checked)}
              />
              I reviewed function logs and found no secrets
            </label>
          </div>
          {parseNotes.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {parseNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Verification Summary cards */}
      <section aria-label="Verification Summary" className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {verdict.cards.map((c) => (
          <Card key={c.key} data-card-key={c.key}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{c.label}</CardTitle>
                <StatusPill status={c.status} />
              </div>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">{c.reason}</CardContent>
          </Card>
        ))}
      </section>

      {/* Verdict + Download */}
      <Card>
        <CardHeader>
          <CardTitle>
            Verdict:{" "}
            <span data-testid="canary-verdict">
              {verdict.verdict === "go" ? "GO" : verdict.verdict === "no_go" ? "NO-GO" : "INCOMPLETE"}
            </span>
          </CardTitle>
          <CardDescription>
            Read-only diagnostics · no device control · no automation · no alerts · no Action Queue writes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {verdict.reasons.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-destructive">
              {verdict.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          <Button onClick={downloadReport}>Download Canary Audit Report</Button>
        </CardContent>
      </Card>
    </div>
  );
}
