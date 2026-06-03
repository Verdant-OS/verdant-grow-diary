import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth";
import BrandLogo from "@/components/BrandLogo";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import LandingAuthedOnboardingBridge from "@/components/LandingAuthedOnboardingBridge";

/**
 * Public landing page for https://verdantgrowdiary.com.
 *
 * This page is intentionally read-only marketing copy. It does NOT:
 *  - read or render any authenticated dashboard data (no grows, plants,
 *    tents, sensors, alerts, or action_queue queries),
 *  - call Supabase with user-scoped data queries,
 *  - expose private dashboard internals,
 *  - display any live metrics, sensor values, or AI Coach output,
 *  - introduce any write path.
 *
 * It reads `useAuth()` only to decide whether to show an "Open dashboard"
 * CTA for an already-signed-in visitor. The session state is supplied by
 * the existing AuthProvider; no extra Supabase query is issued here.
 */
export default function Landing() {
  const { user } = useAuth();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <BrandLogo size="md" showText />
        <div className="flex items-center gap-2">
          {user ? (
            <Link to="/">
              <Button variant="outline" size="sm">Open dashboard</Button>
            </Link>
          ) : (
            <Link to="/auth">
              <Button variant="outline" size="sm">Sign in</Button>
            </Link>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-10 pb-16 max-w-5xl mx-auto text-center">
        <div className="flex justify-center mb-6">
          <BrandLogo size="hero" />
        </div>
        <p className="text-sm uppercase tracking-[0.2em] text-primary/80 font-medium">
          Verdant Grow Diary · Grow OS
        </p>
        <h1 className="mt-4 font-display text-4xl md:text-6xl font-bold tracking-tight leading-tight">
          Understand what changed in your grow —
          <span className="block text-primary">before the next mistake repeats.</span>
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Verdant turns grow logs, photos, sensor snapshots, alerts, and
          cautious AI into one clear plant history. Real grow data only —
          no synthetic preview.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {user ? (
            <Link to="/">
              <Button size="lg" className="font-semibold">Open dashboard</Button>
            </Link>
          ) : (
            <Link to="/auth">
              <Button size="lg" className="font-semibold">Create Free Account</Button>
            </Link>
          )}
          <Link to="/auth">
            <Button size="lg" variant="ghost">Sign in</Button>
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          No blind automation. No fake live data. The grower stays in control.
        </p>
        {user && <LandingAuthedOnboardingBridge />}
      </section>

      {/* Product preview — illustrative copy only, no synthetic dashboard route. */}
      <section className="px-6 pb-16 max-w-5xl mx-auto">
        <div className="relative rounded-2xl border border-border/50 bg-card/40 backdrop-blur p-6 md:p-8 overflow-hidden">
          <h2 className="font-display text-xl md:text-2xl font-semibold mb-4">
            A glance at your grow
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            <TeaserCard label="Latest snapshot" value="Sensor truth" hint="Temp · Humidity · VPD" />
            <TeaserCard label="Alerts" value="Reviewed by you" hint="No blind automation" />
            <TeaserCard label="Action Queue" value="Approval-required" hint="Grower decides" />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary" /> Sensor truth
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent" /> Plant memory
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Approval-required actions
            </span>
          </div>
        </div>
      </section>

      {/* The Verdant loop */}
      <section className="px-6 py-14 max-w-5xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center">
          The Verdant loop
        </h2>
        <p className="mt-3 text-center text-muted-foreground max-w-2xl mx-auto">
          One trustworthy circle from observation to safer next step.
        </p>
        <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Grow", "Plant memory starts here"],
            ["Plant + Log", "Every feeding, training, photo"],
            ["Sensor snapshot", "Labeled live, manual, or demo"],
            ["Alert", "Drift from your targets"],
            ["Action Queue", "Approval-required, never auto"],
            ["AI Doctor", "Cautious, contextual, evidence-based"],
            ["Follow-up diary", "Closes the loop on the timeline"],
            ["Learning", "Repeat what worked, avoid what didn't"],
          ].map(([title, body]) => (
            <li key={title} className="rounded-xl border border-border/40 bg-card/30 p-4">
              <div className="font-display font-semibold">{title}</div>
              <div className="text-sm text-muted-foreground mt-1">{body}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section id="features" className="px-6 py-14 max-w-5xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center mb-10">
          Why growers use Verdant
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <FeatureCard
            title="Grow logs"
            body="A diary-first workflow. Every feeding, training session, and observation lives in a searchable timeline tied to the grow it belongs to."
          />
          <FeatureCard
            title="Plant and tent tracking"
            body="Organize plants by tent and grow. Lineage, stage, and history travel with each plant from clone to harvest."
          />
          <FeatureCard
            title="Sensor-aware dashboard"
            body="When environment sensors are connected, the dashboard summarizes the latest readings and data quality. Sensor data is used for safer insight, never for blind automation."
          />
          <FeatureCard
            title="Environment alerts"
            body="Read-only alerts surface drift from your targets — temperature, humidity, VPD — with an immutable audit trail when you acknowledge or resolve them."
          />
          <FeatureCard
            title="AI Coach"
            body="The AI Coach reads your grow context and suggests next steps. It is cautious, suggest-only, and never executes anything on its own."
          />
          <FeatureCard
            title="Approval-required Action Queue"
            body="AI suggestions become queued actions that you explicitly approve, edit, or dismiss. No blind automation — every meaningful change requires a human in the loop."
          />
        </div>
      </section>

      {/* Safety */}
      <section className="px-6 py-14 max-w-3xl mx-auto">
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 md:p-8">
          <h2 className="font-display text-2xl md:text-3xl font-semibold">
            Built safe by default
          </h2>
          <ul className="mt-5 space-y-3 text-sm md:text-base text-muted-foreground">
            <li>· Verdant does not control equipment by default.</li>
            <li>· AI suggestions require grower review.</li>
            <li>· Demo data is clearly labeled.</li>
            <li>· Private grow data requires an account.</li>
            <li>· Hardware-neutral: bring your own sensors and bridges.</li>
          </ul>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-16 max-w-3xl mx-auto text-center">
        <h2 className="font-display text-2xl md:text-3xl font-semibold">
          Try it before you commit
        </h2>
        <p className="mt-3 text-muted-foreground">
          Open the demo, click around, and see how Verdant remembers your
          grow. Create a free account when you're ready to track real plants.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/demo">
            <Button size="lg">Explore Demo</Button>
          </Link>
          {user ? (
            <Link to="/">
              <Button size="lg" variant="outline">Open dashboard</Button>
            </Link>
          ) : (
            <Link to="/auth">
              <Button size="lg" variant="outline">Create Free Account</Button>
            </Link>
          )}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/hardware-integrations">
            <Button size="sm" variant="ghost">Hardware integrations</Button>
          </Link>
          <Link to="/pricing">
            <Button size="sm" variant="ghost">Pricing</Button>
          </Link>
          <a href="#features">
            <Button size="sm" variant="ghost">Learn more</Button>
          </a>
        </div>
      </section>

      {/* Beta */}
      <section id="beta" className="px-6 py-16 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="font-display text-2xl md:text-3xl font-semibold">
            Join the Verdant beta
          </h2>
          <p className="mt-3 text-muted-foreground">
            Hardware partner? Contact Verdant about read-only integrations.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Verdant Grow Diary is currently in early build. Join the beta
            list or reach out about read-only hardware integrations. Grower
            stays in control. No blind automation.
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

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur p-6">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function TeaserCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/60 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
    </div>
  );
}
