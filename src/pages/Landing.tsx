import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Camera,
  CheckCircle2,
  ClipboardList,
  Droplets,
  Leaf,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth";
import BrandLogo from "@/components/BrandLogo";
import LeadCaptureForm from "@/components/LeadCaptureForm";

/**
 * Public landing page for https://verdantgrowdiary.com.
 *
 * Read-only marketing surface. It does NOT:
 *  - read or render any authenticated dashboard data (no grows, plants,
 *    tents, sensors, alerts, or action_queue queries),
 *  - call Supabase with user-scoped data queries,
 *  - introduce any write path,
 *  - perform any device-control or automation action.
 *
 * The bento "Try the loop" demo uses purely local component state with
 * sample/seed values that are clearly labelled as Sample data. No
 * Supabase, no functions.invoke, no service_role. Visitors can poke
 * through the V0 loop (alert → action queue → follow-up) without an
 * account, then opt in via the soft CTA.
 */

type LoopStep = "idle" | "queued" | "approved" | "completed";

export default function Landing() {
  const { user } = useAuth();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <BrandLogo size="md" showText />
        <div className="flex items-center gap-2">
          <Link to="/pricing" className="hidden sm:block">
            <Button variant="ghost" size="sm">Pricing</Button>
          </Link>
          {user ? (
            <Link to="/">
              <Button variant="outline" size="sm">Open dashboard</Button>
            </Link>
          ) : (
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
          )}
        </div>
      </header>

      {/* Hero — compact. The bento below is the real attraction. */}
      <section className="px-6 pt-8 pb-4 max-w-6xl mx-auto">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            No login required — touch the loop below
          </span>
          <h1 className="mt-5 font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
            A grow room operating system{" "}
            <span className="text-primary">you can actually feel.</span>
          </h1>
          <p className="mt-5 text-base md:text-lg text-muted-foreground max-w-2xl">
            Plant memory, sensor truth, cautious AI, and grower-approved action — in one
            calm dashboard. Try the live loop on this page before you make an account.
          </p>
        </div>
      </section>

      {/* THE BENTO — interactive product demo */}
      <section
        id="explore"
        aria-label="Explore Verdant — sample data, no login required"
        className="px-6 py-8 max-w-6xl mx-auto"
      >
        <LoopBento />
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Every tile above shows <span className="font-medium text-foreground/80">sample data</span>.
          Nothing is sent or saved. Make an account when you want your own grow remembered.
        </p>
      </section>

      {/* Soft CTA — appears after the bento, never before */}
      <section className="px-6 pt-6 pb-16 max-w-6xl mx-auto">
        <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-card to-secondary/40 p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center gap-6 md:justify-between">
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-semibold">
              Ready to remember your own grow?
            </h2>
            <p className="mt-2 text-muted-foreground max-w-xl">
              Start a grow, log a watering, snap a photo. Verdant keeps the timeline,
              the targets, and the receipts — you keep the approvals.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            {user ? (
              <Link to="/">
                <Button size="lg" className="gap-2">
                  Open dashboard <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Link to="/auth">
                <Button size="lg" className="gap-2">
                  Start your own grow <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            )}
            <Link to="/hardware-integrations">
              <Button size="lg" variant="outline">Hardware partners</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Manifesto strip */}
      <section className="px-6 py-12 max-w-5xl mx-auto text-center">
        <h2 className="font-display text-2xl md:text-3xl font-semibold">
          Signal, not noise. Approvals, not autopilot.
        </h2>
        <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
          Verdant treats sensor data as ground truth and AI as a careful assistant.
          Every meaningful change requires a human in the loop. The grower stays
          in control.
        </p>
      </section>

      {/* Beta sign up — kept */}
      <section id="beta" className="px-6 py-12 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="font-display text-2xl md:text-3xl font-semibold">
            Join the Verdant beta
          </h2>
          <p className="mt-3 text-muted-foreground">
            Hardware partner? Contact Verdant about read-only integrations.
          </p>
        </div>
        <LeadCaptureForm />
      </section>

      <footer className="px-6 py-10 border-t border-border/40 text-sm text-muted-foreground text-center">
        <p>
          Verdant Grow Diary ·{" "}
          <a className="hover:text-foreground" href="https://verdantgrowdiary.com">
            verdantgrowdiary.com
          </a>
        </p>
      </footer>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive bento — pure local state. No network, no writes.        */
/* ------------------------------------------------------------------ */

function LoopBento() {
  const [step, setStep] = useState<LoopStep>("idle");
  const reduceMotion = usePrefersReducedMotion();

  const reset = () => setStep("idle");
  const queue = () => setStep("queued");
  const approve = () => setStep("approved");
  const complete = () => setStep("completed");

  return (
    <div className="grid grid-cols-1 md:grid-cols-6 md:grid-rows-[auto_auto] gap-4">
      {/* A — Tent snapshot (large) */}
      <SnapshotTile className="md:col-span-3 md:row-span-2" />

      {/* B — Environment alert */}
      <AlertTile
        className="md:col-span-3"
        step={step}
        onQueue={queue}
      />

      {/* C — Action queue card */}
      <ActionTile
        className="md:col-span-2"
        step={step}
        onApprove={approve}
        onComplete={complete}
        onReset={reset}
      />

      {/* D — Follow-up diary entry (appears after completion) */}
      <FollowupTile
        className="md:col-span-2"
        step={step}
        reduceMotion={reduceMotion}
      />

      {/* E — Manifesto */}
      <ManifestoTile className="md:col-span-2" />

      {/* F — Photo timeline strip (spans full width below) */}
      <TimelineTile className="md:col-span-6" />
    </div>
  );
}

/* ---------- Tiles ---------- */

function Tile({
  className = "",
  children,
  badge,
}: {
  className?: string;
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <div
      className={`relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur p-5 md:p-6 transition-all duration-300 hover:border-primary/40 hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.25)] ${className}`}
    >
      {badge && (
        <span className="absolute top-3 right-3 rounded-full bg-muted/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {badge}
        </span>
      )}
      {children}
    </div>
  );
}

function SnapshotTile({ className }: { className?: string }) {
  return (
    <Tile className={className} badge="Sample">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center text-primary">
          <Leaf className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Tent · Veg Room A
          </div>
          <div className="font-display text-lg font-semibold">Latest snapshot</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Metric label="Temp" value="26.4" unit="°C" tone="ok" />
        <Metric label="RH" value="71" unit="%" tone="warn" />
        <Metric label="VPD" value="0.82" unit="kPa" tone="ok" />
      </div>

      <div className="mt-6 text-sm text-muted-foreground leading-relaxed">
        Sensor source: <span className="text-foreground/80">manual reading</span> · captured{" "}
        <span className="text-foreground/80">2 min ago</span>.
        Targets snapshotted from your grow profile, never inferred.
      </div>
    </Tile>
  );
}

function Metric({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone: "ok" | "warn";
}) {
  const toneClass =
    tone === "warn"
      ? "text-amber-300/90"
      : "text-foreground";
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-semibold ${toneClass}`}>
        {value}
        <span className="ml-1 text-xs text-muted-foreground font-sans font-normal">{unit}</span>
      </div>
    </div>
  );
}

function AlertTile({
  className,
  step,
  onQueue,
}: {
  className?: string;
  step: LoopStep;
  onQueue: () => void;
}) {
  const queued = step !== "idle";
  return (
    <Tile className={className} badge="Sample alert">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-500/15 grid place-items-center text-amber-300">
          <TriangleAlert className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Environment alert
          </div>
          <div className="font-display text-lg font-semibold">
            Humidity above target
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            RH 71% in Veg Room A — target band is 55–65%. Verdant surfaces
            the drift; it never adjusts equipment for you.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button
          size="sm"
          onClick={onQueue}
          disabled={queued}
          className="gap-2"
        >
          <ClipboardList className="h-4 w-4" />
          {queued ? "Added to Action Queue" : "Add to Action Queue"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Approval-required · no automation
        </span>
      </div>
    </Tile>
  );
}

function ActionTile({
  className,
  step,
  onApprove,
  onComplete,
  onReset,
}: {
  className?: string;
  step: LoopStep;
  onApprove: () => void;
  onComplete: () => void;
  onReset: () => void;
}) {
  const stateLabel: Record<LoopStep, string> = {
    idle: "Waiting for alert",
    queued: "Pending approval",
    approved: "Approved · ready to complete",
    completed: "Completed",
  };
  const stateTone: Record<LoopStep, string> = {
    idle: "text-muted-foreground bg-muted/40",
    queued: "text-amber-200 bg-amber-500/15",
    approved: "text-primary bg-primary/15",
    completed: "text-emerald-300 bg-emerald-500/15",
  };

  return (
    <Tile className={className} badge="Sample">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center text-primary">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Action queue
          </div>
          <div className="font-display text-lg font-semibold">
            Reduce humidity
          </div>
        </div>
      </div>

      <div
        className={`mt-4 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${stateTone[step]}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
        {stateLabel[step]}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        Suggested: open passive vent, check dehumidifier. Verdant never
        executes — you approve, then you act.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {step === "idle" && (
          <span className="text-xs text-muted-foreground">
            Tap “Add to Action Queue” on the alert →
          </span>
        )}
        {step === "queued" && (
          <Button size="sm" onClick={onApprove} className="gap-1">
            <CheckCircle2 className="h-4 w-4" /> Approve
          </Button>
        )}
        {step === "approved" && (
          <Button size="sm" onClick={onComplete} className="gap-1">
            <CheckCircle2 className="h-4 w-4" /> Mark complete
          </Button>
        )}
        {step === "completed" && (
          <Button size="sm" variant="outline" onClick={onReset}>
            Reset demo
          </Button>
        )}
      </div>
    </Tile>
  );
}

function FollowupTile({
  className,
  step,
  reduceMotion,
}: {
  className?: string;
  step: LoopStep;
  reduceMotion: boolean;
}) {
  const visible = step === "completed";
  const motionCls = reduceMotion
    ? ""
    : "transition-all duration-500 ease-out";
  return (
    <Tile
      className={`${className} ${motionCls} ${
        visible ? "opacity-100 translate-y-0" : "opacity-50 translate-y-1"
      }`}
      badge={visible ? "Just now" : "Appears after completion"}
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/15 grid place-items-center text-emerald-300">
          <Droplets className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Diary follow-up
          </div>
          <div className="font-display text-lg font-semibold">
            {visible ? "Vent opened · RH trending down" : "Follow-up entry"}
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {visible
          ? "Auto-logged from your approved action — linked back to the alert and the snapshot. Your future self can read this."
          : "When you complete an action, Verdant writes a linked diary entry so the trail is never lost."}
      </p>
    </Tile>
  );
}

function ManifestoTile({ className }: { className?: string }) {
  return (
    <Tile className={className}>
      <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center text-primary">
        <Activity className="h-5 w-5" />
      </div>
      <div className="mt-4 font-display text-lg font-semibold leading-snug">
        Plant memory · Sensor truth · Cautious AI · Grower-approved action.
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Four principles, one loop. Nothing happens to your room without you
        saying so.
      </p>
    </Tile>
  );
}

function TimelineTile({ className }: { className?: string }) {
  const stages = [
    { label: "Seedling", day: "D1" },
    { label: "Veg", day: "D14" },
    { label: "Stretch", day: "D32" },
    { label: "Flower", day: "D45" },
    { label: "Ripening", day: "D62" },
    { label: "Harvest", day: "D74" },
  ];
  return (
    <Tile className={className} badge="Sample timeline">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center text-primary">
          <Camera className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Photo timeline
          </div>
          <div className="font-display text-lg font-semibold">
            One plant, from clone to harvest
          </div>
        </div>
      </div>
      <div className="relative">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-border" />
        <div className="relative grid grid-cols-3 sm:grid-cols-6 gap-3">
          {stages.map((s, i) => (
            <div key={s.label} className="flex flex-col items-center">
              <div
                className={`h-3 w-3 rounded-full border-2 ${
                  i < 2
                    ? "bg-primary border-primary"
                    : "bg-card border-border"
                }`}
              />
              <div className="mt-2 text-xs font-medium">{s.label}</div>
              <div className="text-[10px] text-muted-foreground">{s.day}</div>
            </div>
          ))}
        </div>
      </div>
    </Tile>
  );
}

/* ---------- hooks ---------- */

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  const mqRef = useRef<MediaQueryList | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mqRef.current = mq;
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}
