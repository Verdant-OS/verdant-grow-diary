import { fastAddActionLabel, readFastAddParam } from "@/lib/fastAddActionRules";

export interface FastAddPendingBannerProps {
  /** Router search string, e.g. location.search or searchParams.toString(). */
  search: string | null | undefined;
  /** Which picker is rendering the banner. */
  target: "plant" | "tent";
}

/**
 * Calm banner shown on the plant/tent pickers when the grower arrived from
 * Quick Log with a pending action. Presenter only — reads the param through
 * pure rules, renders nothing when absent or unrecognised, and performs no
 * navigation, dispatch, or writes.
 */
export default function FastAddPendingBanner({ search, target }: FastAddPendingBannerProps) {
  const pending = readFastAddParam(search);
  const label = fastAddActionLabel(pending);
  if (!pending || !label) return null;

  return (
    <div
      data-testid="fast-add-pending-banner"
      className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
    >
      Choose a {target} to log <span className="font-medium text-foreground">{label}</span>.
    </div>
  );
}
