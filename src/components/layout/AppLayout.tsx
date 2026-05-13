import { useState } from "react";
import { Outlet, Link } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Plus, ShieldCheck, Leaf } from "lucide-react";
import { FastAdd } from "@/components/FastAdd";
import { useVerdant } from "@/store/verdant";
import { Badge } from "@/components/ui/badge";

export default function AppLayout() {
  const [fastOpen, setFastOpen] = useState(false);
  const { safetyMode } = useVerdant();

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:block sticky top-0 h-screen">
        <Sidebar />
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 glass border-b border-border/60 px-4 py-3 flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border">
              <Sidebar />
            </SheetContent>
          </Sheet>

          <Link to="/app" className="md:hidden flex items-center gap-2">
            <Leaf className="h-5 w-5 text-primary" />
            <span className="font-display font-semibold">Verdant</span>
          </Link>

          <div className="flex-1" />

          <Badge variant="outline" className="hidden sm:inline-flex gap-1.5 border-border/60">
            <ShieldCheck className="h-3 w-3 text-primary" />
            Safety: {safetyMode === "approval" ? "Approval Required" : safetyMode === "observe" ? "Observe Only" : "Guardrailed"}
          </Badge>

          <Button onClick={() => setFastOpen(true)} className="gradient-leaf text-primary-foreground hover:opacity-90 font-medium gap-1.5">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Fast Add</span>
          </Button>
        </header>

        <main className="flex-1 p-4 md:p-6 max-w-[1400px] w-full mx-auto animate-fade-in">
          <Outlet />
        </main>
      </div>

      <FastAdd open={fastOpen} onOpenChange={setFastOpen} />
    </div>
  );
}
