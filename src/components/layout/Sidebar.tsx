import { NavLink } from "react-router-dom";
import { LayoutDashboard, Sprout, BookOpen, Calendar, Image, Bot, Stethoscope, BarChart3, Activity, Users, Settings, Leaf } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/app", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/app/plants", icon: Sprout, label: "Plants" },
  { to: "/app/diary", icon: BookOpen, label: "Diary" },
  { to: "/app/calendar", icon: Calendar, label: "Calendar" },
  { to: "/app/photos", icon: Image, label: "Photos" },
  { to: "/app/ask", icon: Bot, label: "Ask My Grow" },
  { to: "/app/diagnosis", icon: Stethoscope, label: "Diagnosis" },
  { to: "/app/reports", icon: BarChart3, label: "Reports" },
  { to: "/app/sensors", icon: Activity, label: "Sensors" },
  { to: "/app/customer", icon: Users, label: "Customer Mode" },
  { to: "/app/settings", icon: Settings, label: "Settings" },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="h-full w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">
      <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl gradient-leaf flex items-center justify-center glow-accent">
          <Leaf className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <div className="font-display font-semibold leading-none">Verdant</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Command Center</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        {items.map(it => (
          <NavLink key={it.to} to={it.to} end={it.end} onClick={onNavigate}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 my-0.5 rounded-lg text-sm transition-colors",
              isActive
                ? "bg-sidebar-accent text-primary font-medium border border-sidebar-border"
                : "hover:bg-sidebar-accent/60 text-sidebar-foreground"
            )}>
            <it.icon className="h-4 w-4" />
            {it.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border text-xs text-muted-foreground">
        <div className="px-2">Diary-first OS · MVP</div>
      </div>
    </aside>
  );
}
