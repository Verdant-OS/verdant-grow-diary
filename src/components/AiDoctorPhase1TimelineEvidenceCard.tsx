import { Link } from "react-router-dom";
import type { AiDoctorPhase1TimelineEvidenceViewModel } from "@/lib/aiDoctorPhase1TimelineEvidenceViewModel";
import { AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES } from "@/lib/aiDoctorPhase1A11yClassNames";

export interface AiDoctorPhase1TimelineEvidenceCardProps {
  viewModel: AiDoctorPhase1TimelineEvidenceViewModel;
}

export function AiDoctorPhase1TimelineEvidenceCard({
  viewModel,
}: AiDoctorPhase1TimelineEvidenceCardProps) {
  const {
    title,
    badges,
    summary,
    likelyIssue,
    confidence,
    riskLevel,
    evidenceCount,
    missingInformationCount,
    occurredAt,
    savedAtLabel,
    metadataLine,
    disclaimer,
    link,
  } = viewModel;

  return (
    <article
      data-testid="ai-doctor-phase1-timeline-evidence-card"
      className="rounded-lg border border-border bg-card text-card-foreground p-4 space-y-3"
      aria-label={title}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold leading-tight">{title}</h3>
        {badges.map((badge) => (
          <span
            key={badge}
            className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          >
            {badge}
          </span>
        ))}
      </header>

      {metadataLine && occurredAt && savedAtLabel && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="ai-doctor-phase1-timeline-evidence-card-metadata"
        >
          <span className="font-medium text-foreground">Read-only evidence</span>
          {" · "}
          <span>
            Saved date: <time dateTime={occurredAt}>{savedAtLabel}</time>
          </span>
        </p>
      )}

      <p className="text-sm text-foreground">{summary}</p>

      {(likelyIssue || confidence || riskLevel) && (
        <dl className="grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-3">
          {likelyIssue && (
            <div>
              <dt className="font-medium text-foreground">Likely issue</dt>
              <dd>{likelyIssue}</dd>
            </div>
          )}
          {confidence && (
            <div>
              <dt className="font-medium text-foreground">Confidence</dt>
              <dd>{confidence}</dd>
            </div>
          )}
          {riskLevel && (
            <div>
              <dt className="font-medium text-foreground">Risk</dt>
              <dd>{riskLevel}</dd>
            </div>
          )}
        </dl>
      )}

      <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <li data-testid="ai-doctor-phase1-timeline-evidence-card-evidence-count">
          Evidence items: {evidenceCount}
        </li>
        <li data-testid="ai-doctor-phase1-timeline-evidence-card-missing-count">
          Missing context: {missingInformationCount}
        </li>
        {occurredAt && (
          <li data-testid="ai-doctor-phase1-timeline-evidence-card-occurred-at">
            Saved: <time dateTime={occurredAt}>{occurredAt}</time>
          </li>
        )}
      </ul>

      <p className="text-xs text-muted-foreground italic">{disclaimer}</p>

      <div className="pt-1">
        <Link
          to={link.href}
          aria-label="Review AI Doctor Phase 1 results for this saved evidence"
          data-testid="ai-doctor-phase1-timeline-evidence-card-review-link"
          className={`inline-flex min-h-10 items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted ${AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES}`}
        >
          Review AI Doctor Phase 1 results
        </Link>
      </div>
    </article>
  );
}

export default AiDoctorPhase1TimelineEvidenceCard;
