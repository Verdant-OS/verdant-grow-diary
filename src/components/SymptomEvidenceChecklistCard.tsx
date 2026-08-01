import { Link } from "react-router-dom";
import { SYMPTOM_NO_STACK_RULE } from "@/constants/cannabisSymptomReference";
import type { SymptomEvidenceChecklistView } from "@/lib/symptomEvidenceChecklistRules";

const STATUS_LABEL = {
  recorded: "Recorded",
  missing: "Not recorded",
  limited: "Limited history",
} as const;

export default function SymptomEvidenceChecklistCard({
  view,
}: {
  readonly view: SymptomEvidenceChecklistView;
}) {
  return (
    <aside
      aria-label={`Evidence checklist for ${view.symptomLabel}`}
      className="mt-3 rounded-lg border border-primary/25 bg-primary/[0.04] p-3"
      data-testid="symptom-evidence-checklist"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
        Symptom evidence check
      </p>
      <h3 className="mt-1 text-sm font-semibold">{view.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Visible sign: {view.symptomLabel}.{" "}
        {view.observationStageLabel
          ? `Confirmed stage: ${view.observationStageLabel}. `
          : "Stage was not recorded. "}
        {view.observationLocationLabel
          ? `Location: ${view.observationLocationLabel}. `
          : "Location was not recorded. "}
        Observed{" "}
        <time dateTime={view.observedAt}>{new Date(view.observedAt).toLocaleString()}</time>.{" "}
        {view.windowLabel}. This is recorded context, not a diagnosis.
      </p>
      {!view.historyComplete && (
        <p role="note" className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Some history is not loaded. Missing categories stay limited rather than being called
          empty.
        </p>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {view.categories.map((category) => (
          <section
            key={category.id}
            className="rounded-md border border-border/60 bg-background/70 p-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-xs font-semibold">{category.title}</h4>
              <span
                className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                data-evidence-status={category.status}
              >
                {STATUS_LABEL[category.status]}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{category.statusText}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {category.totalMatches} matching {category.totalMatches === 1 ? "record" : "records"}
            </p>
            <p className="mt-1 text-[11px] text-foreground/85">
              <span className="font-medium">What to verify next:</span> {category.verifyNext}
            </p>
            {category.items.length > 0 && (
              <ul className="mt-2 space-y-2">
                {category.items.map((item) => (
                  <li
                    key={`${category.id}-${item.id}`}
                    className="border-t border-border/50 pt-2 text-[11px]"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                      <time dateTime={item.occurredAt}>
                        {new Date(item.occurredAt).toLocaleString()}
                      </time>
                      <span>{item.sourceLabel}</span>
                      {item.timelineHref && (
                        <Link
                          className="font-medium text-primary underline underline-offset-2"
                          to={item.timelineHref}
                        >
                          View entry
                        </Link>
                      )}
                    </div>
                    <p className="mt-1 text-foreground/85">{item.summary}</p>
                    {item.detailLines.length > 0 && (
                      <ul className="mt-1 flex flex-wrap gap-x-3 text-muted-foreground">
                        {item.detailLines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{SYMPTOM_NO_STACK_RULE}</p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <Link to={view.guidePath} className="font-medium text-primary underline underline-offset-2">
          Review the symptom guide
        </Link>
        <Link to={view.hubPath} className="font-medium text-primary underline underline-offset-2">
          Open the symptom hub
        </Link>
      </div>
    </aside>
  );
}
