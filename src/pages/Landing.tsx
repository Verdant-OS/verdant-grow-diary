import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth";
import BrandLogo from "@/components/BrandLogo";
import LeadCaptureForm from "@/components/LeadCaptureForm";


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
        {user ? (
          <Link to="/">
            <Button variant="outline" size="sm">Open dashboard</Button>
          </Link>
        ) : (
          <Link to="/auth">
            <Button variant="outline" size="sm">Sign in</Button>
          </Link>
        )}
      </header>

      <section className="px-6 pt-12 pb-20 max-w-4xl mx-auto text-center">
        <div className="flex justify-center mb-8">
          <BrandLogo size="hero" />
        </div>
        <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight">
          Verdant Grow Diary
        </h1>
        <p className="mt-3 text-lg md:text-xl text-primary font-medium">
          A diary-first Grow OS. The grower stays in control.
        </p>
        <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
          Verdant is a grow diary and cultivation command center. Capture grow
          logs, track plants and tents, and turn sensor data into safer
          insight — without handing control to a black box.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {user ? (
            <Link to="/">
              <Button size="lg">Open dashboard</Button>
            </Link>
          ) : (
            <Link to="/auth">
              <Button size="lg">Sign in</Button>
            </Link>
          )}
          <a href="#features">
            <Button size="lg" variant="outline">Learn more</Button>
          </a>
          <Link to="/hardware-integrations">
            <Button size="lg" variant="outline">Hardware integrations</Button>
          </Link>
          <Link to="/pricing">
            <Button size="lg" variant="outline">Pricing</Button>
          </Link>

        </div>
      </section>


      <section id="features" className="px-6 py-16 max-w-5xl mx-auto grid gap-6 md:grid-cols-2">
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
      </section>

      <section className="px-6 py-14 max-w-3xl mx-auto text-center">
        <h2 className="font-display text-2xl md:text-3xl font-semibold">
          Built for growers who want signal, not noise
        </h2>
        <p className="mt-4 text-muted-foreground">
          Verdant treats sensor data as ground truth and AI as a careful
          assistant. Every meaningful change requires a human in the loop.
          The grower stays in control.
        </p>
      </section>

      <section id="beta" className="px-6 py-16 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="font-display text-2xl md:text-3xl font-semibold">
            Join the Verdant beta
          </h2>
          <p className="mt-3 text-muted-foreground">
            Hardware partner? Contact Verdant about read-only integrations.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Verdant Grow Diary is currently in early build. Join the beta list
            or reach out about read-only hardware integrations. Grower stays
            in control. No blind automation.
          </p>
        </div>
        <LeadCaptureForm />
      </section>


      <footer className="px-6 py-10 border-t border-border/40 text-sm text-muted-foreground text-center">
        <p>
          Verdant Grow Diary · {" "}
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
