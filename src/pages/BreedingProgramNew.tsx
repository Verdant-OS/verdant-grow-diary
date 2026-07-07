import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { createBreedingProgram } from "@/lib/breeding/breedingProgramApi";
import { BREEDING_GENERATIONS } from "@/constants/breedingSopSteps";
import {
  DEFAULT_CULTIVARS,
  formatCultivarNotes,
  type DefaultCultivar,
} from "@/constants/defaultCultivars";

export default function BreedingProgramNew() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    p1_maternal_label: "",
    p1_paternal_label: "",
    cross_pair_label: "",
    target_traits: "",
    starting_generation: "P1",
    notes: "",
  });

  const set = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Name is required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { programId } = await createBreedingProgram({
        name: form.name,
        p1_maternal_label: form.p1_maternal_label || null,
        p1_paternal_label: form.p1_paternal_label || null,
        cross_pair_label: form.cross_pair_label || null,
        target_traits: form.target_traits
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        starting_generation: form.starting_generation,
        notes: form.notes || null,
      });
      toast({ title: "Program created" });
      navigate(`/breeding/${programId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create program.";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle>New breeding program</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Program name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Line-A resin stabilization"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="p1m">P1 maternal label</Label>
                <Input
                  id="p1m"
                  value={form.p1_maternal_label}
                  onChange={(e) => set("p1_maternal_label", e.target.value)}
                  placeholder="e.g. Afghan #4"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="p1p">P1 paternal label</Label>
                <Input
                  id="p1p"
                  value={form.p1_paternal_label}
                  onChange={(e) => set("p1_paternal_label", e.target.value)}
                  placeholder="e.g. Colombian Gold"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="pair">Cross pair label (optional)</Label>
              <Input
                id="pair"
                value={form.cross_pair_label}
                onChange={(e) => set("cross_pair_label", e.target.value)}
                placeholder="e.g. AFG4 × COLG"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="traits">Target traits (comma separated)</Label>
              <Input
                id="traits"
                value={form.target_traits}
                onChange={(e) => set("target_traits", e.target.value)}
                placeholder="resin, disease resistance, short flowering"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="gen">Starting generation</Label>
              <select
                id="gen"
                value={form.starting_generation}
                onChange={(e) => set("starting_generation", e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {BREEDING_GENERATIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate("/breeding")}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create program"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
