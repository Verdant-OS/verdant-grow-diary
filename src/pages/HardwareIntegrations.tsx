import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import LeadCaptureForm from "@/components/LeadCaptureForm";

/**
 * Public hardware-neutral integration page.
 *
 * Data-free. Does NOT read any private grow/plant/tent/alert/action data
 * and does not invoke ai-coach. Only existing public write path is the
 * lead capture form, defaulted to hardware_partner.
 */
export default function HardwareIntegrations() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/welcome" className="flex items-center gap-2">
          <BrandLogo size="md" showText />
        </Link>
        <Link to="/welcome">
          <Button variant="outline" size="sm">Back to home</Button>
        </Link>
      </header>

      <section className="px-6 pt-12 pb-12 max-w-4xl mx-auto text-center">
        <p className="text-xs uppercase tracking-widest text-primary font-medium">
          Hardware Integrations
        </p>
        <h1 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight">
          A hardware-neutral Grow OS
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
          Verdant Grow Diary is a hardware-neutral Grow OS.
        </p>
        <p className="mt-4 text-base text-muted-foreground max-w-2xl mx-auto">
          It turns grow logs, photos, environmental readings, alerts, and AI-assisted insights into better cultivation decisions — without taking control away from the grower.
        </p>
        <p className="mt-4 text-base text-muted-foreground max-w-2xl mx-auto">
          Read-only integrations are valuable. Verdant does not need full device control to create value. Grower stays in control. No blind automation.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href="#partner">
            <Button size="lg">Hardware partner? Contact Verdant</Button>
          </a>
          <Link to="/welcome">
            <Button size="lg" variant="outline">About Verdant</Button>
          </Link>
        </div>
      </section>

      <section className="px-6 py-10 max-w-5xl mx-auto grid gap-6 md:grid-cols-2">
        <Card title="Why hardware integrations matter">
          Sensors, controllers, and cameras already produce the ground
          truth of a grow. When Verdant can read that data, every diary
          entry, alert, and AI suggestion becomes more grounded — and the
          grower spends less time copy-pasting numbers into a notebook.
        </Card>
        <Card title="Ideal integration data">
          Temperature, humidity, VPD, CO₂, soil moisture, light state and
          schedule, runoff pH/EC, photos, and event timestamps. Read-only
          telemetry is enough. Verdant does not require write access to
          your equipment.
        </Card>
        <Card title="What Verdant adds">
          A diary-first workflow, plant and tent tracking, environment
          alerts with an immutable audit trail, an AI Coach that is
          cautious and suggest-only, and an approval-required Action
          Queue where every meaningful change needs a human in the loop.
        </Card>
        <Card title="Safe integration philosophy">
          Read first, suggest second, never execute on the grower's
          behalf. Verdant treats sensor data as ground truth and AI as a
          careful assistant. No blind automation. No silent device
          control. The grower stays in control at every step.
        </Card>
      </section>

      <section className="px-6 py-12 max-w-5xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center">
          Integration paths
        </h2>
        <p className="mt-3 text-center text-muted-foreground max-w-2xl mx-auto">
          Verdant supports a spectrum of read-only paths, from
          enterprise-grade APIs to a single CSV export.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATION_PATHS.map((p) => (
            <div
              key={p.title}
              className="rounded-xl border border-border/50 bg-card/40 backdrop-blur p-5"
            >
              <h3 className="font-display text-base font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-12 max-w-3xl mx-auto text-center">
        <h2 className="font-display text-2xl md:text-3xl font-semibold">
          Partner value
        </h2>
        <p className="mt-4 text-muted-foreground">
          Hardware partners reach growers who already log seriously and
          want their gear to be part of a complete cultivation record.
          Verdant promotes integrations that respect the grower's
          autonomy, never expose their data, and never automate their
          equipment without explicit approval.
        </p>
      </section>

      <section id="partner" className="px-6 py-16 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="font-display text-2xl md:text-3xl font-semibold">
            Hardware partner? Contact Verdant
          </h2>
          <p className="mt-3 text-muted-foreground">
            Tell us about your hardware and the read-only data you can
            share. We'll reply by email.
          </p>
        </div>
        <LeadCaptureForm defaultLeadType="hardware_partner" />
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

const INTEGRATION_PATHS = [
  {
    title: "Open API",
    body: "A documented read API for partners who want a first-class integration with structured telemetry and event ingestion.",
  },
  {
    title: "Webhooks",
    body: "Push readings and events to Verdant as they happen. Lightweight, asynchronous, and easy to retry.",
  },
  {
    title: "CSV import / export",
    body: "Bring historical logs or sensor data in by file. Useful for growers migrating from spreadsheets or proprietary apps.",
  },
  {
    title: "MQTT",
    body: "Subscribe to topic streams from existing controllers or DIY rigs. Read-only by default; no outbound control.",
  },
  {
    title: "Home " + "Assistant",
    body: "Forward sensor entities from a Home" + " Assistant instance. Use the integrations growers already trust.",
  },

  {
    title: "Raspberry Pi bridge",
    body: "A small read-only bridge that streams local sensor and camera data to Verdant without exposing the device to the internet.",
  },
  {
    title: "Manual fallback",
    body: "If a sensor cannot be integrated, the grower can always log readings by hand. Manual entries are first-class data in Verdant.",
  },
];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur p-6">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}
