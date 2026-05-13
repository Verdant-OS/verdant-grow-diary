import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Leaf, BookOpen, Activity, Sprout, Bot, BarChart3, ArrowRight, ShieldCheck, Users } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <nav className="px-6 py-5 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl gradient-leaf flex items-center justify-center glow-accent"><Leaf className="h-5 w-5 text-primary-foreground" /></div>
          <div>
            <div className="font-display font-semibold leading-none">Verdant</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">Command Center</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/grow" className="text-sm text-muted-foreground hover:text-foreground hidden sm:inline">Customer mode</Link>
          <Button asChild className="gradient-leaf text-primary-foreground"><Link to="/app">Open app <ArrowRight className="h-4 w-4 ml-1" /></Link></Button>
        </div>
      </nav>

      <section className="max-w-5xl mx-auto px-6 pt-12 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 glass text-xs uppercase tracking-widest mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
          Diary-first grow OS · MVP
        </div>
        <h1 className="font-display text-4xl md:text-6xl font-semibold leading-tight tracking-tight">
          Your grow's <span className="text-leaf">command center</span>.<br />Built around the diary.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
          Verdant remembers every plant action, connects it to environmental context, and turns grow history into better decisions — for serious cannabis cultivators.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild className="gradient-leaf text-primary-foreground glow-accent"><Link to="/app">Open the command center</Link></Button>
          <Button size="lg" variant="outline" asChild><Link to="/grow">See customer mode</Link></Button>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { i: BookOpen, t: "Diary as the hub", d: "Every watering, feeding, training and snapshot lives on one timeline — connected back to each plant." },
            { i: Activity, t: "Validated environment", d: "Manual or live snapshots are checked for suspicious values, stale syncs and unit confusion before they pollute your reports." },
            { i: Sprout, t: "Autoflower-aware", d: "Stage and medium specific guidance — Verdant warns when an action could slow your autoflower's recovery." },
            { i: Bot, t: "Ask My Grow (shell)", d: "AI co-pilot architecture with cautious context bundling. No fake AI, ever." },
            { i: BarChart3, t: "Weekly reports", d: "EC and pH trends, watering frequency, photo & diagnosis history, current risks per plant." },
            { i: Users, t: "Customer mode + QR", d: "Branded grow guides per strain, with consent-first SMS opt-ins. Never touches operator data." },
          ].map(({ i: Icon, t, d }) => (
            <div key={t} className="glass rounded-xl p-5">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3"><Icon className="h-5 w-5 text-primary" /></div>
              <div className="font-display font-semibold text-lg mb-1">{t}</div>
              <p className="text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="glass rounded-2xl p-8 text-center">
          <ShieldCheck className="h-8 w-8 text-primary mx-auto mb-3" />
          <h2 className="font-display text-2xl font-semibold">Safety mode by default</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">Approval-required out of the box. Autopilot can never enable accidentally. No real device control, no real SMS, no fake AI in this MVP.</p>
        </div>
      </section>
    </div>
  );
}
