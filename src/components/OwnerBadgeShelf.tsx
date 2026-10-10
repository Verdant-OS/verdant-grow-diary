import { ownerBadgeShelfEnabled } from "@/lib/badgeAwardFlags";
import { selectVisibleOwnerBadgeAwards, type OwnerBadgeAwardView } from "@/lib/badgeAwardRules";
import { BADGE_AWARD_COPY } from "@/constants/badgeAwardCopy";
import { useOwnerBadgeAwards } from "@/hooks/useOwnerBadgeAwards";

export function OwnerBadgeShelf({
  enabled = ownerBadgeShelfEnabled,
  awards,
}: {
  enabled?: boolean;
  awards: readonly OwnerBadgeAwardView[];
}) {
  if (!enabled) return null;
  const visible = selectVisibleOwnerBadgeAwards(awards);
  if (visible.length === 0) return null;

  return (
    <section data-testid="owner-badge-shelf" aria-label={BADGE_AWARD_COPY.shelfLabel}>
      <h2 className="text-sm font-medium">{BADGE_AWARD_COPY.shelfLabel}</h2>
      <p className="text-sm text-muted-foreground mt-2" data-testid="owner-badge-first-diary-entry">
        {BADGE_AWARD_COPY.firstDiaryEntry}
      </p>
    </section>
  );
}

function OwnerBadgeShelfQuery() {
  const query = useOwnerBadgeAwards();
  return <OwnerBadgeShelf enabled awards={query.data ?? []} />;
}

/** Renders nothing while the display flag is off, and does not call the evaluator. */
export function OwnerBadgeShelfMount() {
  if (!ownerBadgeShelfEnabled) return null;
  return <OwnerBadgeShelfQuery />;
}
