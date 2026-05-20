import { Link } from "react-router-dom";

export type ScopedGrowLabel = "plants" | "tents" | "logs" | "timeline" | "actions";

interface ScopedGrowBannerProps {
  growId?: string | null;
  growName?: string | null;
  label: ScopedGrowLabel;
  clearHref: string;
  backHref?: string;
}

/**
 * Shared scoped grow context banner.
 *
 * - Renders nothing when no growId is present.
 * - Shows "Showing {label} for {growName}" when a grow name is resolved.
 * - Falls back to "Showing {label} for this grow" when growId is set but the name
 *   is missing (e.g. growId is unknown / not in the user's loaded grows).
 * - "Back to Grow" link is only rendered when backHref is provided.
 * - "Clear grow filter" link is always rendered when growId is present.
 *
 * Read-only UI. No writes, no device control, no privileged access.
 */
export default function ScopedGrowBanner({
  growId,
  growName,
  label,
  clearHref,
  backHref,
}: ScopedGrowBannerProps) {
  if (!growId) return null;
  return (
    <div
      className="glass rounded-2xl px-4 py-2 mb-4 flex items-center justify-between text-xs gap-2 flex-wrap"
      aria-label="Grow filter banner"
    >
      {growName ? (
        <span className="text-muted-foreground">
          Showing {label} for <span className="text-foreground font-medium">{growName}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">Showing {label} for this grow</span>
      )}
      <span className="flex items-center gap-3">
        {backHref && (
          <Link to={backHref} className="text-primary hover:underline">
            Back to Grow
          </Link>
        )}
        <Link to={clearHref} className="text-primary hover:underline">
          Clear grow filter
        </Link>
      </span>
    </div>
  );
}
