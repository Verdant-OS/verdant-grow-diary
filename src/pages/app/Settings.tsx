import { useVerdant, SafetyMode } from "@/store/verdant";
import { PageHeader } from "@/components/ui-bits";
import { Settings as SettingsIcon, Download, RotateCcw, ShieldCheck, Crown, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

const tiers = [
  { name: "Free", price: "$0", features: ["Up to 3 plants", "Diary, watering, feeding", "Manual snapshots"] },
  { name: "Grower", price: "$8/mo", features: ["Unlimited plants", "Calendar & reports", "Photo gallery"] },
  { name: "Pro", price: "$19/mo", features: ["AI Photo Diagnosis", "Ask My Grow", "Advanced reports"] },
  { name: "Controller", price: "$39/mo", features: ["Home Assistant sensors", "Action Queue", "Live device data"] },
  { name: "Business", price: "$99/mo", features: ["Customer Mode + QR", "SMS opt-ins", "Multi-workspace"] },
];

export default function Settings() {
  const v = useVerdant();

  function downloadJSON() {
    const blob = new Blob([v.exportAll()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `verdant-export-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Safety, export, and SaaS tier blueprint" icon={SettingsIcon}
        actions={<Button asChild variant="outline" className="gap-1.5"><Link to="/app/qa"><ClipboardCheck className="h-4 w-4" />MVP QA Checklist</Link></Button>} />

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-5">
          <h3 className="font-display font-semibold flex items-center gap-2 mb-3"><ShieldCheck className="h-4 w-4 text-primary" />Safety mode</h3>
          <p className="text-sm text-muted-foreground mb-4">Verdant cannot enable autopilot accidentally. Default is approval-required.</p>
          <RadioGroup value={v.safetyMode} onValueChange={(x: SafetyMode) => v.setSafetyMode(x)} className="space-y-2">
            {[
              ["observe", "Observe Only", "Verdant logs and reports but never suggests actions."],
              ["approval", "Approval Required", "Suggested actions go to the queue. You approve each one."],
              ["guardrailed", "Guardrailed (autopilot disabled)", "Autopilot UI present but disabled in this MVP."],
            ].map(([val, label, desc]) => (
              <label key={val} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 cursor-pointer hover:border-primary/40">
                <RadioGroupItem value={val} className="mt-1" />
                <div>
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-muted-foreground">{desc}</div>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>

        <div className="glass rounded-xl p-5">
          <h3 className="font-display font-semibold flex items-center gap-2 mb-3"><Download className="h-4 w-4 text-primary" />Export & backup</h3>
          <p className="text-sm text-muted-foreground mb-4">Download a JSON backup of plants, diary, watering, feeding, training, photos, snapshots, diagnoses, harvests, calendar events, and customer opt-ins. Secrets are never exported.</p>
          <div className="flex gap-2">
            <Button onClick={downloadJSON} className="gradient-leaf text-primary-foreground"><Download className="h-4 w-4 mr-1.5" />Export JSON</Button>
            <Button onClick={() => { if (confirm("Reset all local data?")) v.reset(); }} variant="outline"><RotateCcw className="h-4 w-4 mr-1.5" />Reset to demo</Button>
          </div>
        </div>

        <div className="glass rounded-xl p-5 lg:col-span-2">
          <h3 className="font-display font-semibold flex items-center gap-2 mb-3"><Crown className="h-4 w-4 text-primary" />SaaS tier blueprint</h3>
          <p className="text-sm text-muted-foreground mb-4">Pricing is a planning preview. All features are usable in MVP development.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {tiers.map(t => (
              <div key={t.name} className="rounded-xl border border-border/60 p-4 bg-card/40">
                <div className="font-display font-semibold">{t.name}</div>
                <div className="text-2xl font-display mt-1">{t.price}</div>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {t.features.map(f => <li key={f}>· {f}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">AI Diagnosis = Pro</Badge>
            <Badge variant="outline">Ask My Grow = Pro</Badge>
            <Badge variant="outline">Sensors / HA = Controller</Badge>
            <Badge variant="outline">Action Queue = Controller</Badge>
            <Badge variant="outline">QR/SMS/Customer = Business</Badge>
          </div>
        </div>
      </div>
    </>
  );
}
