import { useState, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, FlaskConical, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface LabTestRow {
  id: string;
  plant_id: string;
  tested_at: string;
  thca_percent: number | null;
  thc_percent: number | null;
  cbda_percent: number | null;
  cbd_percent: number | null;
  lab_name: string | null;
  plants: {
    name: string;
    strain: string;
  };
}

export default function LabTests() {
  const { user } = useAuth();
  const [tests, setTests] = useState<LabTestRow[]>([]);
  const [plants, setPlants] = useState<{ id: string; name: string; strain: string }[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    plant_id: "",
    lab_name: "",
    thca_percent: "",
    thc_percent: "",
    cbd_percent: ""
  });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [testsRes, plantsRes] = await Promise.all([
      supabase
        .from("lab_tests")
        .select("id, plant_id, tested_at, thca_percent, thc_percent, cbda_percent, cbd_percent, lab_name, plants(name, strain)")
        .eq("user_id", user.id)
        .order("tested_at", { ascending: false }),
      supabase
        .from("plants")
        .select("id, name, strain")
        .eq("user_id", user.id)
        .eq("is_archived", false)
    ]);
    
    if (testsRes.error) toast.error(testsRes.error.message);
    if (plantsRes.error) toast.error(plantsRes.error.message);
    
    // Type casting because the inner join returns a nested object or array depending on relation.
    // In Supabase standard joins, a foreign key reference to one row returns an object.
    setTests((testsRes.data ?? []) as unknown as LabTestRow[]);
    setPlants((plantsRes.data ?? []) as { id: string; name: string; strain: string }[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!form.plant_id) {
      toast.error("Please select a plant");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("lab_tests").insert({
      user_id: user.id,
      plant_id: form.plant_id,
      lab_name: form.lab_name.trim() || null,
      thca_percent: form.thca_percent ? parseFloat(form.thca_percent) : null,
      thc_percent: form.thc_percent ? parseFloat(form.thc_percent) : null,
      cbd_percent: form.cbd_percent ? parseFloat(form.cbd_percent) : null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Lab test added");
    await load();
    setOpen(false);
    setForm({ plant_id: "", lab_name: "", thca_percent: "", thc_percent: "", cbd_percent: "" });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-display font-bold">Lab Tests (COAs)</h1>
        </div>
        <Button onClick={() => setOpen(true)} size="sm" className="gradient-leaf text-primary-foreground gap-1">
          <Plus className="h-4 w-4" />Log COA
        </Button>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        Log your Certificates of Analysis from independent labs to verify cannabinoids and terpenes for your breeding projects.
      </p>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        </div>
      ) : tests.length === 0 ? (
        <div className="py-16 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl glass flex items-center justify-center mb-4">
            <FileText className="h-7 w-7 text-primary" />
          </div>
          <h2 className="font-display text-lg font-semibold">No lab tests logged yet.</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Upload independent testing results for your candidates.</p>
          <Button onClick={() => setOpen(true)} className="gradient-leaf text-primary-foreground">Add Result</Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/20">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Date</th>
                <th className="px-4 py-3">Plant</th>
                <th className="px-4 py-3">Lab</th>
                <th className="px-4 py-3 text-right">THCa</th>
                <th className="px-4 py-3 text-right">THC</th>
                <th className="px-4 py-3 text-right">CBD</th>
                <th className="px-4 py-3 rounded-tr-lg">Action</th>
              </tr>
            </thead>
            <tbody>
              {tests.map(t => (
                <tr key={t.id} className="border-b border-border/50 hover:bg-secondary/10">
                  <td className="px-4 py-3">{format(new Date(t.tested_at), "MMM d, yyyy")}</td>
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/plants/${t.plant_id}`} className="hover:underline text-primary">
                      {t.plants?.name || "Unknown"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{t.lab_name || "Self/Unknown"}</td>
                  <td className="px-4 py-3 text-right">{t.thca_percent ? `${t.thca_percent}%` : "-"}</td>
                  <td className="px-4 py-3 text-right font-semibold">{t.thc_percent ? `${t.thc_percent}%` : "-"}</td>
                  <td className="px-4 py-3 text-right">{t.cbd_percent ? `${t.cbd_percent}%` : "-"}</td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" className="h-8">
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass max-w-md">
          <DialogHeader><DialogTitle className="font-display">Log Lab Results</DialogTitle></DialogHeader>
          <form onSubmit={create} className="grid gap-3">
            <div>
              <Label>Target Plant</Label>
              <select 
                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring mt-1"
                value={form.plant_id} 
                onChange={(e) => setForm({ ...form, plant_id: e.target.value })}
                required
              >
                <option value="">Select a plant...</option>
                {plants.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.strain})</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Lab Name (Optional)</Label>
              <Input value={form.lab_name} onChange={(e) => setForm({ ...form, lab_name: e.target.value })} placeholder="e.g. SC Labs, Steep Hill..." />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>THCa %</Label>
                <Input type="number" step="0.01" value={form.thca_percent} onChange={(e) => setForm({ ...form, thca_percent: e.target.value })} placeholder="0.0" />
              </div>
              <div>
                <Label>THC %</Label>
                <Input type="number" step="0.01" value={form.thc_percent} onChange={(e) => setForm({ ...form, thc_percent: e.target.value })} placeholder="0.0" />
              </div>
              <div>
                <Label>CBD %</Label>
                <Input type="number" step="0.01" value={form.cbd_percent} onChange={(e) => setForm({ ...form, cbd_percent: e.target.value })} placeholder="0.0" />
              </div>
            </div>
            <Button disabled={busy} className="gradient-leaf text-primary-foreground mt-2">Save Results</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
