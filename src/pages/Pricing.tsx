import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { useAuth } from "@/store/auth";
import { trackPricingEvent } from "@/lib/pricingAnalytics";

/* ─────────────────── Data ─────────────────── */

const FREE_FEATURES = [
  "Plant profiles",
  "Basic grow diary",
  "Photo logs",
  "Manual notes",
  "Basic timeline",
  "Limited exports",
  "Manual sensor entries",
];

const PRO_FEATURES = [
  "Cloud sync",
  "Automatic backups",
  "Multi-tent support",
  "Advanced exports",
  "Priority support",
  "Longer grow history",
  "Sensor snapshot history",
  "Better timeline filtering",
  "Early access to advanced grow reports",
  "Future Pro AI features as they stabilize",
];

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "What happens to my data if I cancel Pro?",
    a: "You keep all your data. Verdant never deletes your grow history. You'll lose access to cloud sync and backups, but your local data remains yours.",
  },
  {
    q: "Do you sell my data?",
    a: "Never. Your grow data belongs to you. We do not sell, share, or monetize user data in any form.",
  },
  {
    q: "Does Verdant control my equipment?",
    a: "No. Verdant is a read-only observation and diary platform. It never sends commands to hardware. The grower stays in control.",
  },
  {
    q: "What does 'hardware neutral' mean?",
    a: "Verdant works with sensor data from any brand. You're never locked into one hardware ecosystem.",
  },
  {
    q: "Is the Founder Lifetime Deal really limited?",
    a: "Yes. Only the first 75 buyers get the $129 one-time lifetime deal. Once they're gone, the offer closes permanently.",
  },
  {
    q: "What AI features are included?",
    a: "Pro includes early access to advanced grow reports and future AI features as they stabilize. AI assists with observations and suggestions — it does not make decisions or take actions for you.",
  },
];

/* ─────────────────── Page ─────────────────── */

export default function Pricing() {
  const { user } = useAuth();

  useEffect(() => {
    trackPricingEvent("pricing_page_view");
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/welcome">
          <BrandLogo size="md" showText />
        </Link>
        {user ? (
          <Link to="/">
            <Button variant="outline" size="sm">
              Open dashboard
            </Button>
          </Link>
        ) : (
          <Link to="/auth">
            <Button variant="outline" size="sm">
              Sign in
            </Button>
          </Link>
        )}
      </header>

      {/* Hero */}
      <section className="px-6 pt-12 pb-16 max-w-4xl mx-auto text-center">
        <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight">
          Protect your grow history. Understand what changed. Make better decisions next run.
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-3xl mx-auto">
          Verdant is a grow room operating system for serious growers who want more than a notebook.
          Track plants, logs, photos, sensor snapshots, alerts, and AI-assisted grow history in one
          clean timeline — without locking yourself into one hardware brand.
        </p>
        <p className="mt-4 text-sm font-medium text-primary">
          Plant memory. Sensor truth. Better decisions.
        </p>
      </section>

      {/* Pricing Cards */}
      <section className="px-6 pb-20 max-w-6xl mx-auto">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Free */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-xl">Free</CardTitle>
              <CardDescription>For growers getting started</CardDescription>
              <p className="mt-2 text-3xl font-bold">$0</p>
              <p className="text-sm text-muted-foreground">forever</p>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-2">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Link to="/auth" className="w-full">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => trackPricingEvent("pricing_cta_free_clicked")}
                >
                  Start Free
                </Button>
              </Link>
            </CardFooter>
          </Card>

          {/* Pro Monthly */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-xl">Pro Monthly</CardTitle>
              <CardDescription>Full power, month-to-month</CardDescription>
              <p className="mt-2 text-3xl font-bold">$12</p>
              <p className="text-sm text-muted-foreground">/month</p>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-2">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Link to="/auth" className="w-full">
                <Button
                  className="w-full"
                  onClick={() => trackPricingEvent("pricing_cta_pro_monthly_clicked")}
                >
                  Upgrade to Pro
                </Button>
              </Link>
            </CardFooter>
          </Card>

          {/* Pro Annual */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-xl">Pro Annual</CardTitle>
              <CardDescription>Save with yearly billing</CardDescription>
              <p className="mt-2 text-3xl font-bold">$115</p>
              <p className="text-sm text-muted-foreground">/year</p>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-2">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Link to="/auth" className="w-full">
                <Button
                  className="w-full"
                  onClick={() => trackPricingEvent("pricing_cta_pro_annual_clicked")}
                >
                  Upgrade to Pro
                </Button>
              </Link>
            </CardFooter>
          </Card>

          {/* Founder Lifetime */}
          <Card className="flex flex-col border-primary ring-2 ring-primary/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl">Founder Lifetime</CardTitle>
                <Badge variant="secondary">Limited</Badge>
              </div>
              <CardDescription>One-time payment, Pro forever</CardDescription>
              <p className="mt-2 text-3xl font-bold">$129</p>
              <p className="text-sm text-muted-foreground">one-time</p>
              <p className="text-xs text-muted-foreground mt-1">First 75 buyers only</p>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-2">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
                <li className="flex items-start gap-2 text-sm font-medium">
                  <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                  <span>Lifetime access — no recurring payments</span>
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link to="/auth" className="w-full">
                <Button
                  className="w-full"
                  onClick={() => trackPricingEvent("pricing_cta_founder_lifetime_clicked")}
                >
                  Claim Founder Lifetime
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      </section>

      {/* Free vs Pro Comparison Table */}
      <section className="px-6 pb-16 max-w-4xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center mb-8">
          Free vs Pro
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-3 px-4 text-left font-medium">Feature</th>
                <th className="py-3 px-4 text-center font-medium">Free</th>
                <th className="py-3 px-4 text-center font-medium">Pro</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Plant profiles", true, true],
                ["Basic grow diary", true, true],
                ["Photo logs", true, true],
                ["Manual notes", true, true],
                ["Basic timeline", true, true],
                ["Limited exports", true, false],
                ["Manual sensor entries", true, true],
                ["Cloud sync", false, true],
                ["Automatic backups", false, true],
                ["Multi-tent support", false, true],
                ["Advanced exports", false, true],
                ["Priority support", false, true],
                ["Longer grow history", false, true],
                ["Sensor snapshot history", false, true],
                ["Better timeline filtering", false, true],
                ["Early access to advanced grow reports", false, true],
                ["Future Pro AI features", false, true],
              ].map(([feature, free, pro]) => (
                <tr key={feature as string} className="border-b border-border/40">
                  <td className="py-2 px-4">{feature as string}</td>
                  <td className="py-2 px-4 text-center">
                    {free ? (
                      <Check className="h-4 w-4 inline text-primary" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 px-4 text-center">
                    {pro ? (
                      <Check className="h-4 w-4 inline text-primary" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Trust / Data Ownership */}
      <section className="px-6 pb-16 max-w-4xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center mb-6">
          Your data. Your grows. Your control.
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border/50 bg-card/40 p-6 text-center">
            <h3 className="font-semibold mb-2">Data ownership</h3>
            <p className="text-sm text-muted-foreground">
              Your grow data belongs to you. We never sell, share, or monetize it.
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/40 p-6 text-center">
            <h3 className="font-semibold mb-2">Hardware neutral</h3>
            <p className="text-sm text-muted-foreground">
              Works with any sensors. Never locked into one brand or ecosystem.
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/40 p-6 text-center">
            <h3 className="font-semibold mb-2">No blind automation</h3>
            <p className="text-sm text-muted-foreground">
              Verdant observes and suggests. It never controls equipment or makes decisions for you.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 pb-20 max-w-3xl mx-auto">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-center mb-8">
          Frequently asked questions
        </h2>
        <Accordion type="single" collapsible className="w-full">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger onClick={() => trackPricingEvent("pricing_faq_opened")}>
                {item.q}
              </AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Footer */}
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
