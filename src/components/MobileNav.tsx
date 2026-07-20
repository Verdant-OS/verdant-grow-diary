import { Link, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Box,
  NotebookText,
  ListChecks,
  Bell,
  MoreHorizontal,
  Sprout,
  Activity,
  Stethoscope,
  Settings,
  ClipboardCheck,
  LineChart,
  Users,
  Dna,
  GitFork,
  History,
  PlugZap,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useState } from "react";
import OperatorModeLink from "@/components/OperatorModeLink";
import { isNavigationItemActive, type NavigationActiveRule } from "@/lib/navigationActiveRules";
import {
  LABS_NAVIGATION_DESTINATIONS,
  type LabsNavigationDestinationId,
} from "@/lib/growerNavigationRules";

type PrimaryItem = MoreItem & NavigationActiveRule;

export const primary: PrimaryItem[] = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true, aliases: ["/dashboard"] },
  { to: "/tents", label: "Tents", icon: Box },
  { to: "/plants", label: "Plants", icon: Sprout },
  { to: "/timeline", label: "Timeline", icon: NotebookText },
  { to: "/alerts", label: "Alerts", icon: Bell },
];

export interface MoreItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface MoreGroup {
  heading: string;
  items: MoreItem[];
}

const labsIcons: Record<LabsNavigationDestinationId, LucideIcon> = {
  phenoHunt: Dna,
  breedingPrograms: GitFork,
  lineageRepair: Wrench,
  agentIntegrations: PlugZap,
  aiSessions: History,
};

const labsItems: MoreItem[] = LABS_NAVIGATION_DESTINATIONS.map((item) => ({
  ...item,
  icon: labsIcons[item.id],
}));

/**
 * Mobile More sheet — grouped for grower-first scanning.
 * Order is intentional: Daily (today's actions) → Insight (signals) →
 * More (lower-frequency core tools) → Labs (advanced tools) → Account.
 *
 * Route targets are unchanged from the prior flat list. Operator-only
 * surfaces are NOT included here — they render separately via the
 * role-gated OperatorModeLink.
 */
export const moreGroups: MoreGroup[] = [
  {
    heading: "Daily",
    items: [
      { to: "/daily-check", label: "Quick Log", icon: ClipboardCheck },
      { to: "/actions", label: "Action Queue", icon: ListChecks },
      { to: "/tasks", label: "Tasks", icon: ListChecks },
    ],
  },
  {
    heading: "Insight",
    items: [
      { to: "/sensors", label: "Sensors", icon: Activity },
      { to: "/doctor", label: "AI Doctor", icon: Stethoscope },
      { to: "/reports", label: "Reports", icon: LineChart },
    ],
  },
  {
    heading: "More",
    items: [{ to: "/grows", label: "My Grows", icon: Sprout }],
  },
  {
    heading: "Labs",
    items: labsItems,
  },
  {
    heading: "Account",
    items: [
      { to: "/settings", label: "Settings", icon: Settings },
      { to: "/invite", label: "Invite a Grower", icon: Users },
    ],
  },
];

/**
 * Back-compat flat export. Some tests and call sites still read a flat
 * `more` array; preserve the contract by flattening the grouped source
 * of truth.
 */
export const more: MoreItem[] = moreGroups.flatMap((g) => g.items);

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 backdrop-blur-xl bg-background/85 border-t border-border/40 pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-6 h-16">
        {primary.map((n) => {
          const active = isNavigationItemActive(pathname, n);
          return (
            <Link
              key={n.to}
              to={n.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] transition",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <n.icon className="h-5 w-5" />
              {n.label}
            </Link>
          );
        })}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="flex flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground">
            <MoreHorizontal className="h-5 w-5" />
            More
          </SheetTrigger>
          <SheetContent
            side="bottom"
            data-testid="mobile-more-sheet"
            className="flex max-h-[calc(100dvh-0.75rem)] flex-col overflow-hidden rounded-t-2xl"
          >
            <SheetHeader className="shrink-0">
              <SheetTitle className="font-display">Navigation</SheetTitle>
              <SheetDescription className="sr-only">Choose a Verdant destination.</SheetDescription>
            </SheetHeader>
            <div
              role="region"
              aria-label="More navigation destinations"
              tabIndex={0}
              data-testid="mobile-more-scroll-region"
              className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pb-[calc(1.5rem+env(safe-area-inset-bottom))] pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {moreGroups.map((group) => (
                <section
                  key={group.heading}
                  aria-label={group.heading}
                  data-testid={`mobile-more-group-${group.heading.toLowerCase()}`}
                >
                  <h3 className="px-1 mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {group.heading}
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {group.items.map((m) => (
                      <NavLink
                        key={m.to}
                        to={m.to}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border/50 text-xs",
                            isActive
                              ? "bg-primary/10 text-primary border-primary/40"
                              : "bg-secondary/30 text-foreground",
                          )
                        }
                      >
                        <m.icon className="h-5 w-5" />
                        {m.label}
                      </NavLink>
                    ))}
                  </div>
                </section>
              ))}
              {/*
                Operator surfaces are role-gated inside OperatorModeLink
                (server-side has_role check). It renders nothing for
                growers, so operator routes never enter the normal
                grower mobile nav DOM.
              */}
              <div className="grid grid-cols-3 gap-2">
                <OperatorModeLink variant="mobile" onNavigate={() => setOpen(false)} />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
