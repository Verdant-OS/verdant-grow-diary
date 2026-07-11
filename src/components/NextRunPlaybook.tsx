/**
 * NextRunPlaybook — grower-approved playbook derived only from explicit
 * learning decisions. No automatic promotion (improved→repeat,
 * worsened→avoid never happens here — see nextRunPlaybookRules.ts).
 */
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { actionDetailPath } from "@/lib/routes";
import {
  groupPlaybookItemsByCategory,
  type NextRunPlaybook as Playbook,
  type PlaybookItem,
} from "@/lib/nextRunPlaybookRules";
import {
  playbookItemPlantTentLabel,
  playbookItemRecordedLabel,
} from "@/lib/nextRunPlaybookViewModel";

export interface NextRunPlaybookProps {
  readonly playbook: Playbook;
}

export function NextRunPlaybook({ playbook }: NextRunPlaybookProps) {
  if (playbook.isEmpty) {
    return (
      <section aria-labelledby="next-run-playbook-heading" className="glass rounded-2xl p-4">
        <h2 id="next-run-playbook-heading" className="text-lg font-semibold">
          Next Run Playbook
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No grower-confirmed lessons yet. Record outcomes and next-run decisions to build your
          playbook.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="next-run-playbook-heading" className="glass rounded-2xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="next-run-playbook-heading" className="text-lg font-semibold">
          Next Run Playbook
        </h2>
        <p className="text-xs text-muted-foreground">
          {playbook.totalDecided} decided · {playbook.totalUnresolved} unresolved
        </p>
      </div>

      {playbook.groups.map((group) => (
        <div key={group.section}>
          <h3 className="text-sm font-medium text-muted-foreground">
            {group.label} ({group.items.length})
          </h3>
          <div className="mt-2 space-y-3">
            {groupPlaybookItemsByCategory(group.items).map((catGroup) => (
              <div key={catGroup.category}>
                <h4 className="text-xs font-semibold text-muted-foreground">{catGroup.label}</h4>
                <ul className="mt-1 grid grid-cols-1 gap-2">
                  {catGroup.items.map((item) => (
                    <PlaybookItemRow key={item.episodeKey} item={item} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        Verdant never assumes an improved result means repeat, or a worsened result means avoid —
        you chose each decision on its own episode.
      </p>
    </section>
  );
}

function PlaybookItemRow({ item }: { item: PlaybookItem }) {
  return (
    <li className="rounded-xl border border-border p-3 space-y-1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium break-words">{item.actionSummary}</p>
        <Badge variant="secondary">{item.outcomeLabel}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{playbookItemPlantTentLabel(item)}</p>
      {item.rationale ? <p className="text-sm">{item.rationale}</p> : null}
      <p className="text-xs text-muted-foreground">{item.evidence.label}</p>
      <p className="text-xs text-muted-foreground">{item.uncertaintyNote}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Recorded {playbookItemRecordedLabel(item)}
        </span>
        <Link
          to={actionDetailPath(item.actionQueueId)}
          className="text-xs text-primary underline underline-offset-2"
        >
          View episode
        </Link>
      </div>
    </li>
  );
}
