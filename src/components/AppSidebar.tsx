import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Box, Sprout, Activity, NotebookText,
  ListChecks, Bell, Stethoscope, Settings, ShieldCheck, Wrench, LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import BrandLogo from "@/components/BrandLogo";

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }

const groups: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/grow-room", label: "Grow-Room Mode", icon: LayoutGrid },
  ]},
  { label: "Grow", items: [
    { to: "/tents", label: "Tents", icon: Box },
    { to: "/plants", label: "Plants", icon: Sprout },
    { to: "/cameras", label: "Cameras", icon: Camera },
  ]},
  { label: "Data", items: [
    { to: "/sensors", label: "Sensor Data", icon: Activity },
    { to: "/logs", label: "Grow Logs", icon: NotebookText },
  ]},
  { label: "Operations", items: [
    { to: "/tasks", label: "Tasks", icon: ListChecks },
    { to: "/alerts", label: "Alerts", icon: Bell },
  ]},
  { label: "Intelligence", items: [
    { to: "/doctor", label: "AI Grow Doctor", icon: Stethoscope },
    { to: "/actions", label: "Action Queue", icon: ShieldCheck },
    { to: "/grows", label: "Grows", icon: Sprout },
    { to: "/grow-lineage", label: "Lineage Repair", icon: Wrench },
  ]},
  { label: "Account", items: [{ to: "/settings", label: "Settings", icon: Settings }] },
];

export default function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-2.5">
          <BrandLogo size="md" />
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-display font-semibold text-sm">Verdant</div>
              <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Command Center</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            {!collapsed && <SidebarGroupLabel className="text-[10px] tracking-wider">{g.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => {
                  const active = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <NavLink to={item.to} end={item.end} className={cn("flex items-center gap-2.5")}>
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
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
