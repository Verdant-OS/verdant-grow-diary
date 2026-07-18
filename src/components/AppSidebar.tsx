import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Box,
  Sprout,
  Activity,
  NotebookText,
  ListChecks,
  Bell,
  Stethoscope,
  Settings,
  UserCog,
  ShieldCheck,
  Wrench,
  LineChart,
  ClipboardList,
  Users,
  HelpCircle,
  Dna,
  ChevronRight,
  FlaskConical,
  GitFork,
  History,
  PlugZap,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import BrandLogo from "@/components/BrandLogo";
import OperatorModeLink from "@/components/OperatorModeLink";
import { useHasRole } from "@/hooks/useHasRole";
import { isNavigationItemActive, type NavigationActiveRule } from "@/lib/navigationActiveRules";
import {
  LABS_NAVIGATION_DESTINATIONS,
  type LabsNavigationDestinationId,
} from "@/lib/growerNavigationRules";

interface NavItem extends NavigationActiveRule {
  label: string;
  icon: LucideIcon;
}

interface NavSubmenu {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
  submenu?: NavSubmenu;
}

const labsIcons: Record<LabsNavigationDestinationId, LucideIcon> = {
  phenoHunt: Dna,
  breedingPrograms: GitFork,
  lineageRepair: Wrench,
  agentIntegrations: PlugZap,
  aiSessions: History,
};

const labsItems: NavItem[] = LABS_NAVIGATION_DESTINATIONS.map((item) => ({
  ...item,
  icon: labsIcons[item.id],
}));

/**
 * UI Simplification Slice 1 — Grower-facing groups.
 *
 * The One-Tent Loop spine (Today → Cultivation → Daily → Insight) is the
 * shape of the sidebar. More/Account hold lower-frequency tools, while
 * advanced authenticated destinations stay behind the Labs disclosure in More.
 * Operator/internal surfaces live in the separate `operatorGroups` block
 * below, which is rendered ONLY when `useHasRole("operator")` is granted.
 */
const growerGroups: NavGroup[] = [
  {
    label: "Today",
    items: [
      {
        to: "/",
        label: "Dashboard",
        icon: LayoutDashboard,
        end: true,
        aliases: ["/dashboard"],
      },
    ],
  },
  {
    label: "Cultivation",
    items: [
      { to: "/tents", label: "Tents", icon: Box },
      { to: "/plants", label: "Plants", icon: Sprout },
    ],
  },
  {
    label: "Daily",
    items: [
      { to: "/timeline", label: "Timeline", icon: NotebookText },
      { to: "/alerts", label: "Alerts", icon: Bell },
      { to: "/actions", label: "Action Queue", icon: ShieldCheck },
      { to: "/tasks", label: "Tasks", icon: ListChecks },
    ],
  },
  {
    label: "Insight",
    items: [
      {
        to: "/sensors",
        label: "Sensors",
        icon: Activity,
        excludedPaths: ["/sensors/ecowitt-audit"],
      },
      { to: "/doctor", label: "AI Doctor", icon: Stethoscope },
      { to: "/reports", label: "Reports", icon: LineChart },
    ],
  },
  {
    label: "More",
    items: [{ to: "/grows", label: "My Grows", icon: Sprout }],
    submenu: {
      label: "Labs",
      icon: FlaskConical,
      items: labsItems,
    },
  },
  {
    label: "Account",
    items: [
      { to: "/settings", label: "Settings", icon: Settings },
      { to: "/account/preferences", label: "Preferences", icon: UserCog },
      { to: "/invite", label: "Invite a Grower", icon: Users },
    ],
  },
];

/**
 * Operator-only groups. These are rendered ONLY when the server-side
 * `has_role('operator')` check returns granted. While role status is
 * loading/denied/error/unauthenticated, no operator group, label, or
 * item is mounted — guaranteeing zero leakage of operator paths into
 * the grower DOM.
 */
const operatorGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Operator Mode",
    items: [
      { to: "/operator/release-readiness", label: "Release Readiness", icon: ClipboardList },
      { to: "/operator/ai-doctor-phase1", label: "AI Doctor Results", icon: Stethoscope },
      { to: "/sensors/ecowitt-audit", label: "EcoWitt Audit", icon: Activity },
      { to: "/guides/cannabis-plant-care", label: "Help/Guides", icon: HelpCircle },
    ],
  },
];

export default function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const operatorRole = useHasRole("operator");
  const isOperator = operatorRole.status === "granted";

  const renderGroup = (g: NavGroup) => {
    if (g.items.length === 0 && !g.submenu) return null;
    const submenuActive =
      g.submenu?.items.some((item) => isNavigationItemActive(pathname, item)) ?? false;

    return (
      <SidebarGroup key={g.label}>
        {!collapsed && (
          <SidebarGroupLabel className="text-[10px] tracking-wider">{g.label}</SidebarGroupLabel>
        )}
        <SidebarGroupContent>
          <SidebarMenu>
            {g.items.map((item) => {
              const active = isNavigationItemActive(pathname, item);
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                    <Link
                      to={item.to}
                      aria-current={active ? "page" : undefined}
                      className={cn("flex items-center gap-2.5")}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
            {g.submenu && (
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      isActive={submenuActive}
                      aria-label={`Open ${g.submenu.label}`}
                      title={g.submenu.label}
                      className="gap-2.5"
                    >
                      <g.submenu.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{g.submenu.label}</span>
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0" aria-hidden="true" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="right"
                    align="start"
                    aria-label={g.submenu.label}
                    className="w-56"
                  >
                    <DropdownMenuLabel>{g.submenu.label}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {g.submenu.items.map((item) => {
                      const active = isNavigationItemActive(pathname, item);
                      return (
                        <DropdownMenuItem key={item.to} asChild>
                          <Link
                            to={item.to}
                            aria-current={active ? "page" : undefined}
                            className="flex items-center gap-2"
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-2.5">
          <BrandLogo size="md" />
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-display font-semibold text-sm">Verdant</div>
              <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
                Command Center
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {growerGroups.map(renderGroup)}

        {isOperator && (
          <>
            {operatorGroups.map(renderGroup)}
            <SidebarGroup>
              <SidebarGroupContent>
                <div className="px-1">
                  <OperatorModeLink variant="sidebar" />
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
