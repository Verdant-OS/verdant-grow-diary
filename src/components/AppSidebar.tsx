import { NavLink, useLocation } from "react-router-dom";
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
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
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

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/**
 * UI Simplification Slice 1 — Grower-facing groups.
 *
 * The One-Tent Loop spine (Today → Cultivation → Daily → Insight) is the
 * shape of the sidebar. Advanced/Account hold lower-frequency tools.
 * Operator/internal surfaces live in the separate `operatorGroups` block
 * below, which is rendered ONLY when `useHasRole("operator")` is granted.
 */
const growerGroups: { label: string; items: NavItem[] }[] = [
  { label: "Today", items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }] },
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
      { to: "/sensors", label: "Sensors", icon: Activity },
      { to: "/doctor", label: "AI Doctor", icon: Stethoscope },
    ],
  },
  {
    label: "Advanced",
    items: [
      { to: "/reports", label: "Reports", icon: LineChart },
      { to: "/grows", label: "Harvest Archive", icon: Sprout },
      // /grow-lineage is manifest access "auth" (grower-facing repair tool).
      // Owner-scoped reads/writes only, RLS-protected. MUST stay visible to
      // every authenticated grower — do not gate behind operator role.
      { to: "/grow-lineage", label: "Lineage Repair", icon: Wrench },
    ],
  },
  { label: "Account", items: [
    { to: "/settings", label: "Settings", icon: Settings },
    { to: "/account/preferences", label: "Preferences", icon: UserCog },
  ] },
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

  const renderGroup = (g: { label: string; items: NavItem[] }) => {
    if (g.items.length === 0) return null;
    return (
      <SidebarGroup key={g.label}>
        {!collapsed && (
          <SidebarGroupLabel className="text-[10px] tracking-wider">
            {g.label}
          </SidebarGroupLabel>
        )}
        <SidebarGroupContent>
          <SidebarMenu>
            {g.items.map((item) => {
              const active = item.end
                ? pathname === item.to
                : pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={cn("flex items-center gap-2.5")}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
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

