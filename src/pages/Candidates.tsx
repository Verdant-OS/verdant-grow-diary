import { useState, useCallback, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Target, Beaker, Sprout, ArrowLeft, Star, StarOff } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface CandidateRow {
  id: string;
  name: string;
  stage: string;
  health: string;
  pheno_name: string | null;
  is_keeper: boolean;
  origin: string;
  pcr_tests?: { result: string }[];
}

interface HuntDetail {
  id: string;
  name: string;
  strain: string;
  status: string;
  started_at: string;
}

export default function Candidates() {
  const { id } = useParams();
  const { user } = useAuth();
  const [hunt, setHunt] = useState<HuntDetail | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ pheno_name: "", origin: "seed" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    const [huntRes, plantsRes] = await Promise.all([
      supabase.from("hunts").select("*").eq("id", id).single(),
      supabase.from("plants").select("id, name, stage, health, pheno_name, is_keeper, origin, pcr_tests(result)").eq("hunt_id", id).order("created_at", { ascending: true })
    ]);
    
    if (huntRes.error) toast.error(huntRes.error.message);
    if (plantsRes.error) toast.error(plantsRes.error.message);
    
    setHunt(huntRes.data as HuntDetail);
    setCandidates((plantsRes.data ?? []) as CandidateRow[]);
    setLoading(false);
  }, [user, id]);

  useEffect(() => { load(); }, [load]);

  async function createCandidate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !hunt) return;
    setBusy(true);
    // Candidates are just plants linked to a hunt
    const newName = `${hunt.strain} #${candidates.length + 1}`;
    const { error } = await supabase.from("plants").insert({
      user_id: user.id,
      name: newName,
      strain: hunt.strain,
      hunt_id: hunt.id,
      pheno_name: form.pheno_name.trim() || null,
      origin: form.origin
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Candidate added");
    await load();
    setOpen(false);
    setForm({ pheno_name: "", origin: "seed" });
  }

  async function toggleKeeper(candidateId: string, currentStatus: boolean) {
    const { error } = await supabase.from("plants").update({ is_keeper: !currentStatus }).eq("id", candidateId);
    if (error) { toast.error(error.message); return; }
    toast.success(currentStatus ? "Removed keeper status" : "Marked as keeper!");
    await load();
  }

  if (loading) {
    return <div className="py-16 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>;
  }

  if (!hunt) {
    return <div className="text-center py-16">Hunt not found</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/hunts" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to Hunts
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" /> {hunt.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Target strain: <span className="font-medium text-foreground">{hunt.strain}</span>
              <span className="mx-2">·</span>
              Started {format(new Date(hunt.started_at), "MMM d, yyyy")}
            </p>
          </div>
          <Button onClick={() => setOpen(true)} size="sm" className="gradient-leaf text-primary-foreground gap-1">
            <Plus className="h-4 w-4" /> Add Candidate
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Candidates ({candidates.length})
          </h2>
          {candidates.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center">
              <Sprout className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-foreground">No candidates added yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Pop some seeds or add clones to start evaluating.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {candidates.map(c => (
                <div key={c.id} className={`glass rounded-2xl p-4 flex flex-col relative ${c.is_keeper ? 'border-amber-500/50 bg-amber-500/5' : ''}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <Link to={`/plants/${c.id}`} className="font-semibold hover:underline block">{c.name}</Link>
                      {c.pheno_name && <span className="text-xs text-muted-foreground">aka "{c.pheno_name}"</span>}
                    </div>
                    <button 
                      onClick={() => toggleKeeper(c.id, c.is_keeper)}
                      className={`p-1.5 rounded-full transition-colors ${c.is_keeper ? 'text-amber-500 hover:bg-amber-500/10' : 'text-muted-foreground hover:bg-secondary/50'}`}
                      title={c.is_keeper ? "Remove keeper status" : "Mark as keeper"}
                    >
                      {c.is_keeper ? <Star className="h-4 w-4 fill-amber-500" /> : <StarOff className="h-4 w-4" />}
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mt-auto pt-4">
                    <Badge variant="outline" className="text-[10px] uppercase">{c.stage}</Badge>
                    <Badge variant="outline" className="text-[10px]">{c.health}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{c.origin}</Badge>
                    
                    {c.pcr_tests && c.pcr_tests.length > 0 && (
                      <Badge 
                        variant="outline" 
                        className={`text-[10px] ${c.pcr_tests.some(t => t.result === 'infected') ? 'border-destructive/50 text-destructive' : 'border-emerald-500/50 text-emerald-500'}`}
                      >
                        {c.pcr_tests.some(t => t.result === 'infected') ? 'PCR: Infected' : 'PCR: Clean'}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Beaker className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Hunt Insights</h3>
            </div>
            <div className="text-sm space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Keepers Found</span>
                <span className="font-medium">{candidates.filter(c => c.is_keeper).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Phenos</span>
                <span className="font-medium">{candidates.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline" className="text-[10px] uppercase">{hunt.status}</Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass max-w-md">
          <DialogHeader><DialogTitle className="font-display">Add Candidate</DialogTitle></DialogHeader>
          <form onSubmit={createCandidate} className="grid gap-3">
            <div>
              <Label>Origin</Label>
              <select 
                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 mt-1"
                value={form.origin} 
                onChange={(e) => setForm({ ...form, origin: e.target.value })}
              >
                <option value="seed">Seed (From Scratch)</option>
                <option value="clone">Clone</option>
                <option value="tissue_culture">Tissue Culture</option>
              </select>
            </div>
            <div>
              <Label>Phenotype Alias (Optional)</Label>
              <Input value={form.pheno_name} onChange={(e) => setForm({ ...form, pheno_name: e.target.value })} placeholder="e.g. The Stretch Pheno, Gas dominant..." />
            </div>
            <p className="text-xs text-muted-foreground">This plant will automatically be named <strong>{hunt.strain} #{candidates.length + 1}</strong></p>
            <Button disabled={busy} className="gradient-leaf text-primary-foreground mt-2">Add Candidate</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
