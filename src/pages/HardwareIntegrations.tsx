import { useEffect } from "react";
import { Link } from "react-router-dom";
import LegalFooterLinks from "@/components/LegalFooterLinks";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  SENSOR_SOURCE_KINDS,
  SENSOR_SOURCE_LEGEND,
  SENSOR_SOURCE_SHORT_LABEL,
} from "@/constants/sensorSourceLabels";
import { buildAttributedSignupPath } from "@/lib/signupAcquisitionRules";
import { trackPricingEvent } from "@/lib/pricingAnalytics";

const CSV_HISTORY_SIGNUP_PATH = buildAttributedSignupPath({ source: "csv_history" });

/**
 * Public hardware-neutral integration page.
 *
 * Data-free. Does NOT read any private grow/plant/tent/alert/action data
 * and does not invoke ai-coach. Only existing public write path is the
 * lead capture form, defaulted to hardware_partner.
 */
export default function HardwareIntegrations() {
  usePageSeo({
    title: "Sensor & Hardware Integrations | Verdant Grow Diary",
    description:
      "Hardware-neutral Grow OS. Connect Ecowitt, ESP32, MQTT, webhook, or Raspberry Pi sensors read-only, or import CSVs. Bring your own gear — the grower stays in control.",
    path: "/hardware-integrations",
  });

  useEffect(() => {
    trackPricingEvent("csv_history_page_view", { source: "csv_history" });
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/welcome" className="flex items-center gap-2">
          <BrandLogo size="md" showText />
        </Link>
        <Link to="/welcome">
          <Button variant="outline" size="sm">
            Back to home
          </Button>
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
          It turns grow logs, photos, environmental readings, alerts, and AI-assisted insights into
          better cultivation decisions — without taking control away from the grower.
        </p>
        <p className="mt-4 text-base text-muted-foreground max-w-2xl mx-auto">
          Read-only integrations are valuable. Verdant does not need full device control to create
          value. Grower stays in control. No blind automation.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to={CSV_HISTORY_SIGNUP_PATH}
            data-testid="csv-history-signup-cta-hero"
            onClick={() =>
              trackPricingEvent("csv_history_signup_clicked", {
                source: "csv_history",
                item: "hero",
              })
            }
          >
            <Button size="lg">Bring in my grow history</Button>
          </Link>
          <a href="#partner">
            <Button size="lg" variant="outline">
              Hardware partner? Contact Verdant
            </Button>
          </a>
        </div>
      </section>

      <section className="px-6 pt-2 max-w-5xl mx-auto text-center">
        <h2 className="font-display text-2xl md:text-3xl font-semibold">Integration benefits</h2>
      </section>

      <section className="px-6 py-10 max-w-5xl mx-auto grid gap-6 md:grid-cols-2">
        <Card title="Why hardware integrations matter">
          Sensors, controllers, and cameras already produce the ground truth of a grow. When Verdant
          can read that data, every diary entry, alert, and AI suggestion becomes more grounded —
          and the grower spends less time copy-pasting numbers into a notebook.
        </Card>
        <Card title="Ideal integration data">
          Temperature, humidity, VPD, CO₂, soil moisture, light state and schedule, runoff pH/EC,
          photos, and event timestamps. Read-only telemetry is enough. Verdant does not require
          write access to your equipment.
        </Card>
        <Card title="What Verdant adds">
          A diary-first workflow, plant and tent tracking, environment alerts with an immutable
          audit trail, an AI Coach that is cautious and suggest-only, and an approval-required
          Action Queue where every meaningful change needs a human in the loop.
        </Card>
        <Card title="Safe integration philosophy">
          Read first, suggest second, never execute on the grower's behalf. Verdant treats sensor
          data as ground truth and AI as a careful assistant. No blind automation. No silent device
          control. The grower stays in control at every step.
        </Card>
      </section>

      <section className="px-6 py-12 max-w-5xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center">
          Integration paths
        </h2>
        <p className="mt-3 text-center text-muted-foreground max-w-2xl mx-auto">
          Verdant supports a spectrum of read-only paths, from enterprise-grade APIs to a single CSV
          export.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATION_PATHS.map((p) => (
            <div
              key={p.title}
              className="rounded-xl border border-border/50 bg-card/40 backdrop-blur p-5"
            >
              <h3 className="font-display text-base font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="csv-history" className="px-6 py-12 max-w-5xl mx-auto">
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-6 py-8 md:px-10 md:py-10">
          <p className="text-xs uppercase tracking-widest text-primary font-medium">
            For growers with data already
          </p>
          <h2 className="mt-3 font-display text-2xl md:text-3xl font-semibold">
            Your grow history should not stay trapped in another app
          </h2>
          <p className="mt-4 max-w-3xl text-muted-foreground leading-relaxed">
            Create a free account, set up one grow and tent, then import an AC Infinity export or
            another environment CSV from Sensor Data. CSV import and basic logging are free.
          </p>
          <p className="mt-3 max-w-3xl text-muted-foreground leading-relaxed">
            Verdant keeps every imported reading source-labeled as CSV history — never live
            telemetry — and places it alongside your diary and photos. AI Doctor can use that
            history as read-only background context while still distinguishing it from current
            manual entries or live telemetry. It never creates an action automatically.
          </p>
          <ol
            className="mt-6 grid gap-3 text-sm sm:grid-cols-3"
            aria-label="CSV history setup steps"
          >
            <li className="rounded-xl border border-border/60 bg-background/70 p-4">
              <span className="font-semibold text-foreground">1. Create your free account</span>
              <span className="mt-1 block text-muted-foreground">
                No hardware replacement required.
              </span>
            </li>
            <li className="rounded-xl border border-border/60 bg-background/70 p-4">
              <span className="font-semibold text-foreground">2. Add one grow and tent</span>
              <span className="mt-1 block text-muted-foreground">
                Give the history a truthful home.
              </span>
            </li>
            <li className="rounded-xl border border-border/60 bg-background/70 p-4">
              <span className="font-semibold text-foreground">3. Import from Sensor Data</span>
              <span className="mt-1 block text-muted-foreground">
                Review rows before anything is saved.
              </span>
            </li>
          </ol>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to={CSV_HISTORY_SIGNUP_PATH}
              data-testid="csv-history-signup-cta-section"
              onClick={() =>
                trackPricingEvent("csv_history_signup_clicked", {
                  source: "csv_history",
                  item: "csv_history_section",
                })
              }
            >
              <Button size="lg">Create a free account</Button>
            </Link>
            <Link to="/how-ai-doctor-works">
              <Button size="lg" variant="outline">
                See how AI Doctor uses context
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section
        id="sensor-source-labels"
        data-testid="sensor-source-legend"
        className="px-6 py-12 max-w-4xl mx-auto"
      >
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center">
          Sensor source labels
        </h2>
        <p className="mt-3 text-center text-muted-foreground max-w-2xl mx-auto">
          Verdant uses source labels on every reading so growers always know what data they are
          looking at. CSV and historical imports are never promoted to live. Demo data is never
          shown as live. Stale or invalid telemetry is never treated as healthy or current.
        </p>
        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          {SENSOR_SOURCE_KINDS.map((kind) => (
            <div
              key={kind}
              data-testid={`sensor-source-legend-item-${kind}`}
              className="rounded-xl border border-border/50 bg-card/40 backdrop-blur p-5"
            >
              <dt className="font-display text-base font-semibold">
                {SENSOR_SOURCE_SHORT_LABEL[kind]}
              </dt>
              <dd className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {SENSOR_SOURCE_LEGEND[kind]}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/how-ai-doctor-works" className="underline hover:text-foreground">
            See how AI Doctor uses source-labeled context
          </Link>
        </p>
      </section>

      <section className="px-6 py-12 max-w-3xl mx-auto text-center">
        <h2 className="font-display text-2xl md:text-3xl font-semibold">Partner value</h2>
        <p className="mt-4 text-muted-foreground">
          Hardware partners reach growers who already log seriously and want their gear to be part
          of a complete cultivation record. Verdant promotes integrations that respect the grower's
          autonomy, never expose their data, and never automate their equipment without explicit
          approval.
        </p>
      </section>

      <section id="partner" className="px-6 py-16 max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="font-display text-2xl md:text-3xl font-semibold">
            Hardware partner? Contact Verdant
          </h2>
          <p className="mt-3 text-muted-foreground">
            Tell us about your hardware and the read-only data you can share. We'll reply by email.
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
        <LegalFooterLinks className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground" />
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
    body:
      "Forward sensor entities from a Home" +
      " Assistant instance. Use the integrations growers already trust.",
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
