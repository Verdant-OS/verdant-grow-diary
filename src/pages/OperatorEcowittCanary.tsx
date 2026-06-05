/**
 * Operator EcoWitt Canary Audit page.
 *
 * Read-only diagnostics. NO Supabase writes, NO rpc, NO functions.invoke,
 * NO alerts/Action Queue writes, NO AI calls, NO device control.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTents } from "@/hooks/use-tents";
import { useAuth } from "@/store/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  buildAuditReport,
  clearAuditFromLocalStorage,
  computeVerdict,
  evaluatePreflight,
  loadAuditFromLocalStorage,
  parseCanaryPaste,
  saveAuditToLocalStorage,
  type BuiltAuditReport,
  type CanaryReportInput,
  type CardStatus,
  type PreflightResult,
  type VerdictCard,
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

function EvidenceCard({ card }: { card: VerdictCard }) {
  return (
    <Card data-card-key={card.key}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{card.label}</CardTitle>
          <StatusPill status={card.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0 text-sm">
        <p className="text-muted-foreground">{card.reason}</p>
        {card.evidence_present.length > 0 && (
          <div data-evidence="present">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">Evidence present</div>
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {card.evidence_present.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {card.evidence_missing.length > 0 && (
          <div data-evidence="missing">
            <div className="text-xs font-semibold uppercase tracking-wide text-destructive">
              {card.status === "fail" ? "Failing evidence" : "Evidence missing"}
            </div>
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {card.evidence_missing.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {card.next_action && (
          <div data-evidence="next" className="text-xs">
            <span className="font-semibold">Next: </span>
            <span className="text-muted-foreground">{card.next_action}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const WINDOWS_RUN_COMMANDS: Array<{ label: string; cmd: string; hint: string }> = [
  {
    label: "Recommended (root launcher)",
    cmd: "powershell -NoProfile -ExecutionPolicy Bypass -File .\\Run-EcoWittCanary.ps1",
    hint: "Run from the repo root. Works even if PowerShell opens in C:\\WINDOWS\\system32.",
  },
  {
    label: "Dry-run (no network call)",
    cmd: "powershell -NoProfile -ExecutionPolicy Bypass -File .\\Run-EcoWittCanary.ps1 -DryRun",
    hint: "Validates inputs and redaction. Sends zero HTTP requests. Safe for demos and CI.",
  },
  {
    label: "Write redacted output to a file",
    cmd: "powershell -NoProfile -ExecutionPolicy Bypass -File .\\Run-EcoWittCanary.ps1 -OutFile .\\canary-out.txt",
    hint: "Appends matrix + SQL block. Secrets are never written to disk.",
  },
];

function WindowsRunCommandPanel() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };
  return (
    <Card data-testid="windows-run-command-panel">
      <CardHeader>
        <CardTitle className="text-base">Run EcoWitt Canary on Windows</CardTitle>
        <CardDescription>
          Operator-only. Paste a command into PowerShell from the repo root. Do not paste curl commands into prompts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {WINDOWS_RUN_COMMANDS.map((row) => (
          <div key={row.label} className="rounded-md border p-3" data-cmd-label={row.label}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{row.label}</div>
            <code className="block break-all rounded bg-muted p-2 font-mono text-xs">{row.cmd}</code>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{row.hint}</span>
              <Button size="sm" variant="outline" onClick={() => copy(row.cmd)}>
                {copied === row.cmd ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        ))}
        <ul className="list-disc pl-5 text-xs text-muted-foreground">
          <li>Paste only the requested value at each prompt (e.g. only the <code>vbt_...</code> token).</li>
          <li>The harness aborts with a clear error if any input contains <code>curl.exe</code> or whitespace.</li>
          <li>All output redacts bridge token, PASSKEY, and MAC.</li>
        </ul>
      </CardContent>
    </Card>
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
  const [savedAudit, setSavedAudit] = useState<BuiltAuditReport | null>(null);
  const [restoredAudit, setRestoredAudit] = useState<BuiltAuditReport | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    setSavedAudit(loadAuditFromLocalStorage());
  }, []);

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

  const builtAudit: BuiltAuditReport = useMemo(() => {
    const tent = tentQ.data ? { id: tentQ.data.id, name: tentQ.data.name } : null;
    return buildAuditReport({ tent, endpoint: ENDPOINT_PATH, preflight, report, verdict });
  }, [tentQ.data, preflight, report, verdict]);

  const handleImport = () => {
    const parsed = parseCanaryPaste(paste);
    setReport(parsed.report);
    setParseNotes(parsed.parseNotes);
  };

  const downloadRedactedAudit = () => {
    const blob = new Blob([JSON.stringify(builtAudit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ecowitt-canary-audit-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const rememberAudit = () => {
    saveAuditToLocalStorage(builtAudit);
    setSavedAudit(loadAuditFromLocalStorage());
    setSaveNotice("Saved redacted audit on this device.");
  };

  const clearSavedAudit = () => {
    clearAuditFromLocalStorage();
    setSavedAudit(null);
    setRestoredAudit(null);
    setSaveNotice("Cleared saved audit.");
  };

  const restoreSavedAudit = () => {
    if (savedAudit) {
      setRestoredAudit({ ...savedAudit, restored: true });
      setSaveNotice("Restored audit from local device storage.");
    }
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

      {savedAudit && !restoredAudit && (
        <Card data-testid="saved-audit-banner">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="text-sm">
              <div className="font-medium">Saved redacted audit found</div>
              <div className="text-xs text-muted-foreground">
                Generated {savedAudit.generated_at} · verdict {savedAudit.verdict.toUpperCase()}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={restoreSavedAudit}>
                Restore
              </Button>
              <Button size="sm" variant="outline" onClick={clearSavedAudit}>
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {restoredAudit && (
        <Card data-testid="restored-audit">
          <CardHeader>
            <CardTitle className="text-base">Restored from local device storage</CardTitle>
            <CardDescription>
              Verdict {restoredAudit.verdict.toUpperCase()} · {restoredAudit.cards.length} cards
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {restoredAudit.cards.map((c) => (
              <EvidenceCard key={c.key} card={c} />
            ))}
          </CardContent>
        </Card>
      )}

      {saveNotice && <div className="text-xs text-muted-foreground">{saveNotice}</div>}

      <WindowsRunCommandPanel />

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
          <EvidenceCard key={c.key} card={c} />
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
          <div className="flex flex-wrap gap-2">
            <Button onClick={downloadRedactedAudit} data-testid="download-redacted-audit">
              Download Redacted JSON Audit
            </Button>
            <Button variant="outline" onClick={rememberAudit} data-testid="remember-audit">
              Remember this redacted audit on this device
            </Button>
            <Button variant="outline" onClick={clearSavedAudit} data-testid="clear-saved-audit">
              Clear saved audit
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
