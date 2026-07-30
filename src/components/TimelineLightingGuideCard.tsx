/**
 * TimelineLightingGuideCard — presenter-only contextual education for a diary
 * entry that explicitly mentions lighting setup or stress evidence.
 *
 * No reads, writes, diagnosis, automation, or device control.
 */
import { Link } from "react-router-dom";
import type { TimelineLightingGuideView } from "@/lib/timelineLightingGuideRules";

export interface TimelineLightingGuideCardProps {
  readonly view: TimelineLightingGuideView;
}

export default function TimelineLightingGuideCard({ view }: TimelineLightingGuideCardProps) {
  return (
    <aside
      data-testid="timeline-lighting-guide-card"
      data-lighting-guide-kind={view.kind}
      aria-label={view.title}
      className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-amber-200">
        {view.eyebrow}
      </p>
      <h3 className="mt-1 text-sm font-semibold text-foreground">{view.title}</h3>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{view.summary}</p>

      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {view.comparisons.map((comparison) => (
          <div key={comparison.label} className="rounded-lg border border-border/50 p-3">
            <dt className="text-xs font-semibold text-foreground">{comparison.label}</dt>
            <dd className="mt-1 text-xs leading-5 text-muted-foreground">{comparison.evidence}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-xs font-semibold text-foreground">Log next</p>
      <ul className="mt-1 space-y-1 pl-4 text-xs leading-5 text-muted-foreground list-disc">
        {view.logNext.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <nav aria-label="Lighting guides" className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {view.links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
