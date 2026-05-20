import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { actionsPath, growDetailPath } from "@/lib/routes";

export interface GrowBreadcrumbsProps {
  growId?: string | null;
  growName?: string | null;
  current: string;
  actionId?: string | null;
}

/**
 * Shared breadcrumb trail for grow-scoped pages.
 *
 * Renders:
 *   Grows → {Grow Name | "This Grow"} → {current}
 *
 * When `actionId` is provided, inserts an "Actions" segment before the current
 * page (intended for the Action Detail view):
 *   Grows → Grow → Actions → {current}
 *
 * Falls back to a single current-page crumb when no growId is supplied.
 *
 * Pure presentation. No writes, no device control, no privileged access.
 */
export default function GrowBreadcrumbs({
  growId,
  growName,
  current,
  actionId,
}: GrowBreadcrumbsProps) {
  const hasGrow = !!growId;
  const growLabel = growName ?? "This Grow";

  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-3 flex items-center gap-1 text-xs text-muted-foreground flex-wrap"
      data-testid="grow-breadcrumbs"
    >
      {hasGrow ? (
        <>
          <Crumb to="/grows">Grows</Crumb>
          <Sep />
          <Crumb to={growDetailPath(growId!)}>{growLabel}</Crumb>
          {actionId && (
            <>
              <Sep />
              <Crumb to={actionsPath(growId!)}>Actions</Crumb>
            </>
          )}
          <Sep />
          <span className="text-foreground font-medium" aria-current="page">
            {current}
          </span>
        </>
      ) : (
        <span className="text-foreground font-medium" aria-current="page">
          {current}
        </span>
      )}
    </nav>
  );
}

function Crumb({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="hover:text-foreground transition-colors">
      {children}
    </Link>
  );
}

function Sep() {
  return <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />;
}
