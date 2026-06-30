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
  ShieldCheck,
  Wrench,
  LineChart,
  ClipboardList,
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
  /**
   * When true, this entry is gated behind server-side `has_role('operator')`
   * and is never rendered (or even mounted into the DOM) for non-operators.
   * Operator/internal routes that leak into the grower sidebar would point
   * users at "Access restricted" screens; gate them here instead.
   */
  requiresOperator?: boolean;
}

const groups: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }] },
  {
    label: "Cultivation",
    items: [
      { to: "/tents", label: "Tents", icon: Box },
      { to: "/plants", label: "Plants", icon: Sprout },
    ],
  },
  {
    label: "Data",
    items: [
      { to: "/sensors", label: "Sensor Data", icon: Activity },
      { to: "/logs", label: "Logs", icon: NotebookText },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/tasks", label: "Tasks", icon: ListChecks },
      { to: "/alerts", label: "Alerts", icon: Bell },
      { to: "/actions", label: "Action Queue", icon: ShieldCheck },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/doctor", label: "AI Grow Doctor", icon: Stethoscope },
      // Operator-only deep link to the Phase 1 results page. Manifest
      // access for /operator/ai-doctor-phase1 is "operator"; we gate it
      // here so non-operators never see the link.
      { to: "/operator/ai-doctor-phase1", label: "AI Doctor Results", icon: Stethoscope, requiresOperator: true },
      { to: "/reports", label: "Grow Learning Hub", icon: LineChart },
    ],
  },
  {
    label: "Archive",
    items: [
      { to: "/grows", label: "Harvest Archive", icon: Sprout },
      // /grow-lineage is manifest access "auth" (grower-facing repair tool).
      // Owner-scoped reads/writes only, RLS-protected. MUST stay visible to
      // every authenticated grower — do not gate behind operator role.
      { to: "/grow-lineage", label: "Lineage Repair", icon: Wrench },
    ],
  },
  {
    label: "Release",
    items: [
      // Operator-only deep link to the static/manual release readiness
      // status page. Manifest access for /operator/release-readiness is
      // "operator"; gate it here so non-operators never see the link.
      {
        to: "/operator/release-readiness",
        label: "Release Readiness",
        icon: ClipboardList,
        requiresOperator: true,
      },
    ],
  },
  { label: "Account", items: [{ to: "/settings", label: "Settings", icon: Settings }] },
];

export default function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const operatorRole = useHasRole("operator");
  const isOperator = operatorRole.status === "granted";

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
        {groups.map((g) => {
          const visibleItems = g.items.filter(
            (item) => !item.requiresOperator || isOperator,
          );
          if (visibleItems.length === 0) return null;
          return (
          <SidebarGroup key={g.label}>
            {!collapsed && (
              <SidebarGroupLabel className="text-[10px] tracking-wider">
                {g.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleItems.map((item) => {
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
        })}
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] tracking-wider">
              Operator
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <div className="px-1">
              <OperatorModeLink variant="sidebar" />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
