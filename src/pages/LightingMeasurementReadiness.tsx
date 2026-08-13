/**
 * Operator UI: lighting launch measurement readiness.
 * Two launch-page technical readouts, GA4/GSC verified stamps (UTC + Chicago),
 * PDF export, sticky mobile Ready/Blocked summary.
 */
import { useCallback, useMemo, useState } from "react";
import { Download, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildMeasurementReadinessModel,
  type ReadinessStatus,
  type TechnicalCheck,
} from "@/lib/seoLightingMeasurementReadinessRules";
import {
  buildReadinessReportPdf,
  readinessReportFilename,
} from "@/lib/seoLightingMeasurementReadinessPdf";
import {
  GA4_VERIFIED_AT_KEY,
  GSC_VERIFIED_AT_KEY,
  clearVerifiedAt,
  readVerifiedAt,
  writeVerifiedAt,
} from "@/lib/seoLightingMeasurementReadinessStorage";

function statusVariant(
  status: ReadinessStatus,
): "default" | "destructive" | "secondary" | "outline" {
  if (status === "PASS") return "default";
  if (status === "FAIL") return "destructive";
  if (status === "BLOCKED") return "destructive";
  return "secondary";
}

function StatusBadge({ status }: { status: ReadinessStatus }) {
  return (
    <Badge
      variant={statusVariant(status)}
      className="font-mono text-[10px] uppercase tracking-wide"
    >
      {status}
    </Badge>
  );
}

function TechnicalCheckRow({ check }: { check: TechnicalCheck }) {
  const showDetail = check.status === "FAIL" || check.status === "BLOCKED";
  return (
    <li
      className="rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm"
      data-testid={`tech-check-${check.id}`}
      data-status={check.status}
      data-error-type={check.errorType}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-foreground">{check.label}</span>
        <StatusBadge status={check.status} />
      </div>
      {showDetail ? (
        <div className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground/80">Error type: </span>
            <code className="font-mono">{check.errorType}</code>
          </p>
          {check.explanation ? <p>{check.explanation}</p> : null}
          {check.canonical ? (
            <p data-testid={`canonical-${check.id}`}>
              <span className="font-semibold text-foreground/80">Canonical: </span>
              match={String(check.canonical.match)} · expected{" "}
              <code className="break-all font-mono text-[11px]">{check.canonical.expected}</code>
              {check.canonical.observed != null ? (
                <>
                  {" "}
                  · observed{" "}
                  <code className="break-all font-mono text-[11px]">
                    {check.canonical.observed}
                  </code>
                </>
              ) : (
                " · observed (missing)"
              )}
            </p>
          ) : null}
          {check.sitemap ? (
            <p data-testid={`sitemap-${check.id}`}>
              <span className="font-semibold text-foreground/80">Sitemap inclusion: </span>
              {check.sitemap.included ? "included" : "not included"} · {check.sitemap.occurrences}{" "}
              occurrence(s) · {check.sitemap.detail}
            </p>
          ) : null}
        </div>
      ) : check.sitemap || check.canonical ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {check.canonical ? (
            <p data-testid={`canonical-${check.id}`}>Canonical match · {check.canonical.detail}</p>
          ) : null}
          {check.sitemap ? (
            <p data-testid={`sitemap-${check.id}`}>
              Sitemap: {check.sitemap.occurrences}× · {check.sitemap.detail}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default function LightingMeasurementReadiness() {
  const [ga4Iso, setGa4Iso] = useState<string | null>(() => readVerifiedAt(GA4_VERIFIED_AT_KEY));
  const [gscIso, setGscIso] = useState<string | null>(() => readVerifiedAt(GSC_VERIFIED_AT_KEY));
  const [exportError, setExportError] = useState<string | null>(null);

  const model = useMemo(
    () =>
      buildMeasurementReadinessModel({
        ga4VerifiedAtIso: ga4Iso,
        gscVerifiedAtIso: gscIso,
      }),
    [ga4Iso, gscIso],
  );

  const markGa4 = useCallback(() => {
    const iso = new Date().toISOString();
    writeVerifiedAt(GA4_VERIFIED_AT_KEY, iso);
    setGa4Iso(iso);
  }, []);

  const markGsc = useCallback(() => {
    const iso = new Date().toISOString();
    writeVerifiedAt(GSC_VERIFIED_AT_KEY, iso);
    setGscIso(iso);
  }, []);

  const clearGa4 = useCallback(() => {
    clearVerifiedAt(GA4_VERIFIED_AT_KEY);
    setGa4Iso(null);
  }, []);

  const clearGsc = useCallback(() => {
    clearVerifiedAt(GSC_VERIFIED_AT_KEY);
    setGscIso(null);
  }, []);

  const exportPdf = useCallback(() => {
    setExportError(null);
    try {
      const bytes = buildReadinessReportPdf(model);
      const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = readinessReportFilename();
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    }
  }, [model]);

  const ready = model.summary.overall === "Ready";

  return (
    <main
      className="mx-auto w-full max-w-3xl space-y-5 px-3 pb-28 pt-6 sm:px-4 sm:pb-10"
      data-testid="lighting-measurement-readiness"
    >
      {/* Sticky mobile summary */}
      <div
        className="sticky top-0 z-30 -mx-3 border-b border-border/70 bg-background/95 px-3 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:static sm:mx-0 sm:rounded-2xl sm:border sm:px-4 sm:shadow-card"
        data-testid="readiness-sticky-summary"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Measurement readiness
            </p>
            <p
              className={`truncate font-display text-base font-semibold sm:text-lg ${
                ready ? "text-primary" : "text-destructive"
              }`}
              data-testid="readiness-overall-label"
            >
              {ready ? "Ready" : "Blocked"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{model.summary.headline}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {ready ? (
              <CheckCircle2 className="size-8 text-primary" aria-hidden />
            ) : (
              <XCircle className="size-8 text-destructive" aria-hidden />
            )}
            <p className="font-mono text-[10px] text-muted-foreground">
              P{model.summary.readyCount} F{model.summary.failCount} B{model.summary.blockedCount}
            </p>
          </div>
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-snug text-muted-foreground">
          Next: {model.summary.nextAction}
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            size="sm"
            className="min-h-11 flex-1 touch-manipulation sm:min-h-9 sm:flex-none"
            onClick={exportPdf}
            data-testid="export-readiness-report"
          >
            <Download className="size-4" data-icon="inline-start" />
            Export readiness report
          </Button>
        </div>
        {exportError ? (
          <p className="mt-2 text-xs text-destructive" role="alert">
            Export failed: {exportError}
          </p>
        ) : null}
      </div>

      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Lighting measurement readiness
        </h1>
        <p className="text-sm text-muted-foreground">
          Operator checklist for the two lighting launch guides. Snapshot{" "}
          <time dateTime={model.snapshotGeneratedAt}>{model.snapshotGeneratedAt}</time> ·{" "}
          {model.snapshotGeneratedAtChicago}. No credentials are stored here.
        </p>
        <p className="text-xs text-muted-foreground">
          Verdict: <span className="font-medium text-foreground">{model.verdict}</span>
        </p>
      </header>

      {/* GA4 / GSC gates with verified stamps */}
      <section className="grid gap-3 sm:grid-cols-2" aria-label="GA4 and Search Console gates">
        {(
          [
            {
              gate: model.ga4,
              stamp: model.ga4Verification,
              mark: markGa4,
              clear: clearGa4,
              testId: "ga4-gate",
            },
            {
              gate: model.gsc,
              stamp: model.gscVerification,
              mark: markGsc,
              clear: clearGsc,
              testId: "gsc-gate",
            },
          ] as const
        ).map(({ gate, stamp, mark, clear, testId }) => (
          <Card key={gate.id} data-testid={testId}>
            <CardHeader className="space-y-2 pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{gate.label}</CardTitle>
                <StatusBadge status={gate.status} />
              </div>
              <CardDescription className="text-xs leading-relaxed">
                <span className="font-semibold text-foreground/80">Error type: </span>
                <code className="font-mono">{gate.errorType}</code>
                <br />
                {gate.explanation}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <p className="leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground/80">Owner action: </span>
                {gate.ownerAction}
              </p>
              <div
                className="rounded-lg border border-dashed border-border/70 bg-muted/30 p-2"
                data-testid={`${testId}-timestamps`}
              >
                <p className="font-semibold text-foreground">Verified audit stamps</p>
                <p>
                  UTC:{" "}
                  <time dateTime={stamp.verifiedAtIso ?? undefined}>
                    {stamp.verifiedAtUtc ?? "— not marked —"}
                  </time>
                </p>
                <p>
                  America/Chicago: <span>{stamp.verifiedAtChicago ?? "— not marked —"}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11 touch-manipulation sm:min-h-9"
                  onClick={mark}
                  data-testid={`${testId}-mark-verified`}
                >
                  Mark {gate.label} Verified
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 touch-manipulation sm:min-h-9"
                  onClick={clear}
                  disabled={!stamp.verifiedAtIso}
                  data-testid={`${testId}-clear-verified`}
                >
                  <RefreshCw className="size-3.5" data-icon="inline-start" />
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Two launch pages technical readout */}
      <section className="space-y-3" aria-label="Launch page technical readouts">
        <h2 className="font-display text-lg font-semibold">Launch page technical readout</h2>
        {model.launchPages.map((page) => (
          <Card key={page.id} data-testid={`launch-page-${page.id}`}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base break-words">{page.path}</CardTitle>
                  <CardDescription className="mt-1 text-xs">{page.title}</CardDescription>
                </div>
                <StatusBadge status={page.overallStatus} />
              </div>
              {page.blockers.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-destructive">
                  {page.blockers.map((b) => (
                    <li key={b.slice(0, 48)}>{b}</li>
                  ))}
                </ul>
              ) : null}
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {page.checks.map((c) => (
                  <TechnicalCheckRow key={c.id} check={c} />
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Checklist */}
      <Card data-testid="readiness-checklist">
        <CardHeader>
          <CardTitle className="text-base">Measurement-readiness checklist</CardTitle>
          <CardDescription className="text-xs">
            Day 0 remains {model.day0Status}; four-week clock {model.fourWeekClock}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {model.checklist.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2 text-sm"
              >
                <span>{item.label}</span>
                <StatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
