/**
 * Operator EcoWitt Canary Audit page.
 *
 * Read-only diagnostics. NO Supabase writes, NO rpc, NO functions.invoke,
 * NO alerts/Action Queue writes, NO AI calls, NO device control.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${v.cls}`}
    >
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
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">
              Evidence present
            </div>
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

const REPO_PLACEHOLDER = "<VERDANT_REPO_ROOT>";

const WINDOWS_RUN_COMMAND_TEMPLATES: Array<{
  key: string;
  label: string;
  build: (root: string) => string;
  hint: string;
}> = [
  {
    key: "recommended",
    label: "Recommended (root launcher)",
    build: (root) =>
      `cd ${root}\npowershell -NoProfile -ExecutionPolicy Bypass -File .\\Run-EcoWittCanary.ps1`,
    hint: "Run from the repo root. Works even if PowerShell opens in C:\\WINDOWS\\system32.",
  },
  {
    key: "dryrun",
    label: "Dry-run (no network call)",
    build: (root) =>
      `cd ${root}\npowershell -NoProfile -ExecutionPolicy Bypass -File .\\Run-EcoWittCanary.ps1 -DryRun`,
    hint: "Validates inputs and redaction. Sends zero HTTP requests. Safe for demos and CI.",
  },
  {
    key: "outfile",
    label: "Write redacted output to a file",
    build: (root) =>
      `cd ${root}\npowershell -NoProfile -ExecutionPolicy Bypass -File .\\Run-EcoWittCanary.ps1 -OutFile .\\canary-out.txt`,
    hint: "Appends matrix + SQL block. Secrets are never written to disk.",
  },
];

export function commandContainsPlaceholder(cmd: string): boolean {
  return cmd.includes(REPO_PLACEHOLDER);
}

export function buildWindowsCommand(template: (root: string) => string, repoPath: string): string {
  const trimmed = repoPath.trim();
  return template(trimmed.length > 0 ? trimmed : REPO_PLACEHOLDER);
}

function CopyButton({
  text,
  copied,
  onCopy,
  label,
}: {
  text: string;
  copied: boolean;
  onCopy: () => void;
  label?: string;
}) {
  return (
    <Button size="sm" variant="outline" onClick={onCopy} data-copied={copied} aria-label={label}>
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function WindowsRunCommandPanel() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [repoPath, setRepoPath] = useState("");
  const [warningKey, setWarningKey] = useState<string | null>(null);

  const attemptCopy = async (key: string, cmd: string, force: boolean) => {
    if (!force && commandContainsPlaceholder(cmd)) {
      setWarningKey(key);
      return;
    }
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedKey(key);
      setWarningKey(null);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      setCopiedKey(null);
    }
  };

  return (
    <Card data-testid="windows-run-command-panel">
      <CardHeader>
        <CardTitle className="text-base">Run EcoWitt Canary on Windows</CardTitle>
        <CardDescription>
          Operator-only. Paste a command into PowerShell from the repo root. Do not paste curl
          commands into prompts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border p-3" data-testid="repo-path-input">
          <label
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            htmlFor="repo-path"
          >
            Verdant repo path (optional)
          </label>
          <input
            id="repo-path"
            type="text"
            value={repoPath}
            onChange={(e) => {
              setRepoPath(e.target.value);
              setWarningKey(null);
            }}
            placeholder={`e.g. C:\\Users\\Cheek\\Projects\\verdant`}
            className="w-full rounded-md border bg-background px-2 py-1 font-mono text-xs"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="mt-1 text-[11px] text-muted-foreground">
            Stored only in this browser tab. Never sent to the server. Leave empty to copy the{" "}
            <code>{REPO_PLACEHOLDER}</code> placeholder instead.
          </div>
        </div>

        {WINDOWS_RUN_COMMAND_TEMPLATES.map((row) => {
          const cmd = buildWindowsCommand(row.build, repoPath);
          const hasPlaceholder = commandContainsPlaceholder(cmd);
          const showWarning = warningKey === row.key;
          return (
            <div
              key={row.key}
              className="rounded-md border p-3"
              data-cmd-label={row.label}
              data-cmd-key={row.key}
            >
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {row.label}
              </div>
              <code className="block whitespace-pre rounded bg-muted p-2 font-mono text-xs">
                {cmd}
              </code>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{row.hint}</span>
                <CopyButton
                  text={cmd}
                  copied={copiedKey === row.key}
                  onCopy={() => attemptCopy(row.key, cmd, false)}
                  label={`Copy ${row.label}`}
                />
              </div>
              {showWarning && hasPlaceholder && (
                <div
                  data-testid={`placeholder-warning-${row.key}`}
                  className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs"
                >
                  <div className="font-semibold text-amber-400">
                    This command still contains <code>{REPO_PLACEHOLDER}</code>.
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    Replace it with your actual Verdant repo path before running, or enter it in the
                    field above.
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => attemptCopy(row.key, cmd, true)}
                    >
                      Copy placeholder command anyway
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setWarningKey(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-400">
            Redaction Guarantee
          </div>
          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
            <li>
              Paste only the requested value at each prompt (e.g. only the <code>vbt_...</code>{" "}
              token).
            </li>
            <li>
              The harness aborts with a clear error if any input contains <code>curl.exe</code> or
              whitespace.
            </li>
            <li>
              All output redacts bridge token, PASSKEY, and MAC before printing or writing to disk.
            </li>
            <li>
              Never paste a raw cURL command into a PowerShell prompt; only paste the token string.
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

const REDACTION_PREVIEW_ROWS: Array<{ label: string; before: string; after: string }> = [
  { label: "Bridge token", before: "vbt_live_9f3c2a1b4d5e6f70 (example)", after: "vbt_REDACTED" },
  {
    label: "PASSKEY",
    before: "A1B2C3D4E5F60718293A4B5C6D7E8F90 (example)",
    after: "PASSKEY_REDACTED",
  },
  { label: "MAC", before: "XX:XX:XX:XX:XX:XX (example)", after: "MAC_REDACTED" },
  {
    label: "API key test field",
    before: "ak_test_examplevalue (example)",
    after: "SHOULD_NOT_PERSIST",
  },
];

function RedactionPreviewPanel() {
  const [open, setOpen] = useState(false);
  return (
    <Card data-testid="redaction-preview-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Preview redacted output</CardTitle>
          <CardDescription>Example only · not a live run · no real secrets shown.</CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen((v) => !v)}
          data-testid="redaction-preview-toggle"
        >
          {open ? "Hide preview" : "Show preview"}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3" data-testid="redaction-preview-body">
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left font-semibold">Field</th>
                  <th className="px-2 py-1 text-left font-semibold">Before (example)</th>
                  <th className="px-2 py-1 text-left font-semibold">After (what harness emits)</th>
                </tr>
              </thead>
              <tbody>
                {REDACTION_PREVIEW_ROWS.map((r) => (
                  <tr key={r.label} className="border-t">
                    <td className="px-2 py-1 font-medium">{r.label}</td>
                    <td className="px-2 py-1 font-mono text-muted-foreground">{r.before}</td>
                    <td className="px-2 py-1 font-mono text-primary">{r.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            If you see a real token, PASSKEY, MAC, or API key in your output, do not paste it
            anywhere. Re-run with the latest harness.
          </div>
        </CardContent>
      )}
    </Card>
  );
}

const DRY_RUN_SECTIONS: Array<{ id: string; title: string; body: string }> = [
  {
    id: "section-header",
    title: "Header / input validation",
    body: `=== EcoWitt Canary Dry-Run ===
Mode:          DryRun (no HTTP requests will be sent)
Bridge URL:    https://<edge>/functions/v1/ecowitt-ingest
Bridge Token:  vbt_REDACTED
PASSKEY:       PASSKEY_REDACTED
MAC:           MAC_REDACTED`,
  },
  {
    id: "section-main",
    title: "Scenario: main canary",
    body: `[1/3] Scenario: main_canary       -> inputs OK, redaction OK
       channel 9 present, payload validated`,
  },
  {
    id: "section-duplicate",
    title: "Scenario: duplicate replay",
    body: `[2/3] Scenario: duplicate_replay  -> inputs OK, redaction OK
       same captured_at re-sent, expected idempotent`,
  },
  {
    id: "section-malformed",
    title: "Scenario: malformed canary",
    body: `[3/3] Scenario: malformed_canary  -> inputs OK, redaction OK
       missing 21:05 timestamp, expected 4xx`,
  },
  {
    id: "section-matrix",
    title: "Audit matrix",
    body: `--- Audit Matrix (redacted) ---
| # | scenario           | expected | redacted |
| 1 | main_canary        | 200      | yes      |
| 2 | duplicate_replay   | 200/204  | yes      |
| 3 | malformed_canary   | 4xx      | yes      |`,
  },
  {
    id: "section-sql",
    title: "SQL verification block",
    body: `--- SQL Verification Block ---
-- (read-only; paste into Operator SQL panel)
select count(*) from sensor_readings where source = 'ecowitt' and captured_at > now() - interval '15 min';`,
  },
  {
    id: "section-footer",
    title: "Footer / next-step instruction",
    body: `Dry-run complete. 0 HTTP requests sent. No secrets written to disk.
Next: paste this redacted block into ChatGPT for grading.`,
  },
];

const DRY_RUN_FAILURES: Array<{ label: string; anchor: string }> = [
  { label: "Invalid bridge token", anchor: "section-header" },
  { label: "Pasted curl command into token prompt", anchor: "section-header" },
  { label: "Main POST command missing channel 9", anchor: "section-main" },
  { label: "Duplicate replay did not return idempotent status", anchor: "section-duplicate" },
  { label: "Malformed POST missing 21:05 timestamp", anchor: "section-malformed" },
  { label: "Matrix missing HTTP 200 checks", anchor: "section-matrix" },
  { label: "No SQL block printed", anchor: "section-sql" },
  { label: "No final paste-to-ChatGPT instruction", anchor: "section-footer" },
];

function DryRunGuidancePanel() {
  const scrollTo = (anchor: string) => {
    const el = document.getElementById(anchor);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1500);
    }
  };

  return (
    <Card data-testid="dry-run-guidance-panel">
      <CardHeader>
        <CardTitle className="text-base">Dry-Run Guidance</CardTitle>
        <CardDescription>Validate your setup before making any live POSTs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Run the dry-run command above. It checks inputs and redaction without sending any HTTP
            requests.
          </li>
          <li>If dry-run passes, you are ready for the live canary.</li>
          <li>
            If dry-run fails, click a failure below to jump to the section in the example output.
          </li>
          <li>For automated CI, use the OutFile mode and import the redacted result below.</li>
        </ol>

        <div data-testid="dry-run-success-example" className="rounded-md border bg-muted/40 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">
            What a successful dry-run looks like
          </div>
          <div className="space-y-2">
            {DRY_RUN_SECTIONS.map((s) => (
              <div
                key={s.id}
                id={s.id}
                data-section-id={s.id}
                className="rounded border bg-background p-2 transition"
              >
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {s.title}
                </div>
                <pre className="whitespace-pre font-mono text-[11px] leading-snug text-foreground">
                  {s.body}
                </pre>
              </div>
            ))}
          </div>
        </div>

        <div
          data-testid="dry-run-failure-guide"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs"
        >
          <div className="mb-1 font-semibold text-destructive">
            Where to look when dry-run fails
          </div>
          <ul className="space-y-1">
            {DRY_RUN_FAILURES.map((f) => (
              <li key={f.label}>
                <button
                  type="button"
                  onClick={() => scrollTo(f.anchor)}
                  data-failure-anchor={f.anchor}
                  className="text-left text-destructive underline-offset-2 hover:underline"
                >
                  {f.label}
                </button>{" "}
                <span className="text-muted-foreground">
                  → {DRY_RUN_SECTIONS.find((s) => s.id === f.anchor)?.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function RedactionWarningBanner() {
  return (
    <div
      className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm"
      data-testid="redaction-warning-banner"
    >
      <span className="text-lg">🛡️</span>
      <div>
        <div className="font-medium text-destructive">Secrets are redacted automatically</div>
        <div className="text-muted-foreground">
          The harness replaces bridge tokens, PASSKEYs, and MACs with placeholders before printing
          or saving. If you see a real secret in any output, treat it as a leak and abort
          immediately.
        </div>
      </div>
    </div>
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSavedAudit(loadAuditFromLocalStorage());
  }, []);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? "");
      setPaste(text);
      const parsed = parseCanaryPaste(text);
      setReport(parsed.report);
      setParseNotes(parsed.parseNotes);
      setSaveNotice(`Loaded redacted output from ${file.name}. Review then Import.`);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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
    <div
      className="container mx-auto max-w-5xl space-y-6 p-4 md:p-6"
      data-testid="operator-ecowitt-canary"
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">EcoWitt Canary Audit</h1>
        <p className="text-sm text-muted-foreground">
          Operator Mode · Read-only diagnostics · Endpoint:{" "}
          <code className="font-mono">{ENDPOINT_PATH}</code>
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

      <div
        className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
        data-testid="security-posture-note"
      >
        🔒{" "}
        <span className="font-medium text-foreground">
          For security, Verdant does not run EcoWitt canary POSTs from the browser.
        </span>{" "}
        Run the local harness, then import the redacted output here.
      </div>

      <RedactionWarningBanner />
      <RedactionPreviewPanel />
      <WindowsRunCommandPanel />
      <DryRunGuidancePanel />

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
            <Button
              onClick={runPreflight}
              disabled={!authAvailable || !selectedTentId || tentQ.isLoading}
            >
              Run Pre-POST Validator
            </Button>
            {tentQ.isLoading && (
              <span className="text-xs text-muted-foreground">Loading tent…</span>
            )}
          </div>

          {preflight && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <StatusPill
                  status={
                    preflight.status === "pass"
                      ? "pass"
                      : preflight.status === "fail"
                        ? "fail"
                        : "incomplete"
                  }
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
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.json"
              className="sr-only"
              onChange={handleFileImport}
              data-testid="outfile-import-input"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              data-testid="load-outfile-button"
            >
              Load from OutFile
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
              {verdict.verdict === "go"
                ? "GO"
                : verdict.verdict === "no_go"
                  ? "NO-GO"
                  : "INCOMPLETE"}
            </span>
          </CardTitle>
          <CardDescription>
            Read-only diagnostics · no device control · no automation · no alerts · no Action Queue
            writes.
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
