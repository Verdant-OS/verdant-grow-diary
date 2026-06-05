/**
 * Operator EcoWitt Canary Audit page.
 *
 * Read-only diagnostics. NO Supabase writes, NO rpc, NO functions.invoke,
 * NO alerts/Action Queue writes, NO AI calls, NO device control.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTents } from "@/hooks/use-tents";
import { useAuth } from "@/store/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  buildAuditReport,
  buildDrillDown,
  buildVerdictCsv,
  buildVerdictExport,
  buildVerdictFilename,
  buildWorkflowSnapshot,
  clearAuditFromLocalStorage,
  clearWorkflowFromLocalStorage,
  computeVerdict,
  detectSecretCategories,
  evaluatePreflight,
  loadAuditFromLocalStorage,
  loadWorkflowFromLocalStorage,
  migrateLegacyWorkflowSnapshots,
  parseCanaryImport,
  saveAuditToLocalStorage,
  saveWorkflowToLocalStorage,
  type BuiltAuditReport,
  type CanaryReportInput,
  type CardStatus,
  type ImportParseError,
  type PreflightResult,
  type VerdictCard,
  type VerdictResult,
  type WorkflowSnapshot,
} from "@/lib/ecowittCanaryAuditRules";
import {
  runEcowittCloudCanary,
  type EcowittCloudCanaryVerdict,
} from "@/lib/ecowittCloudCanaryVerdict";
import { buildCloudCanaryPreviewViewModel } from "@/lib/ecowittCloudCanaryViewModel";
import {
  buildCloudCanaryExport,
  serializeCloudCanaryExportToCsv,
  serializeCloudCanaryExportToJson,
  CLOUD_CANARY_EXPORT_CSV_FILENAME,
  CLOUD_CANARY_EXPORT_JSON_FILENAME,
} from "@/lib/ecowittCloudCanaryExport";
import cloudCanaryFixtures from "../../fixtures/ecowitt-cloud-canary-payloads.json";

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

function EvidenceCard({
  card,
  drill,
  autoOpenAndScroll = false,
}: {
  card: VerdictCard;
  drill?: ReturnType<typeof buildDrillDown>;
  autoOpenAndScroll?: boolean;
}) {
  const [open, setOpen] = useState(autoOpenAndScroll && card.status === "fail");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !drill || drill.offending.length === 0) return;
    const targetId = `evidence-row-${card.key}-0`;
    const raf = requestAnimationFrame(() => {
      const el = bodyRef.current?.querySelector<HTMLElement>(`#${CSS.escape(targetId)}`);
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        el.scrollIntoView();
      }
      try {
        el.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
      setHighlightId(targetId);
      const t = window.setTimeout(() => setHighlightId(null), 1600);
      return () => window.clearTimeout(t);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, drill, card.key]);

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
        {drill && (
          <div data-drilldown-card={card.key} className="pt-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpen((v) => !v)}
              data-testid={`drilldown-toggle-${card.key}`}
              className="h-7 px-2 text-xs"
            >
              {open ? "Hide drill-down" : "Drill down"}
            </Button>
            {open && (
              <div
                ref={bodyRef}
                data-testid={`drilldown-body-${card.key}`}
                className="mt-2 rounded-md border bg-muted/40 p-2 text-xs"
              >
                <div className="font-semibold">Status: {drill.status.toUpperCase()}</div>
                <div className="mt-1 text-muted-foreground">{drill.reason}</div>
                {drill.offending.length > 0 && (
                  <div className="mt-2">
                    <div className="font-semibold text-destructive">Offending evidence</div>
                    <ul className="list-disc pl-5" data-testid={`drilldown-rows-${card.key}`}>
                      {drill.offending.map((o, i) => {
                        const rowId = `evidence-row-${card.key}-${i}`;
                        const isHi = highlightId === rowId;
                        return (
                          <li
                            key={i}
                            id={rowId}
                            tabIndex={-1}
                            data-evidence-row={i}
                            className={
                              "font-mono outline-none transition-colors " +
                              (isHi ? "bg-primary/20 ring-1 ring-primary rounded px-1" : "")
                            }
                          >
                            {o}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {drill.unavailable && drill.offending.length === 0 && (
                  <div className="mt-2 italic text-muted-foreground">
                    offending row not available in imported report
                  </div>
                )}
                {drill.next_action && (
                  <div className="mt-2">
                    <span className="font-semibold">Next: </span>
                    {drill.next_action}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const REPO_PLACEHOLDER = "<VERDANT_REPO_ROOT>";

const WINDOWS_RUN_COMMAND_TEMPLATES: Array<{ key: string; label: string; build: (root: string) => string; hint: string }> = [
  {
    key: "recommended",
    label: "Recommended (root launcher)",
    build: (root) => `cd ${root}\npowershell -NoProfile -ExecutionPolicy Bypass -File .\\Run-EcoWittCanary.ps1`,
    hint: "Run from the repo root. Works even if PowerShell opens in C:\\WINDOWS\\system32.",
  },
  {
    key: "dryrun",
    label: "Dry-run (no network call)",
    build: (root) => `cd ${root}\npowershell -NoProfile -ExecutionPolicy Bypass -File .\\Run-EcoWittCanary.ps1 -DryRun`,
    hint: "Validates inputs and redaction. Sends zero HTTP requests. Safe for demos and CI.",
  },
  {
    key: "outfile",
    label: "Write redacted output to a file",
    build: (root) => `cd ${root}\npowershell -NoProfile -ExecutionPolicy Bypass -File .\\Run-EcoWittCanary.ps1 -OutFile .\\canary-out.txt`,
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

function CopyButton({ text, copied, onCopy, label }: { text: string; copied: boolean; onCopy: () => void; label?: string }) {
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
          Operator-only. Paste a command into PowerShell from the repo root. Do not paste curl commands into prompts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border p-3" data-testid="repo-path-input">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="repo-path">
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
            <div key={row.key} className="rounded-md border p-3" data-cmd-label={row.label} data-cmd-key={row.key}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{row.label}</div>
              <code className="block whitespace-pre rounded bg-muted p-2 font-mono text-xs">{cmd}</code>
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
                    Replace it with your actual Verdant repo path before running, or enter it in the field above.
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => attemptCopy(row.key, cmd, true)}>
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
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-400">Redaction Guarantee</div>
          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
            <li>Paste only the requested value at each prompt (e.g. only the <code>vbt_...</code> token).</li>
            <li>The harness aborts with a clear error if any input contains <code>curl.exe</code> or whitespace.</li>
            <li>All output redacts bridge token, PASSKEY, and MAC before printing or writing to disk.</li>
            <li>Never paste a raw cURL command into a PowerShell prompt; only paste the token string.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

const REDACTION_PREVIEW_ROWS: Array<{ label: string; before: string; after: string }> = [
  { label: "Bridge token", before: "vbt_live_9f3c2a1b4d5e6f70 (example)", after: "vbt_REDACTED" },
  { label: "PASSKEY", before: "A1B2C3D4E5F60718293A4B5C6D7E8F90 (example)", after: "PASSKEY_REDACTED" },
  { label: "MAC", before: "XX:XX:XX:XX:XX:XX (example)", after: "MAC_REDACTED" },
  { label: "API key test field", before: "ak_test_examplevalue (example)", after: "SHOULD_NOT_PERSIST" },
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
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} data-testid="redaction-preview-toggle">
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
            If you see a real token, PASSKEY, MAC, or API key in your output, do not paste it anywhere. Re-run with the
            latest harness.
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
          <li>Run the dry-run command above. It checks inputs and redaction without sending any HTTP requests.</li>
          <li>If dry-run passes, you are ready for the live canary.</li>
          <li>If dry-run fails, click a failure below to jump to the section in the example output.</li>
          <li>For automated CI, use the OutFile mode and import the redacted result below.</li>
        </ol>

        <div data-testid="dry-run-success-example" className="rounded-md border bg-muted/40 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">
            What a successful dry-run looks like
          </div>
          <div className="space-y-2">
            {DRY_RUN_SECTIONS.map((s) => (
              <div key={s.id} id={s.id} data-section-id={s.id} className="rounded border bg-background p-2 transition">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {s.title}
                </div>
                <pre className="whitespace-pre font-mono text-[11px] leading-snug text-foreground">{s.body}</pre>
              </div>
            ))}
          </div>
        </div>

        <div
          data-testid="dry-run-failure-guide"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs"
        >
          <div className="mb-1 font-semibold text-destructive">Where to look when dry-run fails</div>
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

export function CloudCanaryPreviewPanel() {
  const [copied, setCopied] = useState(false);

  const verdict: EcowittCloudCanaryVerdict = useMemo(() => {
    const ORDER = [
      "happy_multi_channel",
      "stale_only",
      "invalid_humidity",
      "stuck_soil_extreme",
      "unmapped_channel",
      "missing_metrics",
      "pressure_present",
      "celsius_looking_fahrenheit",
    ];
    const fixtureList = ORDER.map((id) => ({
      id,
      payload: (cloudCanaryFixtures.payloads as Record<string, unknown>)[id],
    }));
    return runEcowittCloudCanary(
      fixtureList,
      cloudCanaryFixtures.mapping as unknown as Parameters<typeof runEcowittCloudCanary>[1],
      { now: new Date(cloudCanaryFixtures.now) },
    );
  }, []);

  const verdictJson = useMemo(() => JSON.stringify(verdict, null, 2), [verdict]);
  const previewVm = useMemo(() => buildCloudCanaryPreviewViewModel(verdict), [verdict]);
  // Slice C: ONE serializer pass — preview + download read the same bytes.
  const exportObj = useMemo(() => buildCloudCanaryExport(previewVm), [previewVm]);
  const exportCsv = useMemo(() => serializeCloudCanaryExportToCsv(exportObj), [exportObj]);
  const exportJson = useMemo(() => serializeCloudCanaryExportToJson(exportObj), [exportObj]);
  // Slice C-fix: run-timing is presentation-only and NEVER threaded into the
  // serializer (the payload is deterministic). Computed once per render cycle.
  const runViewedAt = useMemo(() => new Date().toISOString(), [exportObj]);

  const handleCopy = async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(verdictJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      toast.error("Could not copy JSON to clipboard.");
      // eslint-disable-next-line no-console
      console.warn("[cloud-canary-preview] copy failed", e);
    }
  };

  return (
    <Card data-testid="cloud-canary-preview-panel">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Cloud Normalization Canary Preview</CardTitle>
            <CardDescription>Fixture-only preview · no live API · no DB writes.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          data-testid="cloud-canary-fixture-label"
          className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-400"
        >
          <span className="font-semibold">Fixture-only:</span> These are static test payloads. No real EcoWitt device is
          queried.
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-md border p-2 text-center" data-metric="fixtures">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Fixtures</div>
            <div className="text-sm font-semibold">{verdict.summaries.length}</div>
          </div>
          <div className="rounded-md border p-2 text-center" data-metric="normalized">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Normalized</div>
            <div className="text-sm font-semibold">{verdict.totals.mapped}</div>
          </div>
          <div className="rounded-md border p-2 text-center" data-metric="unmapped">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Unmapped</div>
            <div className="text-sm font-semibold">{verdict.totals.unmapped}</div>
          </div>
          <div className="rounded-md border p-2 text-center" data-metric="invalid">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Invalid</div>
            <div className="text-sm font-semibold">{verdict.totals.invalid}</div>
          </div>
          <div className="rounded-md border p-2 text-center" data-metric="stale">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Stale</div>
            <div className="text-sm font-semibold">{verdict.totals.stale}</div>
          </div>
          <div className="rounded-md border p-2 text-center" data-metric="missing-metric">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Missing metric</div>
            <div className="text-sm font-semibold">{verdict.any_missing_metric ? "Yes" : "No"}</div>
          </div>
          <div className="rounded-md border p-2 text-center" data-metric="ec-absence">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">EC invented</div>
            <div className="text-sm font-semibold">{verdict.any_ec_metric_invented ? "Yes" : "No"}</div>
          </div>
          <div className="rounded-md border p-2 text-center" data-metric="suspicious-flags">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Suspicious flags</div>
            <div className="text-sm font-semibold">{verdict.suspicious_flag_codes.length}</div>
          </div>
        </div>

        {previewVm.state === "empty" ? (
          <div
            data-testid="cloud-canary-empty-state"
            data-preview-state="empty"
            className="rounded-md border border-dashed bg-muted/30 p-4 text-center text-xs text-muted-foreground"
          >
            <div className="font-semibold text-foreground">Nothing to preview</div>
            <div className="mt-1">
              No fixtures are available for the cloud canary right now.
            </div>
          </div>
        ) : (
          <div
            className="overflow-hidden rounded-md border"
            data-testid="cloud-canary-per-fixture-table"
            data-preview-state="populated"
          >
            <div className="border-b bg-muted/40 px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Per-fixture counts · fixture/sample canary · not tent data
            </div>
            <table className="w-full text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left font-semibold">Fixture</th>
                  <th className="px-2 py-1 text-right font-semibold" title="Mapped rows classified as fresh by the normalizer">
                    Fresh
                  </th>
                  <th className="px-2 py-1 text-right font-semibold">Stale-class</th>
                  <th className="px-2 py-1 text-right font-semibold">Invalid-class</th>
                  <th className="px-2 py-1 text-right font-semibold border-l">Mapped total</th>
                  <th className="px-2 py-1 text-right font-semibold border-l-2 border-l-foreground/30">
                    Unmapped (separate)
                  </th>
                  <th className="px-2 py-1 text-left font-semibold border-l" title="Closed-vocabulary data-classification codes from the normalizer">
                    Suspicious codes
                  </th>
                  <th className="px-2 py-1 text-left font-semibold border-l" title="Closed-vocabulary missing-metric codes from the normalizer">
                    Missing-metric codes
                  </th>
                </tr>
              </thead>
              <tbody>
                {previewVm.rows.map((row) => (
                  <tr
                    key={row.fixture_name}
                    className={
                      row.state === "zero_mapped_gap"
                        ? "border-t bg-amber-500/10"
                        : "border-t"
                    }
                    data-testid={`cloud-canary-row-${row.fixture_name}`}
                    data-fixture-name={row.fixture_name}
                    data-row-state={row.state}
                  >
                    <td className="px-2 py-1 font-mono">{row.fixture_name}</td>
                    <td className="px-2 py-1 text-right tabular-nums" data-col="live">
                      {row.live_count}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums" data-col="stale">
                      {row.stale_count}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums" data-col="invalid">
                      {row.invalid_count}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums border-l font-semibold" data-col="mapped">
                      {row.mapped_count}
                    </td>
                    <td
                      className="px-2 py-1 text-right tabular-nums border-l-2 border-l-foreground/30"
                      data-col="unmapped"
                    >
                      {row.unmapped_count}
                    </td>
                    <td
                      className="px-2 py-1 border-l align-top"
                      data-col="suspicious-codes"
                      data-suspicious-code-count={row.suspicious_flag_codes.length}
                    >
                      {row.suspicious_flag_codes.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.suspicious_flag_codes.map((code) => (
                            <span
                              key={code}
                              data-suspicious-code={code}
                              className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                            >
                              {code}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td
                      className="px-2 py-1 border-l align-top"
                      data-col="missing-metric-codes"
                      data-missing-metric-code-count={row.missing_metric_codes.length}
                    >
                      {row.missing_metric_codes.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.missing_metric_codes.map((code) => (
                            <span
                              key={code}
                              data-missing-metric-code={code}
                              className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                            >
                              {code}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previewVm.rows.some((r) => r.state === "zero_mapped_gap") && (
              <div
                data-testid="cloud-canary-zero-mapped-warning"
                className="border-t border-amber-500/40 bg-amber-500/10 px-2 py-2 text-[11px] text-amber-300"
              >
                <span className="font-semibold">Mapping gap:</span>{" "}
                Readings present but none mapped to a tent — check mapping config.
              </div>
            )}
          </div>
        )}

        {verdict.suspicious_flag_codes.length > 0 && (
          <div className="flex flex-wrap gap-1" data-testid="cloud-suspicious-codes">
            {verdict.suspicious_flag_codes.map((code) => (
              <span key={code} className="rounded-md border bg-muted px-2 py-0.5 text-xs font-mono">
                {code}
              </span>
            ))}
          </div>
        )}

        <div
          data-testid="cloud-canary-export-preview"
          className="space-y-2"
        >
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Fixture/sample canary export preview · exact bytes that will download
          </div>
          <details className="rounded-md border bg-muted/30">
            <summary className="cursor-pointer px-2 py-1 text-xs font-semibold">
              Preview CSV ({CLOUD_CANARY_EXPORT_CSV_FILENAME})
            </summary>
            <pre
              data-testid="cloud-canary-export-preview-csv"
              className="max-h-72 overflow-auto whitespace-pre px-2 py-2 font-mono text-[11px] leading-snug"
            >
              {exportCsv}
            </pre>
          </details>
          <details className="rounded-md border bg-muted/30">
            <summary className="cursor-pointer px-2 py-1 text-xs font-semibold">
              Preview JSON ({CLOUD_CANARY_EXPORT_JSON_FILENAME})
            </summary>
            <pre
              data-testid="cloud-canary-export-preview-json"
              className="max-h-72 overflow-auto whitespace-pre px-2 py-2 font-mono text-[11px] leading-snug"
            >
              {exportJson}
            </pre>
          </details>
        </div>

        <div
          data-testid="cloud-canary-export-meta"
          className="rounded-md border bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground"
        >
          <div>
            Download files:{" "}
            <span data-testid="cloud-canary-export-filename-csv" className="font-mono">
              {CLOUD_CANARY_EXPORT_CSV_FILENAME}
            </span>
            {" · "}
            <span data-testid="cloud-canary-export-filename-json" className="font-mono">
              {CLOUD_CANARY_EXPORT_JSON_FILENAME}
            </span>
          </div>
          <div>
            Preview viewed at{" "}
            <span data-testid="cloud-canary-export-run-timing" className="font-mono">
              {runViewedAt}
            </span>{" "}
            (display only — not written to the file)
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            data-testid="copy-cloud-verdict-json"
            disabled={copied}
          >
            {copied ? "Copied" : "Copy Redacted Verdict JSON"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const blob = new Blob([exportCsv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = CLOUD_CANARY_EXPORT_CSV_FILENAME;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
            data-testid="download-cloud-canary-summary-csv"
          >
            Download Fixture Summary CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const blob = new Blob([exportJson], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = CLOUD_CANARY_EXPORT_JSON_FILENAME;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
            data-testid="download-cloud-canary-summary-json"
          >
            Download Fixture Summary JSON
          </Button>
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
          The harness replaces bridge tokens, PASSKEYs, and MACs with placeholders before printing or saving. If you see
          a real secret in any output, treat it as a leak and abort immediately.
        </div>
      </div>
    </div>
  );
}

function NoBrowserPostsNotice() {
  return (
    <div
      className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
      data-testid="no-browser-posts-notice"
    >
      <span className="font-medium text-foreground">For security, Verdant does not run EcoWitt canary POSTs from the browser.</span>{" "}
      Run the local harness on Windows, then import the redacted output here. No bridge tokens, PASSKEYs, or MACs are ever entered into this page.
    </div>
  );
}

type WorkflowStageStatus = "pass" | "fail" | "incomplete" | "active" | "pending";

function StageDot({ status }: { status: WorkflowStageStatus }) {
  const cls: Record<WorkflowStageStatus, string> = {
    pass: "bg-primary text-primary-foreground border-primary",
    fail: "bg-destructive text-destructive-foreground border-destructive",
    incomplete: "bg-muted text-muted-foreground border-border",
    active: "bg-background text-foreground border-primary",
    pending: "bg-background text-muted-foreground border-border",
  };
  const label: Record<WorkflowStageStatus, string> = {
    pass: "✓",
    fail: "!",
    incomplete: "•",
    active: "•",
    pending: "•",
  };
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${cls[status]}`}>
      {label[status]}
    </span>
  );
}

function CanaryWorkflowStatusBar({
  preflight,
  reportLoaded,
  verdict,
}: {
  preflight: PreflightResult | null;
  reportLoaded: boolean;
  verdict: VerdictResult;
}) {
  const preflightStatus: WorkflowStageStatus = preflight
    ? preflight.status === "pass"
      ? "pass"
      : preflight.status === "fail"
        ? "fail"
        : "incomplete"
    : "active";
  const runStatus: WorkflowStageStatus = preflight?.status === "pass" ? "active" : "pending";
  const importStatus: WorkflowStageStatus = reportLoaded ? "pass" : preflight?.status === "pass" ? "active" : "pending";
  const verdictStatus: WorkflowStageStatus = !reportLoaded
    ? "pending"
    : verdict.verdict === "go"
      ? "pass"
      : verdict.verdict === "no_go"
        ? "fail"
        : "incomplete";

  const stages: Array<{ key: string; label: string; hint: string; status: WorkflowStageStatus }> = [
    { key: "preflight", label: "Preflight", hint: "Tent + EcoWitt mapping", status: preflightStatus },
    { key: "run", label: "Run harness", hint: "Local PowerShell only", status: runStatus },
    { key: "import", label: "Import output", hint: "Redacted paste / OutFile", status: importStatus },
    { key: "verdict", label: "Verdict", hint: "GO / NO-GO / INCOMPLETE", status: verdictStatus },
  ];

  return (
    <Card data-testid="canary-workflow-status-bar">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Canary Workflow</CardTitle>
        <CardDescription>Self-contained UI workflow · no browser POSTs · no Supabase writes.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {stages.map((s, i) => (
            <li key={s.key} className="flex items-center gap-3 rounded-md border p-2" data-stage={s.key} data-status={s.status}>
              <StageDot status={s.status} />
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step {i + 1}</div>
                <div className="text-sm font-medium">{s.label}</div>
                <div className="truncate text-xs text-muted-foreground">{s.hint}</div>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function ResultsDashboard({
  preflight,
  report,
  verdict,
  onDownloadJson,
  onDownloadCsv,
  onCopyJson,
  copyDisabled,
}: {
  preflight: PreflightResult | null;
  report: CanaryReportInput | null;
  verdict: VerdictResult;
  onDownloadJson: () => void;
  onDownloadCsv: () => void;
  onCopyJson: () => void;
  copyDisabled: boolean;
}) {
  const verdictLabel = verdict.verdict === "go" ? "GO" : verdict.verdict === "no_go" ? "NO-GO" : "INCOMPLETE";
  const verdictCls =
    verdict.verdict === "go"
      ? "bg-primary/15 text-primary border-primary/40"
      : verdict.verdict === "no_go"
        ? "bg-destructive/15 text-destructive border-destructive/40"
        : "bg-muted text-muted-foreground border-border";

  const passCount = verdict.cards.filter((c) => c.status === "pass").length;
  const failCount = verdict.cards.filter((c) => c.status === "fail").length;
  const incompleteCount = verdict.cards.filter((c) => c.status === "incomplete" || c.status === "unknown").length;

  const mainRows = report?.main_row_counts
    ? Object.values(report.main_row_counts).reduce((a, b) => a + (b ?? 0), 0)
    : null;
  const malformedRows = report?.malformed_row_counts
    ? Object.values(report.malformed_row_counts).reduce((a, b) => a + (b ?? 0), 0)
    : null;
  const ch9 = report?.channel_9_count ?? null;
  const leaks = report?.leak_scan_count ?? null;

  return (
    <Card data-testid="canary-results-dashboard">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Results Dashboard</CardTitle>
            <CardDescription>
              {report
                ? "Live view of the imported canary report."
                : "Waiting for redacted harness output. Run the harness on Windows, then import."}
            </CardDescription>
          </div>
          <span
            className={`inline-flex items-center rounded-md border px-3 py-1 text-sm font-semibold ${verdictCls}`}
            data-testid="dashboard-verdict-pill"
          >
            {verdictLabel}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-md border p-2 text-center" data-metric="preflight">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Preflight</div>
            <div className="text-sm font-semibold">
              {preflight ? preflight.status.toUpperCase() : "—"}
            </div>
          </div>
          <div className="rounded-md border p-2 text-center" data-metric="main-rows">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Main rows</div>
            <div className="text-sm font-semibold">{mainRows ?? "—"} <span className="text-xs text-muted-foreground">/ 4</span></div>
          </div>
          <div className="rounded-md border p-2 text-center" data-metric="malformed-rows">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Malformed</div>
            <div className="text-sm font-semibold">{malformedRows ?? "—"} <span className="text-xs text-muted-foreground">/ 2</span></div>
          </div>
          <div className="rounded-md border p-2 text-center" data-metric="channel-9">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Ch 9 / leaks</div>
            <div className="text-sm font-semibold">
              {ch9 ?? "—"} / {leaks ?? "—"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-md border bg-primary/10 px-2 py-0.5 text-primary">{passCount} pass</span>
          <span className="rounded-md border bg-destructive/10 px-2 py-0.5 text-destructive">{failCount} fail</span>
          <span className="rounded-md border bg-muted px-2 py-0.5 text-muted-foreground">{incompleteCount} incomplete</span>
        </div>

        {verdict.reasons.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-destructive" data-testid="dashboard-reasons">
            {verdict.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2" data-testid="dashboard-exports">
          <Button size="sm" variant="outline" onClick={onDownloadJson} data-testid="download-verdict-json">
            Download Verdict JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onCopyJson}
            disabled={copyDisabled}
            data-testid="copy-verdict-json"
          >
            Copy JSON
          </Button>
          <Button size="sm" variant="outline" onClick={onDownloadCsv} data-testid="download-verdict-csv">
            Download Verdict CSV
          </Button>
        </div>
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
  const [importSecretCategories, setImportSecretCategories] = useState<string[]>([]);
  const [savedWorkflow, setSavedWorkflow] = useState<WorkflowSnapshot | null>(null);
  const [workflowRestoredAt, setWorkflowRestoredAt] = useState<string | null>(null);
  const [importError, setImportError] = useState<ImportParseError | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // One-time, idempotent migration of legacy localStorage workflow snapshots.
    try {
      migrateLegacyWorkflowSnapshots();
    } catch {
      /* never crash boot */
    }
    setSavedAudit(loadAuditFromLocalStorage());
    setSavedWorkflow(loadWorkflowFromLocalStorage());
  }, []);

  const importBlocked = importSecretCategories.length > 0;

  const ingestText = (text: string, sourceLabel: string) => {
    const cats = detectSecretCategories(text);
    if (cats.length > 0) {
      setImportSecretCategories(cats);
      setReport(null);
      setParseNotes([]);
      setImportError(null);
      setSaveNotice(null);
      // Preserve raw input so the user can redact + retry.
      setPaste(text);
      return;
    }
    setImportSecretCategories([]);
    setPaste(text);
    const result = parseCanaryImport(text);
    if (!result.ok && result.error) {
      setImportError(result.error);
      setReport(null);
      setParseNotes([]);
      setSaveNotice(null);
      return;
    }
    setImportError(null);
    setReport(result.report);
    setParseNotes(result.parseNotes);
    setSaveNotice(`Imported redacted output from ${sourceLabel}.`);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void readFileAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const readFileAsText = (file: File) => {
    const okType =
      /\.(json|txt)$/i.test(file.name) ||
      file.type === "application/json" ||
      file.type === "text/plain" ||
      file.type === "";
    if (!okType) {
      setImportError({
        kind: "unsupported",
        message: `Unsupported file type: ${file.type || "unknown"}. Use .json or .txt.`,
      });
      return;
    }
    if (file.size === 0) {
      setImportError({ kind: "empty", message: "File is empty." });
      return;
    }
    if (file.size > 5_000_000) {
      setImportError({ kind: "unsupported", message: "File is too large (>5 MB). Trim to canary output only." });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? "");
      ingestText(text, file.name);
    };
    reader.onerror = () => {
      setImportError({ kind: "unsupported", message: "Could not read file." });
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    readFileAsText(file);
  };

  const clearImport = () => {
    setPaste("");
    setReport(null);
    setParseNotes([]);
    setImportSecretCategories([]);
    setImportError(null);
    setSaveNotice("Cleared import.");
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
    ingestText(paste, "paste");
  };

  const downloadBlob = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadRedactedAudit = () =>
    downloadBlob(JSON.stringify(builtAudit, null, 2), `ecowitt-canary-audit-${Date.now()}.json`, "application/json");

  const workflowSlug = useMemo(() => {
    const tentName = tentQ.data?.name ?? "";
    return tentName || "workflow";
  }, [tentQ.data?.name]);

  const verdictJsonString = useMemo(
    () => JSON.stringify(buildVerdictExport(builtAudit), null, 2),
    [builtAudit],
  );

  const verdictAvailable = verdict.verdict !== "incomplete" || !!report || !!preflight;

  const downloadVerdictJson = () =>
    downloadBlob(
      verdictJsonString,
      buildVerdictFilename({ workflowSlug, ext: "json" }),
      "application/json",
    );

  const downloadVerdictCsv = () =>
    downloadBlob(
      buildVerdictCsv(builtAudit),
      buildVerdictFilename({ workflowSlug, ext: "csv" }),
      "text/csv;charset=utf-8;",
    );

  const copyVerdictJson = async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(verdictJsonString);
      toast.success("Redacted JSON copied.");
    } catch (e) {
      toast.error("Could not copy JSON to clipboard.");
      // eslint-disable-next-line no-console
      console.warn("[operator-ecowitt] copy JSON failed", e);
    }
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

  // Auto-save redacted workflow snapshot (never raw paste).
  useEffect(() => {
    if (!preflight && !report) return;
    const snap = buildWorkflowSnapshot({ preflight, report, verdict });
    saveWorkflowToLocalStorage(snap);
  }, [preflight, report, verdict]);

  const restoreSavedWorkflow = () => {
    if (!savedWorkflow) return;
    if (savedWorkflow.preflight) setPreflight(savedWorkflow.preflight);
    if (savedWorkflow.imported_report) setReport(savedWorkflow.imported_report);
    setWorkflowRestoredAt(savedWorkflow.saved_at);
    setSaveNotice("Restored EcoWitt canary workflow from local device storage.");
  };

  const clearSavedWorkflow = () => {
    clearWorkflowFromLocalStorage();
    setSavedWorkflow(null);
    setWorkflowRestoredAt(null);
    setSaveNotice("Cleared saved workflow.");
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

      {savedWorkflow && !workflowRestoredAt && (
        <Card data-testid="saved-workflow-banner">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="text-sm">
              <div className="font-medium">Saved EcoWitt canary workflow found</div>
              <div className="text-xs text-muted-foreground">
                Saved {savedWorkflow.saved_at} · verdict {savedWorkflow.verdict.toUpperCase()} · {savedWorkflow.counts.pass} pass / {savedWorkflow.counts.fail} fail / {savedWorkflow.counts.incomplete} incomplete
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={restoreSavedWorkflow} data-testid="restore-saved-workflow">
                Restore
              </Button>
              <Button size="sm" variant="outline" onClick={clearSavedWorkflow} data-testid="clear-saved-workflow">
                Clear saved workflow
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {workflowRestoredAt && (
        <div
          className="inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary"
          data-testid="restored-from-local"
        >
          Restored from local device storage · {workflowRestoredAt}
        </div>
      )}

      {saveNotice && <div className="text-xs text-muted-foreground">{saveNotice}</div>}

      <NoBrowserPostsNotice />
      <CanaryWorkflowStatusBar preflight={preflight} reportLoaded={!!report} verdict={verdict} />

      <RedactionWarningBanner />
      <RedactionPreviewPanel />
      <WindowsRunCommandPanel />
      <DryRunGuidancePanel />
      <CloudCanaryPreviewPanel />

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

      {/* Import canary output */}
      <Card data-testid="import-canary-output">
        <CardHeader>
          <CardTitle>Import canary output</CardTitle>
          <CardDescription>
            Upload a redacted <code>.txt</code> / <code>.json</code> harness output, or paste it below. Browser POSTs are never made from this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            data-testid="import-dropzone"
            data-dragover={isDragOver ? "true" : "false"}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={
              "rounded-md border-2 border-dashed p-3 transition-colors " +
              (isDragOver ? "border-primary bg-primary/10" : "border-border bg-muted/30")
            }
          >
            <div className="mb-2 text-xs text-muted-foreground">
              Drag a redacted <code>.json</code> or <code>.txt</code> file here, or paste below.
            </div>
            <Textarea
              aria-label="Paste canary harness output"
              placeholder='Paste redacted OutFile text, or { "main_row_counts": { ... }, ... }'
              value={paste}
              onChange={(e) => {
                setPaste(e.target.value);
                setImportSecretCategories([]);
                setImportError(null);
              }}
              rows={8}
              className="font-mono text-xs"
            />
          </div>
          {importBlocked && (
            <div
              data-testid="import-secret-warning"
              className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs"
            >
              <div className="font-semibold text-destructive">
                Possible unredacted secret detected. Redact before importing.
              </div>
              <div className="mt-1 text-muted-foreground">
                Pattern categories matched (values not shown): {importSecretCategories.join(", ")}
              </div>
            </div>
          )}
          {importError && (
            <div
              data-testid={`import-error-${importError.kind}`}
              className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs"
            >
              <div className="font-semibold text-destructive">
                {importError.kind === "json"
                  ? "Invalid JSON"
                  : importError.kind === "schema"
                    ? "Unsupported canary format"
                    : importError.kind === "empty"
                      ? "Nothing to import"
                      : "Unsupported file"}
              </div>
              <div className="mt-1 text-muted-foreground">
                {importError.message}
                {importError.line !== undefined && (
                  <>
                    {" "}
                    <span data-testid="import-error-location">
                      (line {importError.line}, column {importError.column ?? "?"})
                    </span>
                  </>
                )}
              </div>
              {importError.expectedFields && importError.expectedFields.length > 0 && (
                <div className="mt-1 text-muted-foreground">
                  Expected top-level fields: <code>{importError.expectedFields.join(", ")}</code>
                </div>
              )}
              <div className="mt-1 text-muted-foreground">
                Your input was preserved above so you can fix it and retry.
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
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
              Load from OutFile (.txt / .json)
            </Button>
            <Button
              variant="secondary"
              onClick={handleImport}
              disabled={!paste.trim()}
              data-testid="import-redacted-output"
            >
              Import redacted output
            </Button>
            <Button variant="ghost" onClick={clearImport} data-testid="clear-import">
              Clear import
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

      <ResultsDashboard
        preflight={preflight}
        report={report}
        verdict={verdict}
        onDownloadJson={downloadVerdictJson}
        onDownloadCsv={downloadVerdictCsv}
        onCopyJson={copyVerdictJson}
        copyDisabled={!verdictAvailable}
      />

      {/* Verification Summary cards (each supports drill-down) */}
      <section aria-label="Verification Summary" className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {verdict.cards.map((c) => (
          <EvidenceCard
            key={c.key}
            card={c}
            drill={buildDrillDown(c, report)}
            autoOpenAndScroll={c.status === "fail"}
          />
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
