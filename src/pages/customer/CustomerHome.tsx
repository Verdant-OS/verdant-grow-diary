import { Link } from "react-router-dom";
import { QrCode, Sprout } from "lucide-react";

const guides = [
  { slug: "og-kush-auto", name: "OG Kush Auto", blurb: "Classic OG aroma in an autoflower package. ~70 days seed to harvest." },
  { slug: "sour-diesel-auto", name: "Sour Diesel Auto", blurb: "Energetic citrus-fuel. Loves airflow and steady feeding." },
];

export default function CustomerHome() {
  return (
    <div>
      <div className="rounded-2xl p-8 mb-6 text-primary-foreground" style={{ background: "var(--gradient-hero)" }}>
        <h1 className="font-display text-3xl md:text-4xl font-semibold mb-2">Grow Like a Pro</h1>
        <p className="opacity-90 max-w-xl">Scan a strain QR to get a step-by-step guide tuned to that strain — week by week, with photo checkups and reminders.</p>
      </div>
      <h2 className="font-display text-xl font-semibold mb-3 flex items-center gap-2"><Sprout className="h-5 w-5 text-primary" />Featured strain guides</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {guides.map(g => (
          <Link key={g.slug} to={`/grow/${g.slug}`}
            className="rounded-xl border border-border bg-card p-5 hover:border-primary transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="font-display font-semibold text-lg">{g.name}</div>
              <QrCode className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">{g.blurb}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
