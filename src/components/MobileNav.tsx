import { NavLink } from "react-router-dom";
import { LayoutDashboard, Box, NotebookText, ListChecks, Bell, MoreHorizontal, Sprout, Activity, Stethoscope, Settings, ClipboardCheck } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useState } from "react";

const primary = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/tents", label: "Tents", icon: Box },
  { to: "/plants", label: "Plants", icon: Sprout },
  { to: "/logs", label: "Logs", icon: NotebookText },
  { to: "/alerts", label: "Alerts", icon: Bell },
];

const more = [
  { to: "/daily-check", label: "Daily Grow Check", icon: ClipboardCheck },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/sensors", label: "Sensor Data", icon: Activity },
  { to: "/doctor", label: "AI Grow Doctor", icon: Stethoscope },
  { to: "/grows", label: "Harvest Archive", icon: Sprout },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 backdrop-blur-xl bg-background/85 border-t border-border/40 pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-6 h-16">
        {primary.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              cn("flex flex-col items-center justify-center gap-0.5 text-[10px] transition", isActive ? "text-primary" : "text-muted-foreground hover:text-foreground")
            }
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </NavLink>
        ))}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="flex flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground">
            <MoreHorizontal className="h-5 w-5" />
            More
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader><SheetTitle className="font-display">Navigation</SheetTitle></SheetHeader>
            <div className="grid grid-cols-3 gap-3 mt-4">
              {more.map((m) => (
                <NavLink
                  key={m.to}
                  to={m.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn("flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border/50 text-xs", isActive ? "bg-primary/10 text-primary border-primary/40" : "bg-secondary/30 text-foreground")
                  }
                >
                  <m.icon className="h-5 w-5" />
                  {m.label}
                </NavLink>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
