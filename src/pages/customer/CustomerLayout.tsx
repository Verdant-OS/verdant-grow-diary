import { useEffect } from "react";
import { Outlet, Link } from "react-router-dom";
import { Leaf } from "lucide-react";

export default function CustomerLayout() {
  useEffect(() => {
    document.documentElement.classList.add("customer-mode");
    return () => document.documentElement.classList.remove("customer-mode");
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/grow" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Leaf className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="font-display font-semibold leading-none">Grow Like a Pro</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">Powered by Verdant · Next Door Cannabis</div>
            </div>
          </Link>
          <Link to="/app" className="text-xs text-primary hover:underline">Operator</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6"><Outlet /></main>
      <footer className="max-w-3xl mx-auto px-4 py-6 text-xs text-muted-foreground">
        Educational content only. Not medical or legal advice. Follow your local laws.
      </footer>
    </div>
  );
}
