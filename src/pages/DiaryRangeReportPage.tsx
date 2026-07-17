/**
 * DiaryRangeReportPage — one-tap date-range diary report (Print / Save PDF).
 *
 * Structure mirrors EnvironmentSummaryReportPage (the canonical premium
 * report page):
 *  - Client entitlement hint (`advancedExports`) prevents a content
 *    flash while the authoritative server gate decides.
 *  - Server gate: `premium-export-entitlement` with the
 *    `diary_range_report` feature. Fail-closed — any error denies.
 *  - In-page printing: document.title swap + window.print(); visibility
 *    is controlled by the global print stylesheet keyed on
 *    data-print-section="diary-range-report". Photos render as real
 *    <img> nodes so they print.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGrows } from "@/store/grows";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import {
  checkPremiumExportEntitlement,
} from "@/hooks/usePremiumExportServerGate";
import PaywallCta from "@/components/PaywallCta";
import { buildPaywallCtaViewModel } from "@/lib/paywallCtaViewModel";
import { useDiaryRangeReportData } from "@/hooks/useDiaryRangeReportData";
import {
  buildDiaryRangeReport,
  DIARY_RANGE_ENVIRONMENT_EMPTY_COPY,
  DIARY_RANGE_FEEDING_EMPTY_COPY,
  DIARY_RANGE_HARVEST_EMPTY_COPY,
  DIARY_RANGE_PHOTOS_EMPTY_COPY,
  DIARY_RANGE_SAFETY_COPY,
  DIARY_RANGE_SOURCE_HONESTY_COPY,
  DIARY_RANGE_TRAINING_EMPTY_COPY,
  DIARY_RANGE_WATERING_EMPTY_COPY,
} from "@/lib/diaryRangeReportRules";
import {
  defaultDiaryRangeReportRange,
  isValidDiaryRangeReportRange,
} from "@/lib/diaryRangeReportNavigationRules";

type ServerGateStatus = "loading" | "allowed" | "denied" | "error";

const PRINT_HELPER_COPY = "Use your browser print dialog to save this report as PDF.";

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "grow" : slug;
}

export default function DiaryRangeReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeGrowId: storeGrowId } = useGrows();

  const urlGrowId = searchParams.get("growId");
  const growId = urlGrowId ?? storeGrowId ?? null;

  const fallbackRange = useMemo(() => defaultDiaryRangeReportRange(), []);
  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const rangeFromUrl = isValidDiaryRangeReportRange(urlStart, urlEnd);
  const startDate = rangeFromUrl ? (urlStart as string) : fallbackRange.startDate;
  const endDate = rangeFromUrl ? (urlEnd as string) : fallbackRange.endDate;

  // Draft inputs for the range controls (applied via button → URL).
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const draftValid = isValidDiaryRangeReportRange(draftStart, draftEnd);

  function applyRange() {
    if (!draftValid) return;
    const next = new URLSearchParams(searchParams);
    next.set("start", draftStart);
    next.set("end", draftEnd);
    setSearchParams(next, { replace: true });
  }

  // Client hint — presentation-only; the server decision is the gate.
  const { entitlement, loading: entitlementLoading } = useMyEntitlements();
  const clientIsPremium = entitlement.capabilities.advancedExports === true;

  // Authoritative server gate. Fail-closed.
  const [serverGate, setServerGate] = useState<{
    status: ServerGateStatus;
    reason: string | null;
  }>({ status: "loading", reason: null });
  useEffect(() => {
    let cancelled = false;
    if (!growId) {
      setServerGate({ status: "loading", reason: null });
      return;
    }
    setServerGate({ status: "loading", reason: null });
    checkPremiumExportEntitlement("diary_range_report", {
      growId,
      startDate,
      endDate,
    }).then((res) => {
      if (cancelled) return;
      if (res.ok) setServerGate({ status: "allowed", reason: null });
      else if (res.state === "network_error") setServerGate({ status: "error", reason: res.reason });
      else setServerGate({ status: "denied", reason: res.reason });
    });
    return () => {
      cancelled = true;
    };
  }, [growId, startDate, endDate]);

  const gateAllowed = serverGate.status === "allowed";
  const { status: dataStatus, data, error } = useDiaryRangeReportData(
    gateAllowed ? growId : null,
    gateAllowed ? startDate : null,
    gateAllowed ? endDate : null,
  );

  const vm = useMemo(() => {
    if (!data || dataStatus !== "ready") return null;
    return buildDiaryRangeReport({
      grow: data.grow,
      diaryEntries: data.diaryEntries,
      growEvents: data.growEvents,
      harvests: data.harvests,
      sensorReadings: data.sensorReadings,
      startDate,
      endDate,
      now: new Date(),
    });
  }, [data, dataStatus, startDate, endDate]);

  function triggerPrint() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const name = vm ? vm.header.growName : "grow";
    const filename = `verdant-diary-report-${slugify(name)}-${startDate}-to-${endDate}`;
    const prevTitle = document.title;
    document.title = filename;
    try {
      window.print();
    } finally {
      setTimeout(() => {
        document.title = prevTitle;
      }, 0);
    }
  }

  if (!growId) {
    return (
      <div className="max-w-2xl mx-auto py-10 text-center" data-testid="diary-range-report-no-grow">
        <h1 className="font-display text-xl font-semibold mb-2">Date-range diary report</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Pick a grow first — the report covers one grow at a time.
        </p>
        <Button asChild variant="outline">
          <Link to="/timeline">Open the timeline</Link>
        </Button>
      </div>
    );
  }

  const serverDecided =
    serverGate.status === "allowed" ||
    serverGate.status === "denied" ||
    serverGate.status === "error";
  const showLocked = serverDecided
    ? serverGate.status !== "allowed"
    : // While the server is deciding, use the non-authoritative client
      // hint to avoid a flash of report content for free users.
      !entitlementLoading && !clientIsPremium;

  if (showLocked) {
    const paywallVm = buildPaywallCtaViewModel({
      featureTitle: "Unlock date-range diary reports",
      requiredPlanLabel: "Pro",
    });
    return (
      <div
        className="max-w-2xl mx-auto py-8"
        data-testid="diary-range-report-page-locked"
        data-server-gate-status={serverGate.status}
      >
        <h1 className="font-display text-xl font-semibold mb-2">Date-range diary report</h1>
        <p
          className="text-sm text-muted-foreground mb-4"
          data-testid="diary-range-report-server-gate-message"
        >
          {serverGate.status === "error"
            ? "The report entitlement check did not complete. Nothing was generated."
            : "Date-range diary reports are a Pro feature."}
        </p>
        <PaywallCta vm={paywallVm} data-testid="diary-range-report-paywall" />
      </div>
    );
  }

  if (serverGate.status === "loading" || dataStatus === "loading" || dataStatus === "idle") {
    return (
      <div
        className="py-20 flex justify-center text-muted-foreground"
        data-testid="diary-range-report-page-loading"
      >
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (dataStatus === "unavailable" || !vm) {
    return (
      <div className="max-w-2xl mx-auto py-10 text-center" data-testid="diary-range-report-error">
        <h1 className="font-display text-xl font-semibold mb-2">Date-range diary report</h1>
        <p className="text-sm text-muted-foreground">
          {error ?? "Unable to load diary report data."}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto" data-testid="diary-range-report-page">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 print-hidden">
        <div>
          <h1 className="font-display text-xl font-semibold">Date-range diary report</h1>
          <p className="text-sm text-muted-foreground">{PRINT_HELPER_COPY}</p>
        </div>
        <Button onClick={triggerPrint} data-testid="diary-range-report-print">
          <Printer className="h-4 w-4 mr-1" /> Print / Save PDF
        </Button>
      </div>

      <div
        className="flex flex-wrap items-center gap-2 mb-4 print-hidden"
        data-testid="diary-range-report-range-controls"
      >
        <input
          type="date"
          value={draftStart}
          onChange={(e) => setDraftStart(e.target.value)}
          aria-label="Report start date"
          data-testid="diary-range-report-start-date"
          className="rounded-md border border-border/50 bg-background/60 px-2 py-1 text-sm"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={draftEnd}
          onChange={(e) => setDraftEnd(e.target.value)}
          aria-label="Report end date"
          data-testid="diary-range-report-end-date"
          className="rounded-md border border-border/50 bg-background/60 px-2 py-1 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={applyRange}
          disabled={!draftValid}
          data-testid="diary-range-report-apply-range"
        >
          Apply range
        </Button>
        {!draftValid && (
          <p className="text-xs text-destructive" data-testid="diary-range-report-range-error">
            Start date must be on or before end date.
          </p>
        )}
      </div>

      <div data-print-section="diary-range-report" className="space-y-4">
        <section
          className="glass rounded-2xl p-4"
          data-testid="diary-range-report-header"
          data-print-card
        >
          <h2 className="font-display text-lg font-semibold">{vm.header.growName}</h2>
          <p className="text-sm text-muted-foreground">
            {vm.header.rangeLabel} · generated {vm.header.generatedOn}
          </p>
          <p className="text-sm mt-1">
            {vm.header.totalInRange} logged {vm.header.totalInRange === 1 ? "entry" : "entries"} in
            this range.
            {vm.header.excludedNoTimestamp > 0 &&
              ` ${vm.header.excludedNoTimestamp} without a usable timestamp were left out.`}
          </p>
        </section>

        <section className="glass rounded-2xl p-4" data-testid="diary-range-report-watering" data-print-card>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Watering
          </h3>
          {vm.watering.count === 0 ? (
            <p className="text-sm text-muted-foreground">{DIARY_RANGE_WATERING_EMPTY_COPY}</p>
          ) : (
            <>
              <p className="text-sm">
                {vm.watering.count} {vm.watering.count === 1 ? "watering" : "waterings"}
                {vm.watering.totalMl !== null && ` · ${vm.watering.totalMl} ml logged in total`}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {vm.watering.entries.map((e, i) => (
                  <li key={`${e.dateLabel}-${i}`}>
                    {e.dateLabel}
                    {e.detailLabel ? ` — ${e.detailLabel}` : ""}
                  </li>
                ))}
              </ul>
              {vm.watering.moreCount > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  and {vm.watering.moreCount} more in this range.
                </p>
              )}
            </>
          )}
        </section>

        <section className="glass rounded-2xl p-4" data-testid="diary-range-report-feeding" data-print-card>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Feeding
          </h3>
          {vm.feeding.count === 0 ? (
            <p className="text-sm text-muted-foreground">{DIARY_RANGE_FEEDING_EMPTY_COPY}</p>
          ) : (
            <>
              <p className="text-sm">
                {vm.feeding.count} {vm.feeding.count === 1 ? "feeding" : "feedings"}
                {vm.feeding.phRange &&
                  ` · pH ${vm.feeding.phRange.min}–${vm.feeding.phRange.max}`}
                {vm.feeding.ecRange &&
                  ` · EC ${vm.feeding.ecRange.min}–${vm.feeding.ecRange.max}`}
              </p>
              {vm.feeding.nutrients.length > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Nutrients logged: {vm.feeding.nutrients.join(", ")}
                </p>
              )}
              {vm.feeding.moreCount > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  and {vm.feeding.moreCount} more in this range.
                </p>
              )}
            </>
          )}
        </section>

        <section className="glass rounded-2xl p-4" data-testid="diary-range-report-training" data-print-card>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Training
          </h3>
          {vm.training.count === 0 ? (
            <p className="text-sm text-muted-foreground">{DIARY_RANGE_TRAINING_EMPTY_COPY}</p>
          ) : (
            <>
              <p className="text-sm">
                {vm.training.count} training {vm.training.count === 1 ? "entry" : "entries"}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {vm.training.byType.map((t) => (
                  <li key={t.token}>
                    {t.token} × {t.count}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section
          className="glass rounded-2xl p-4"
          data-testid="diary-range-report-environment"
          data-print-card
        >
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Environment
          </h3>
          {vm.environment.readingCount === 0 ? (
            <p className="text-sm text-muted-foreground">{DIARY_RANGE_ENVIRONMENT_EMPTY_COPY}</p>
          ) : (
            <>
              <ul className="space-y-1 text-sm">
                {vm.environment.metrics
                  .filter((m) => m.count > 0)
                  .map((m) => (
                    <li key={m.key}>
                      {m.label}: avg {m.avg} {m.unit} (min {m.min}, max {m.max}, {m.count}{" "}
                      readings)
                    </li>
                  ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Sources:{" "}
                {vm.environment.sources
                  .map((s) => `${s.label} × ${s.count}`)
                  .join(", ")}
              </p>
            </>
          )}
        </section>

        <section className="glass rounded-2xl p-4" data-testid="diary-range-report-photos" data-print-card>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Photos
          </h3>
          {vm.photos.totalCount === 0 ? (
            <p className="text-sm text-muted-foreground">{DIARY_RANGE_PHOTOS_EMPTY_COPY}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {vm.photos.items.map((p) => (
                  <figure key={p.id}>
                    <img
                      src={p.url}
                      alt={p.alt}
                      loading="lazy"
                      className="w-full aspect-square object-cover rounded-lg"
                    />
                    <figcaption className="text-[11px] text-muted-foreground mt-0.5">
                      {p.dateLabel}
                    </figcaption>
                  </figure>
                ))}
              </div>
              {vm.photos.moreCount > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  and {vm.photos.moreCount} more photos logged in this range.
                </p>
              )}
            </>
          )}
        </section>

        <section className="glass rounded-2xl p-4" data-testid="diary-range-report-harvest" data-print-card>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Harvest outcomes
          </h3>
          {vm.harvest.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{DIARY_RANGE_HARVEST_EMPTY_COPY}</p>
          ) : (
            <>
              <ul className="space-y-1 text-sm">
                {vm.harvest.entries.map((h, i) => (
                  <li key={`${h.dateLabel}-${i}`}>
                    {h.dateLabel}
                    {h.wetGrams !== null && ` · wet ${h.wetGrams} g`}
                    {h.dryGrams !== null && ` · dry ${h.dryGrams} g`}
                    {h.wetGrams === null && h.dryGrams === null && " · weight not logged"}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm">
                {vm.harvest.totalWetGrams !== null && `Total wet: ${vm.harvest.totalWetGrams} g. `}
                {vm.harvest.totalDryGrams !== null && `Total dry: ${vm.harvest.totalDryGrams} g.`}
              </p>
            </>
          )}
        </section>

        <footer
          className="text-xs text-muted-foreground space-y-1 pb-6"
          data-testid="diary-range-report-safety-footer"
        >
          <p>{DIARY_RANGE_SOURCE_HONESTY_COPY}</p>
          <p>{DIARY_RANGE_SAFETY_COPY}</p>
        </footer>
      </div>
    </div>
  );
}
