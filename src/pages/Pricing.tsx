import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Minus, Sparkles, ShieldCheck, Database, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { trackPricingEvent } from "@/lib/pricingAnalytics";

/**
 * Public pricing page for Verdant Pro and the Founder Lifetime Deal.
 *
 * Marketing-only. Does NOT query any private grow/plant/tent/sensor/alert
 * data and does not call ai-coach. Checkout is intentionally stubbed to
 * placeholder /billing routes until payments are wired.
 */

const FOUNDER_LIFETIME_LIMIT = 75;
const FOUNDER_LIFETIME_PRICE_USD = 129;
const PRO_MONTHLY_PRICE_USD = 12;
const PRO_ANNUAL_PRICE_USD = 115;

type Row = { label: string; free: boolean | string; pro: boolean | string };

const COMPARISON_ROWS: Row[] = [
  { label: "Plant profiles", free: true, pro: true },
  { label: "Basic grow diary", free: true, pro: true },
  { label: "Photo logs", free: true, pro: true },
  { label: "Manual notes", free: true, pro: true },
  { label: "Basic timeline", free: true, pro: true },
  { label: "Manual sensor entries", free: true, pro: true },
  { label: "Exports", free: "Limited", pro: "Advanced" },
  { label: "Cloud sync", free: false, pro: true },
  { label: "Automatic backups", free: false, pro: true },
  { label: "Multi-tent support", free: false, pro: true },
  { label: "Sensor snapshot history", free: false, pro: true },
  { label: "Longer grow history", free: false, pro: true },
  { label: "Better timeline filtering", free: false, pro: true },
  { label: "Priority support", free: false, pro: true },
  { label: "Early access to advanced grow reports", free: false, pro: true },
  { label: "Future Pro AI features as they stabilize", free: false, pro: true },
];

export default function Pricing() {
  useEffect(() => {
    trackPricingEvent("pricing_page_view");
  }, []);

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

      {/* Hero */}
      <section className="px-6 pt-10 pb-14 max-w-4xl mx-auto text-center">
        <p className="text-xs uppercase tracking-widest text-primary font-medium">
          Verdant Pro · Pricing
        </p>
        <h1 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight">
          Protect your grow history. Understand what changed. Make better decisions next run.
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
          Verdant is a grow room operating system for serious growers who want more than a notebook. Track plants, logs, photos, sensor snapshots, alerts, and AI-assisted grow history in one clean timeline — without locking yourself into one hardware brand.
        </p>
        <p className="mt-4 text-sm md:text-base text-primary font-medium">
          Plant memory. Sensor truth. Better decisions.
        </p>
      </section>

      {/* Pricing tier cards */}
      <section className="px-6 pb-10 max-w-6xl mx-auto grid gap-6 md:grid-cols-3">
        {/* Free */}
        <TierCard
          name="Free"
          price="$0"
          cadence="/ month"
          description="Start free. Build your grow diary and see if Verdant fits your workflow."
          bullets={[
            "Plant profiles",
            "Basic grow diary",
            "Photo logs",
            "Manual notes",
            "Basic timeline",
            "Limited exports",
            "Manual sensor entries",
          ]}
          cta={
            <Link to="/auth" className="block">
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                onClick={() => trackPricingEvent("pricing_cta_free_clicked")}
              >
                Start Free
              </Button>
            </Link>
          }
        />

        {/* Pro */}
        <TierCard
          name="Pro"
          price={`$${PRO_MONTHLY_PRICE_USD}`}
          cadence="/ month"
          highlighted
          badge="Most popular"
          description="Upgrade when Verdant becomes your real grow memory system."
          bullets={[
            "Everything in Free",
            "Cloud sync",
            "Automatic backups",
            "Multi-tent support",
            "Advanced exports",
            "Sensor snapshot history",
            "Longer grow history",
            "Better timeline filtering",
            "Priority support",
            "Early access to advanced grow reports",
            "Future Pro AI features as they stabilize",
          ]}
          footnote={`Or $${PRO_ANNUAL_PRICE_USD}/year — save vs. monthly.`}
          cta={
            <div className="flex flex-col gap-2">
              <Link to="/billing/pro-monthly" className="block">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => trackPricingEvent("pricing_cta_pro_monthly_clicked")}
                >
                  Upgrade to Pro — ${PRO_MONTHLY_PRICE_USD}/mo
                </Button>
              </Link>
              <Link to="/billing/pro-annual" className="block">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full"
                  onClick={() => trackPricingEvent("pricing_cta_pro_annual_clicked")}
                >
                  Go annual — ${PRO_ANNUAL_PRICE_USD}/year
                </Button>
              </Link>
            </div>
          }
        />

        {/* Founder Lifetime Offer */}
        <TierCard
          name="Founder Lifetime Offer"
          price={`$${FOUNDER_LIFETIME_PRICE_USD}`}
          cadence="one-time"
          founder
          badge={`First ${FOUNDER_LIFETIME_LIMIT} growers`}
          description="A limited early-supporter offer. Pay once and get full Pro access for the life of the product."
          bullets={[
            "Includes full Pro access — no monthly fee",
            "Lock in Pro at today's price",
            "Founder badge on your profile",
            "Direct line to the founder for feedback",
            "Early access to new Pro features",
          ]}
          cta={
            <Link to="/billing/founder-lifetime" className="block">
              <Button
                size="lg"
                className="w-full"
                onClick={() =>
                  trackPricingEvent("pricing_cta_founder_lifetime_clicked")
                }
              >
                Claim Founder Lifetime — ${FOUNDER_LIFETIME_PRICE_USD}
              </Button>
            </Link>
          }
          footnote={`Limited to the first ${FOUNDER_LIFETIME_LIMIT} early supporters. When they're claimed, this offer ends.`}
        />
      </section>

      {/* Founder Lifetime highlight band */}
      <section className="px-6 py-10 max-w-5xl mx-auto">
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-6 md:p-8 flex flex-col md:flex-row gap-6 md:items-center">
          <div className="h-12 w-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl md:text-2xl font-semibold">
              Founder Lifetime Offer — ${FOUNDER_LIFETIME_PRICE_USD} once, full Pro forever
            </h2>
            <p className="mt-2 text-sm md:text-base text-muted-foreground">
              Verdant is founder-built. This is a limited early-supporter offer for the first {FOUNDER_LIFETIME_LIMIT} growers who back the product early. Pay once, get full Pro access for the life of the product, and help shape what ships next. No hype, no countdown gimmicks — when the first {FOUNDER_LIFETIME_LIMIT} are claimed, the offer ends.
            </p>
          </div>
          <Link to="/billing/founder-lifetime" className="shrink-0">
            <Button
              size="lg"
              onClick={() =>
                trackPricingEvent("pricing_cta_founder_lifetime_clicked", {
                  source: "highlight_band",
                })
              }
            >
              Claim Founder Lifetime
            </Button>
          </Link>
        </div>
      </section>

      {/* Comparison table */}
      <section className="px-6 py-12 max-w-5xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center">
          Free vs Pro
        </h2>
        <p className="mt-3 text-sm text-muted-foreground text-center max-w-2xl mx-auto">
          The free tier is genuinely useful on its own. Pro is for growers who want cloud sync, deeper history, and more tents.
        </p>

        <div className="mt-8 overflow-hidden rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Feature</th>
                <th className="text-center font-medium px-4 py-3">Free</th>
                <th className="text-center font-medium px-4 py-3 text-primary">Pro</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label} className="border-t border-border/40">
                  <td className="px-4 py-3">{row.label}</td>
                  <td className="px-4 py-3 text-center">
                    <CellValue value={row.free} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CellValue value={row.pro} accent />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Trust / data ownership */}
      <section className="px-6 py-12 max-w-5xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center">
          Your grow. Your data. Your call.
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <TrustCard
            icon={<Database className="h-5 w-5" />}
            title="You own your grow history"
            body="Your logs, photos, and sensor snapshots belong to you. Pro includes advanced exports so you can take your full grow history with you anytime. Verdant does not sell your data."
          />
          <TrustCard
            icon={<Cpu className="h-5 w-5" />}
            title="Hardware-neutral"
            body="Verdant works with the gear you already own. Bring sensors over webhook, MQTT, Raspberry Pi bridge, or manual entry. No vendor lock-in. No forced ecosystem."
          />
          <TrustCard
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Grower stays in control"
            body="Verdant suggests, you decide. AI-assisted insights are cautious by design. Verdant does not control your equipment and never makes decisions for you."
          />
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-12 max-w-3xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center">
          Pricing FAQ
        </h2>
        <Accordion
          type="single"
          collapsible
          className="mt-6"
          onValueChange={(value) => {
            if (value) trackPricingEvent("pricing_faq_opened", { item: value });
          }}
        >
          <AccordionItem value="data-ownership">
            <AccordionTrigger>Who owns the grow data I put into Verdant?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              You do. Your grow logs, photos, and sensor snapshots are yours. Verdant does not sell your data. Pro includes advanced exports so you can take your full grow history with you whenever you want.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="free-forever">
            <AccordionTrigger>Is the Free tier really free?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Yes. Plant profiles, the basic grow diary, photo logs, manual notes, the basic timeline, and manual sensor entries are all included on Free. You can run a real grow on Free without paying.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="pro-what">
            <AccordionTrigger>What do I actually get with Pro?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Cloud sync, automatic backups, multi-tent support, advanced exports, sensor snapshot history, longer grow history, better timeline filtering, priority support, and early access to advanced grow reports. Pro AI features ship over time, only as they stabilize.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="founder-lifetime">
            <AccordionTrigger>How does the Founder Lifetime Offer work?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              ${FOUNDER_LIFETIME_PRICE_USD} once. You get full Pro access for the life of the product. This is a limited early-supporter offer, not a separate recurring plan. Limited to the first {FOUNDER_LIFETIME_LIMIT} buyers. When the first {FOUNDER_LIFETIME_LIMIT} are claimed, the offer ends. No fake countdowns and no expiring timers beyond that real limit.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="hardware">
            <AccordionTrigger>Do I need specific hardware?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              No. Verdant is hardware-neutral. You can log everything manually, import CSVs, or connect sensors over webhook, MQTT, ESP32, or a Raspberry Pi bridge. Bring the gear you already own.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="ai-safety">
            <AccordionTrigger>Does Verdant control my equipment or grow for me?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              No. Verdant does not control fans, lights, pumps, heaters, dehumidifiers, or any other equipment. AI-assisted insights are suggestions only — you approve or dismiss them. The grower stays in control.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="cancel">
            <AccordionTrigger>Can I cancel anytime?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Yes. Pro Monthly and Pro Annual can be canceled at any time. If you cancel, your grow history stays on your account and you keep read-only access to your logs.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-14 max-w-3xl mx-auto text-center">
        <h2 className="font-display text-2xl md:text-3xl font-semibold">
          Start free. Upgrade when Verdant becomes your real grow memory system.
        </h2>
        <p className="mt-3 text-muted-foreground">
          The free tier is built to be genuinely useful. Pro is for growers who want their full grow history backed up, synced, and easy to revisit.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/auth">
            <Button
              size="lg"
              variant="outline"
              onClick={() => trackPricingEvent("pricing_cta_free_clicked", { source: "footer" })}
            >
              Start Free
            </Button>
          </Link>
          <Link to="/billing/pro-monthly">
            <Button
              size="lg"
              onClick={() =>
                trackPricingEvent("pricing_cta_pro_monthly_clicked", { source: "footer" })
              }
            >
              Upgrade to Pro
            </Button>
          </Link>
        </div>
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

interface TierCardProps {
  name: string;
  price: string;
  cadence: string;
  description: string;
  bullets: string[];
  cta: React.ReactNode;
  highlighted?: boolean;
  founder?: boolean;
  badge?: string;
  footnote?: string;
}

function TierCard({
  name,
  price,
  cadence,
  description,
  bullets,
  cta,
  highlighted,
  founder,
  badge,
  footnote,
}: TierCardProps) {
  const [open, setOpen] = useState(false);
  void open;
  void setOpen;
  return (
    <div
      className={[
        "relative rounded-2xl border p-6 flex flex-col bg-card/40 backdrop-blur",
        founder
          ? "border-primary/60 ring-1 ring-primary/40 shadow-lg"
          : highlighted
            ? "border-primary/40 shadow-md"
            : "border-border/60",
      ].join(" ")}
    >
      {badge && (
        <span
          className={[
            "absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs rounded-full",
            founder
              ? "bg-primary text-primary-foreground"
              : "bg-primary/15 text-primary",
          ].join(" ")}
        >
          {badge}
        </span>
      )}

      <h3 className="font-display text-xl font-semibold">{name}</h3>
      <p className="mt-2 text-sm text-muted-foreground min-h-[2.5rem]">{description}</p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl md:text-4xl font-display font-bold">{price}</span>
        <span className="text-sm text-muted-foreground">{cadence}</span>
      </div>

      <ul className="mt-5 space-y-2 text-sm flex-1">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {footnote && (
        <p className="mt-4 text-xs text-muted-foreground">{footnote}</p>
      )}

      <div className="mt-6">{cta}</div>
    </div>
  );
}

function CellValue({ value, accent }: { value: boolean | string; accent?: boolean }) {
  if (value === true) {
    return (
      <Check
        className={["h-4 w-4 mx-auto", accent ? "text-primary" : "text-foreground"].join(" ")}
        aria-label="Included"
      />
    );
  }
  if (value === false) {
    return <Minus className="h-4 w-4 mx-auto text-muted-foreground/60" aria-label="Not included" />;
  }
  return <span className={accent ? "text-primary font-medium" : ""}>{value}</span>;
}

function TrustCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur p-6">
      <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
        {icon}
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
