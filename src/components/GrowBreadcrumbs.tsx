import { Link, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useGrows } from "@/store/grows";
import {
  actionsPath,
  dashboardPath,
  growDetailPath,
  logsPath,
  plantsPath,
  tentsPath,
  timelinePath,
} from "@/lib/routes";

export type GrowBreadcrumbsSection =
  | "logs"
  | "timeline"
  | "plants"
  | "tents"
  | "actions"
  | "grow-detail"
  | "action-detail"
  | "dashboard";

export interface GrowBreadcrumbsProps {
  growId?: string | null;
  growName?: string | null;
  current: string;
  actionId?: string | null;
  /**
   * Optional section identifier. When provided AND the user has more than one
   * loaded grow, a small switcher dropdown is rendered next to the grow crumb.
   *
   * Selecting another grow navigates to the equivalent scoped route for the
   * current section. Action Detail intentionally routes to the scoped Actions
   * list for the new grow (the old detail id is unrelated to the new grow).
   */
  section?: GrowBreadcrumbsSection;
}

/**
 * Shared breadcrumb trail for grow-scoped pages.
 *
 *   Grows → {growName | "This Grow"} → {current}
 *
 * Optional `actionId` inserts an "Actions" segment before `current`.
 * Optional `section` enables the grow switcher dropdown.
 *
 * Pure presentation + client-side navigation. No writes, no device control,
 * no privileged access.
 */
export default function GrowBreadcrumbs({
  growId,
  growName,
  current,
  actionId,
  section,
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
          {section && <GrowSwitcher currentGrowId={growId} section={section} />}
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
        <>
          {section && <GrowSwitcher currentGrowId={null} section={section} />}
          <span className="text-foreground font-medium" aria-current="page">
            {current}
          </span>
        </>
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

/**
 * Build the destination route for switching to a new grow.
 * Action Detail intentionally routes to the scoped Actions list.
 */
export function buildSwitcherTarget(
  section: GrowBreadcrumbsSection,
  newGrowId: string,
): string {
  switch (section) {
    case "logs":
      return logsPath(newGrowId);
    case "timeline":
      return timelinePath(newGrowId);
    case "plants":
      return plantsPath(newGrowId);
    case "tents":
      return tentsPath(newGrowId);
    case "actions":
    case "action-detail":
      return actionsPath(newGrowId);
    case "grow-detail":
      return growDetailPath(newGrowId);
    case "dashboard":
      return dashboardPath(newGrowId);
  }
}

function GrowSwitcher({
  currentGrowId,
  section,
}: {
  currentGrowId: string | null;
  section: GrowBreadcrumbsSection;
}) {
  const { grows } = useGrows();
  const navigate = useNavigate();
  if (grows.length < 2) return null;

  return (
    <label className="inline-flex items-center" data-testid="grow-switcher">
      <span className="sr-only">Switch grow</span>
      <select
        aria-label="Switch grow"
        value={currentGrowId ?? ""}
        onChange={(e) => {
          const id = e.target.value;
          if (!id) return;
          navigate(buildSwitcherTarget(section, id));
        }}
        className="ml-1 h-6 rounded-md bg-secondary/50 border border-border/50 text-[11px] px-1 hover:bg-secondary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {!currentGrowId && (
          <option value="" disabled>
            Switch grow…
          </option>
        )}
        {grows.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}
