import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Bell, LogOut, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/store/auth";
import { useAlerts } from "@/hooks/useMockData";
import AppSidebar from "./AppSidebar";
import MobileNav from "./MobileNav";
import QuickLog, { type QuickLogPrefill } from "./QuickLog";
import BrandLogo from "./BrandLogo";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";


export default function AppShell() {
  const { user, loading, signOut } = useAuth();
  const { data: alerts } = useAlerts();
  const nav = useNavigate();
  const [openLog, setOpenLog] = useState(false);
  const [prefill, setPrefill] = useState<QuickLogPrefill | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<QuickLogPrefill>).detail ?? null;
      setPrefill(detail);
      setOpenLog(true);
    }
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, onOpen as EventListener);
    return () => window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, onOpen as EventListener);
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) { nav("/auth", { replace: true }); return null; }

  const unread = (alerts || []).filter((a) => !a.acknowledged).length;

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <AppSidebar />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/40">
            <div className="h-14 px-3 md:px-5 flex items-center gap-3">
              <div className="hidden md:block">
                <SidebarTrigger />
              </div>
              <div className="md:hidden">
                <BrandLogo size="md" showText />
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button className="hidden md:inline-flex items-center gap-2 px-3 h-9 rounded-lg border border-border/50 bg-secondary/30 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition">
                  <Search className="h-4 w-4" /><span className="hidden lg:inline">Search…</span>
                  <kbd className="hidden lg:inline ml-2 text-[10px] px-1.5 py-0.5 rounded bg-background/60 border border-border/40">⌘K</kbd>
                </button>
                
                <Button variant="outline" size="sm" onClick={() => { setPrefill(null); setOpenLog(true); }} className="hidden md:inline-flex">
                  <Plus className="h-4 w-4" /> Quick log
                </Button>
                <Button variant="ghost" size="icon" onClick={() => nav("/alerts")} aria-label="Alerts" className="relative">
                  <Bell className="h-4 w-4" />
                  {unread > 0 && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
                  )}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => signOut().then(() => nav("/auth"))} aria-label="Sign out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 md:px-6 lg:px-8 py-5 pb-28 md:pb-8 max-w-[1400px] w-full mx-auto">
            <Outlet />
          </main>
        </div>

        {/* Mobile floating + */}
        <button
          onClick={() => setOpenLog(true)}
          aria-label="Quick log"
          className="md:hidden fixed z-40 bottom-20 right-4 h-14 w-14 rounded-full gradient-leaf shadow-elevated flex items-center justify-center text-primary-foreground hover:scale-105 transition active:scale-95 glow-accent"
        >
          <Plus className="h-6 w-6" />
        </button>

        <MobileNav />

        <QuickLog open={openLog} onOpenChange={setOpenLog} onCreated={() => window.dispatchEvent(new Event("verdant:entry-created"))} />
      </div>
    </SidebarProvider>
  );
}
