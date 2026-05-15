import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Home, Sprout, Sparkles, Plus, LogOut, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import QuickLog from "./QuickLog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AppShell() {
  const { user, loading, signOut } = useAuth();
  const { grows, activeGrowId, setActiveGrowId } = useGrows();
  const nav = useNavigate();
  const [openLog, setOpenLog] = useState(false);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) { nav("/auth", { replace: true }); return null; }

  const navItems = [
    { to: "/", label: "Timeline", icon: Home, end: true },
    { to: "/grows", label: "Grows", icon: Sprout, end: false },
    { to: "/coach", label: "AI Coach", icon: Sparkles, end: false },
  ];

  return (
    <div className="min-h-screen pb-24">
      {/* Top bar */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg gradient-leaf flex items-center justify-center"><Leaf className="h-4 w-4 text-primary-foreground" /></div>
            <span className="font-display font-semibold">Verdant</span>
          </div>
          {grows.length > 0 && (
            <Select value={activeGrowId ?? ""} onValueChange={setActiveGrowId}>
              <SelectTrigger className="ml-auto h-9 w-44 text-sm"><SelectValue placeholder="Pick grow" /></SelectTrigger>
              <SelectContent>{grows.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="icon" onClick={() => signOut().then(() => nav("/auth"))} className={grows.length === 0 ? "ml-auto" : ""}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5"><Outlet /></main>

      {/* Floating + button */}
      <button onClick={() => setOpenLog(true)} aria-label="Quick log"
        className="fixed z-40 bottom-24 right-1/2 translate-x-1/2 sm:translate-x-0 sm:right-8 h-16 w-16 rounded-full gradient-leaf shadow-elevated flex items-center justify-center text-primary-foreground hover:scale-105 transition active:scale-95 glow-accent">
        <Plus className="h-7 w-7" />
      </button>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-30 backdrop-blur-xl bg-background/85 border-t border-border/40">
        <div className="max-w-2xl mx-auto grid grid-cols-3 h-16">
          {navItems.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 text-xs transition ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              <n.icon className="h-5 w-5" />{n.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <QuickLog open={openLog} onOpenChange={setOpenLog} onCreated={() => window.dispatchEvent(new Event("verdant:entry-created"))} />
    </div>
  );
}
