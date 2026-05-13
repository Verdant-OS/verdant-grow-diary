import { useState } from "react";
import { useVerdant } from "@/store/verdant";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { MessageCircle, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";

export default function SMSOptIns() {
  const v = useVerdant();
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [strain, setStrain] = useState(""); const [week, setWeek] = useState("");
  const [pref, setPref] = useState(""); const [consent, setConsent] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent || !name || !phone) return;
    v.addOptIn({ name, phone, plantStrain: strain, growWeek: +week || undefined, preference: pref, consent });
    setName(""); setPhone(""); setStrain(""); setWeek(""); setPref(""); setConsent(false);
  }

  return (
    <>
      <PageHeader title="SMS Opt-Ins" subtitle="Compliance-first reminders shell" icon={MessageCircle} />
      <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-warning mb-4 flex gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        Express written consent is required before any SMS is sent. Verdant does not send real SMS in this MVP.
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <form onSubmit={submit} className="glass rounded-xl p-5 space-y-3">
          <h3 className="font-display font-semibold">New opt-in</h3>
          <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} required /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Strain</Label><Input value={strain} onChange={e => setStrain(e.target.value)} /></div>
            <div><Label>Grow week</Label><Input value={week} onChange={e => setWeek(e.target.value)} /></div>
          </div>
          <div><Label>Preference</Label><Input placeholder="weekly tips, watering reminder..." value={pref} onChange={e => setPref(e.target.value)} /></div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={consent} onCheckedChange={(c) => setConsent(!!c)} className="mt-0.5" />
            <span>I confirm this person has given express written consent to receive SMS reminders.</span>
          </label>
          <Button type="submit" disabled={!consent} className="gradient-leaf text-primary-foreground">Save opt-in</Button>
        </form>
        <div className="glass rounded-xl p-5">
          <h3 className="font-display font-semibold mb-2">Stored opt-ins ({v.optIns.length})</h3>
          {v.optIns.length === 0 ? <EmptyState title="None yet" /> : (
            <div className="space-y-2">
              {v.optIns.map(o => (
                <div key={o.id} className="rounded-lg border border-border/40 p-3 text-sm">
                  <div className="flex justify-between"><span className="font-medium">{o.name}</span><span className="text-xs text-muted-foreground">{format(new Date(o.createdAt), "PP")}</span></div>
                  <div className="text-xs text-muted-foreground">{o.phone} · {o.plantStrain} · wk {o.growWeek ?? "?"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
