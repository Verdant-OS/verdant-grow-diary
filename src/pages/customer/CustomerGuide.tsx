import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Camera, ChevronLeft, AlertTriangle, ShieldCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useVerdant } from "@/store/verdant";

const guides: Record<string, { name: string; weeks: { week: number; title: string; what: string; water: string }[]; mistakes: string[] }> = {
  "og-kush-auto": {
    name: "OG Kush Auto",
    weeks: [
      { week: 1, title: "Sprout & seedling", what: "Keep humidity 65-70%, light low.", water: "Mist soil only — small sips." },
      { week: 2, title: "Early veg", what: "Begin fan exposure, no nutes yet.", water: "Water when top 1\" dry." },
      { week: 3, title: "Veg push", what: "Light defoliation only if dense.", water: "Water + light feed at half strength." },
      { week: 4, title: "Preflower", what: "Watch for first pistils. Avoid topping.", water: "Steady waterings, capture runoff if coco." },
      { week: 5, title: "Stretch", what: "Bloom feed, support stems.", water: "Increase volume slightly." },
      { week: 6, title: "Bud development", what: "Defoliate sparingly. Watch trichomes.", water: "Maintain pH 6.0–6.3 (soil) / 5.8 (coco)." },
      { week: 7, title: "Late flower", what: "Begin flushing if desired.", water: "Reduce nutrients, plain water." },
      { week: 8, title: "Harvest window", what: "Check trichomes daily.", water: "Final flush. Dark period optional." },
    ],
    mistakes: ["Topping autoflowers past week 3", "Heavy defoliation late flower", "Overwatering small pots", "Skipping runoff checks in coco"],
  },
  "sour-diesel-auto": {
    name: "Sour Diesel Auto",
    weeks: [
      { week: 1, title: "Sprout & seedling", what: "Gentle airflow, RH 65%+.", water: "Light mist only." },
      { week: 2, title: "Veg ramp", what: "Tall, stretchy growth — train low.", water: "Light watering with low EC." },
      { week: 3, title: "Veg push", what: "LST gentle bends only.", water: "EC 1.0–1.2." },
      { week: 4, title: "Preflower", what: "Strong odor begins. Increase carbon filtration.", water: "EC 1.4." },
      { week: 5, title: "Stretch", what: "Branches double — support them.", water: "EC 1.6–1.8." },
      { week: 6, title: "Bud build", what: "Watch humidity for bud rot risk.", water: "Maintain pH 6.1." },
      { week: 7, title: "Late flower", what: "Begin tapering nutrients.", water: "Plain water final week." },
      { week: 8, title: "Harvest", what: "Check trichomes — milky to amber.", water: "Stop feeding fully." },
    ],
    mistakes: ["High humidity in late flower", "Skipping defoliation when too bushy", "Underfeeding during stretch"],
  },
};

export default function CustomerGuide() {
  const { slug } = useParams<{ slug: string }>();
  const g = slug ? guides[slug] : undefined;
  const v = useVerdant();
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [week, setWeek] = useState(""); const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);

  if (!g) return <div>Guide not found. <Link to="/grow" className="text-primary">Back</Link></div>;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent || !name || !phone) return;
    v.addOptIn({ name, phone, plantStrain: g.name, growWeek: +week || undefined, preference: "weekly tips", consent });
    setDone(true); setName(""); setPhone(""); setWeek(""); setConsent(false);
  }

  return (
    <div>
      <Link to="/grow" className="text-xs text-muted-foreground inline-flex items-center gap-1 mb-3"><ChevronLeft className="h-3 w-3" />All strains</Link>
      <div className="rounded-2xl p-6 mb-6 text-primary-foreground" style={{ background: "var(--gradient-hero)" }}>
        <h1 className="font-display text-3xl font-semibold">{g.name}</h1>
        <p className="opacity-90 mt-1">A week-by-week grow guide. Tap a week to see what to do.</p>
      </div>

      <div className="space-y-2 mb-6">
        {g.weeks.map(w => (
          <details key={w.week} className="rounded-xl border border-border bg-card p-4">
            <summary className="cursor-pointer font-display font-semibold">Week {w.week} · {w.title}</summary>
            <div className="mt-2 text-sm space-y-1">
              <div><span className="text-muted-foreground">What to do: </span>{w.what}</div>
              <div><span className="text-muted-foreground">Watering: </span>{w.water}</div>
            </div>
          </details>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 mb-4">
        <h3 className="font-display font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" />Common mistakes</h3>
        <ul className="text-sm space-y-1">{g.mistakes.map(m => <li key={m}>· {m}</li>)}</ul>
      </div>

      <Button className="w-full mb-4 gap-2" variant="outline"><Camera className="h-4 w-4" />Photo checkup (coming soon)</Button>

      <form onSubmit={submit} className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="font-display font-semibold flex items-center gap-2"><Send className="h-4 w-4 text-primary" />SMS reminders</h3>
        <p className="text-xs text-muted-foreground flex items-start gap-1.5"><ShieldCheck className="h-3 w-3 mt-0.5 shrink-0" />Express consent required. We do not send SMS during MVP — your opt-in is stored locally.</p>
        {done && <div className="rounded-lg bg-primary/10 text-primary text-sm p-2">Thanks! You're on the list.</div>}
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} required /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} required /></div>
        </div>
        <div><Label>Current grow week</Label><Input value={week} onChange={e => setWeek(e.target.value)} /></div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={consent} onCheckedChange={(c) => setConsent(!!c)} className="mt-0.5" />
          <span>I consent to receive SMS grow reminders.</span>
        </label>
        <Button type="submit" disabled={!consent} className="w-full">Sign me up</Button>
      </form>
    </div>
  );
}
