import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import BrandLogo from "@/components/BrandLogo";
import { useAuth } from "@/store/auth";
import { ArrowRight, Bell, ClipboardList, FlaskConical, Leaf, Sparkles, Thermometer, CheckCircle2 } from "lucide-react";

/** Contextual signup copy keyed by the demo write-action that was attempted. */
const ACTION_PROMPTS: Record<string, string> = {
  "Add log": "Create an account to save real diary entries.",
  "Run AI Doctor": "Create an account to analyze your real grow context.",
  "Add to Action Queue": "Create an account to manage real approval-required actions.",
};

/**
 * Public, unauthenticated Verdant demo dashboard.
 *
 * Safety contract:
 *  - No Supabase queries, no hook imports, no edge-function invokes.
 *  - All values are static, presentational fixtures clearly labeled "Demo data".
 *  - Write-style actions (Add log, Run AI Doctor, Add to Action Queue) do NOT
 *    persist anything. They open a soft prompt inviting account creation.
 *  - Does not introduce any device-control or automation surface.
 *  - Does not pretend demo data is live.
 */
export default function Demo() {
  const { user } = useAuth();
  const [promptOpen, setPromptOpen] = useState<string | null>(null);

  const askCreateAccount = (action: string) => setPromptOpen(action);
  const closePrompt = () => setPromptOpen(null);

  return (
    <main className="min-h-screen bg-background text-foreground" data-testid="demo-root">
      {/* Demo banner */}
      <div
        role="status"
        aria-label="Demo mode banner"
        className="sticky top-0 z-40 bg-primary/15 border-b border-primary/30 text-primary"
      >
        <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4" />
            <span>Demo mode — all values below are sample data, not a real grow.</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/welcome">
              <Button size="sm" variant="ghost">Back to landing</Button>
            </Link>
            {user ? (
              <Link to="/">
                <Button size="sm">Open my dashboard</Button>
              </Link>
            ) : (
              <Link to="/auth">
                <Button size="sm">Create Free Account</Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <BrandLogo size="md" showText />
        <span className="text-xs uppercase tracking-wider px-2 py-1 rounded-md bg-primary/15 text-primary border border-primary/30 font-semibold">
          Demo data
        </span>
      </header>

      <section className="px-6 pb-8 max-w-6xl mx-auto">
        <h1 className="font-display text-3xl md:text-4xl font-bold">Welcome to the Verdant demo</h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          This is a static preview using <strong>demo / sample data</strong>. Nothing here is
          saved. When you're ready to track real plants, create a free account.
        </p>
      </section>

      {/* Context strip */}
      <section className="px-6 pb-6 max-w-6xl mx-auto">
        <div className="grid gap-3 sm:grid-cols-3">
          <DemoChip icon={<Leaf className="h-4 w-4" />} label="Demo grow" value="Autoflower Run #3" />
          <DemoChip icon={<Thermometer className="h-4 w-4" />} label="Demo tent" value="Tent A · 4x4" />
          <DemoChip icon={<FlaskConical className="h-4 w-4" />} label="Demo plant" value="Blueberry Auto · Week 5" />
        </div>
      </section>

      {/* KPI cards */}
      <section className="px-6 pb-6 max-w-6xl mx-auto grid gap-4 md:grid-cols-3">
        <KpiCard
          title="Latest sensor snapshot"
          metric="Stable"
          sub="Temp, humidity & VPD within range"
          badge="Demo data"
        />
        <KpiCard
          title="Open alerts"
          metric="1 drifting"
          sub="Humidity creeping above target"
          badge="Demo data"
        />
        <KpiCard
          title="Action Queue"
          metric="1 awaiting approval"
          sub="Suggested by AI Doctor — you decide"
          badge="Demo data"
        />
      </section>

      {/* Two-col content */}
      <section className="px-6 pb-10 max-w-6xl mx-auto grid gap-4 lg:grid-cols-2">
        {/* Timeline preview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Recent diary · Demo data</CardTitle>
              <Button size="sm" variant="outline" onClick={() => askCreateAccount("Add log")}>
                + Add log
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { when: "Today · morning", what: "Watered 1.2L pH'd to target", tag: "Watering" },
              { when: "Yesterday", what: "Photo: lower leaves slightly pale", tag: "Photo" },
              { when: "2 days ago", what: "Light schedule confirmed 20/4", tag: "Note" },
              { when: "3 days ago", what: "Feeding: half-strength bloom", tag: "Feeding" },
            ].map((e) => (
              <div key={e.when} className="flex items-start justify-between gap-3 border-b border-border/30 pb-2 last:border-0">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{e.when}</div>
                  <div className="text-sm mt-0.5">{e.what}</div>
                </div>
                <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{e.tag}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* AI Doctor preview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> AI Doctor · Demo data
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => askCreateAccount("Run AI Doctor")}>
                Ask AI Doctor
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="font-semibold">Summary</div>
              <p className="text-muted-foreground">
                Mild humidity drift overnight. Plant looks healthy. No urgent change needed.
              </p>
            </div>
            <div>
              <div className="font-semibold">Likely cause</div>
              <p className="text-muted-foreground">
                Tent fan duty likely too low during dark cycle. Confidence: moderate.
              </p>
            </div>
            <div>
              <div className="font-semibold">Suggested next step</div>
              <p className="text-muted-foreground">
                Review fan schedule. Verdant will not change anything until you approve it.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Alert → Action Queue preview */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" /> Alert → Action Queue · Demo data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Open alert · Demo</div>
                  <div className="font-display text-lg font-semibold mt-1">
                    Humidity above target (sample)
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                    Demo tent A drifted above your humidity target overnight. Review and decide what to do.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => askCreateAccount("Add to Action Queue")}
                  className="gap-2"
                >
                  <ClipboardList className="h-4 w-4" /> Add to Action Queue
                </Button>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-secondary/60">
                  Approval-required
                </span>
                <span>Verdant never auto-runs equipment changes.</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Final CTA */}
      <section className="px-6 pb-20 max-w-3xl mx-auto text-center">
        <h2 className="font-display text-2xl md:text-3xl font-semibold">
          Like what you see?
        </h2>
        <p className="mt-3 text-muted-foreground">
      {/* Make this your real grow — conversion panel */}
      <section className="px-6 pb-10 max-w-6xl mx-auto">
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 md:p-8">
          <h2 className="font-display text-2xl md:text-3xl font-semibold">
            Make this your real grow
          </h2>
          <ul className="mt-4 space-y-2 text-sm md:text-base text-muted-foreground">
            <li>· Create a free account to replace demo data with your own grow, tent, plant, logs, and sensor readings.</li>
            <li>· Your real dashboard stays private.</li>
            <li>· Demo actions are previews only — nothing here is saved.</li>
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {user ? (
              <Link to="/">
                <Button size="lg">Open my dashboard <ArrowRight className="ml-1 h-4 w-4" /></Button>
              </Link>
            ) : (
              <Link to="/auth">
                <Button size="lg">Create Free Account</Button>
              </Link>
            )}
            <Link to="/auth">
              <Button size="lg" variant="outline">Sign In</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* What happens after signup? */}
      <section className="px-6 pb-12 max-w-6xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center">
          What happens after signup?
        </h2>
        <p className="mt-2 text-center text-muted-foreground">
          Four small steps and Verdant starts remembering your grow.
        </p>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: "Step 1", title: "Create your grow", body: "Name your run and set basic targets." },
            { n: "Step 2", title: "Add your tent and plant", body: "Track environment and lineage per plant." },
            { n: "Step 3", title: "Log your first note or sensor reading", body: "Diary entry or manual sensor snapshot — your call." },
            { n: "Step 4", title: "Let Verdant build your plant timeline", body: "Logs, photos, alerts, and approval-required actions, in one place." },
          ].map((s) => (
            <li key={s.n} className="rounded-xl border border-border/40 bg-card/30 p-4">
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider font-semibold">{s.n}</span>
              </div>
              <div className="mt-1 font-display font-semibold">{s.title}</div>
              <div className="text-sm text-muted-foreground mt-1">{s.body}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* Final CTA */}
      <section className="px-6 pb-20 max-w-3xl mx-auto text-center">
        <h2 className="font-display text-2xl md:text-3xl font-semibold">
          Like what you see?
        </h2>
        <p className="mt-3 text-muted-foreground">
          Create a free account to start your own plant memory — your data,
          your sensors, your approvals.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {user ? (
            <Link to="/">
              <Button size="lg">Open my dashboard <ArrowRight className="ml-1 h-4 w-4" /></Button>
            </Link>
          ) : (
            <Link to="/auth">
              <Button size="lg">Create Free Account</Button>
            </Link>
          )}
          <Link to="/auth">
            <Button size="lg" variant="outline">Sign In</Button>
          </Link>
          <Link to="/welcome">
            <Button size="lg" variant="ghost">Back to landing</Button>
          </Link>
        </div>
      </section>

      {/* Soft prompt for demo write actions */}
      {promptOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create an account to continue"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
          onClick={closePrompt}
        >
          <div
            className="max-w-sm w-full rounded-2xl border border-border/60 bg-card p-6 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold">{promptOpen} is part of your real grow</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a free account to use this with your real grow. Demo
              actions are not saved.
            </p>
            <div className="mt-5 flex items-center gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={closePrompt}>Keep exploring</Button>
              <Link to="/auth" onClick={closePrompt}>
                <Button size="sm">Create Free Account</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function DemoChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/40 p-3">
      <div className="h-8 w-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center">{icon}</div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}

function KpiCard({ title, metric, sub, badge }: { title: string; metric: string; sub: string; badge: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur p-5 relative">
      <span className="absolute top-3 right-3 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">
        {badge}
      </span>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-2 font-display text-2xl font-bold">{metric}</div>
      <div className="text-sm text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}
