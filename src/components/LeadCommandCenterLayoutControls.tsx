import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  defaultLeadCommandCenterLayout,
  loadLeadCommandCenterLayout,
  saveLeadCommandCenterLayout,
  toggleSectionCollapsed,
  type LeadCommandCenterLayout,
  type LeadCommandCenterSectionId,
} from "@/lib/leadCommandCenterLayoutRules";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useLeadCommandCenterLayout() {
  const [layout, setLayout] = useState<LeadCommandCenterLayout>(() =>
    defaultLeadCommandCenterLayout(),
  );

  useEffect(() => {
    setLayout(loadLeadCommandCenterLayout(getStorage()));
  }, []);

  const toggle = useCallback((id: LeadCommandCenterSectionId) => {
    setLayout((prev) => {
      const next = toggleSectionCollapsed(prev, id);
      saveLeadCommandCenterLayout(next, getStorage());
      return next;
    });
  }, []);

  const isCollapsed = useCallback(
    (id: LeadCommandCenterSectionId) =>
      layout.sections.find((s) => s.id === id)?.collapsed === true,
    [layout],
  );

  const ordered = useMemo(
    () => [...layout.sections].sort((a, b) => a.order - b.order),
    [layout],
  );

  return { layout, ordered, toggle, isCollapsed };
}

export interface LeadCommandCenterSectionShellProps {
  id: LeadCommandCenterSectionId;
  label: string;
  collapsed: boolean;
  onToggle: (id: LeadCommandCenterSectionId) => void;
  children: React.ReactNode;
}

/**
 * Presenter that wraps a command-center section with an accessible
 * collapse/expand control. Read-only — never touches lead data.
 */
export function LeadCommandCenterSection({
  id,
  label,
  collapsed,
  onToggle,
  children,
}: LeadCommandCenterSectionShellProps) {
  const panelId = `lcc-section-${id}`;
  return (
    <section data-testid="lcc-section" data-section-id={id}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onToggle(id)}
          aria-expanded={!collapsed}
          aria-controls={panelId}
          data-testid="lcc-section-toggle"
          className="gap-1 px-2"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden />
          )}
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className="sr-only">
            {collapsed ? "Expand" : "Collapse"} {label}
          </span>
        </Button>
      </div>
      {!collapsed && <div id={panelId}>{children}</div>}
    </section>
  );
}

export default LeadCommandCenterSection;
