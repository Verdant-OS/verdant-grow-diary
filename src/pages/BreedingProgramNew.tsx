import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Dna, Sparkles } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function applyDefaultCultivar(cv: DefaultCultivar) {
    setForm((f) => ({
      ...f,
      p1_maternal_label: cv.cultivarName,
      cross_pair_label: cv.lineage,
      notes:
        f.notes && f.notes.trim().length > 0
          ? `${f.notes}\n\n${formatCultivarNotes(cv)}`
          : formatCultivarNotes(cv),
    }));
    toast({ title: `Prefilled from ${cv.cultivarName}` });
  }

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
    <div className="mx-auto min-w-0 max-w-3xl">
      <PageHeader
        title="New breeding program"
        eyebrow="Genetics workflow"
        description="Capture the program identity before recording its step-by-step SOP evidence. Every field can be refined before you save."
        icon={<Dna className="size-5" />}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate("/breeding")}
            className="w-full sm:w-auto"
          >
            <ArrowLeft data-icon="inline-start" />
            All programs
          </Button>
        }
      />

      <Card className="rounded-3xl border-border/60 bg-card/65 shadow-card backdrop-blur-xl">
        <CardHeader className="border-b border-border/60 p-5 sm:p-6">
          <CardTitle className="font-display text-xl">Program identity</CardTitle>
          <CardDescription className="leading-relaxed">
            Define the parent labels, goals, and generation that anchor this SOP run.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-5 sm:p-6 sm:pt-6">
          <form onSubmit={onSubmit} className="space-y-6">
            <section
              className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-4"
              aria-labelledby="default-cultivars-heading"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <Sparkles className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="default-cultivars-heading"
                    className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    Default cultivars
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Prefills the maternal P1 label, lineage, and notes. You can edit every field
                    before saving.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {DEFAULT_CULTIVARS.map((cv) => (
                  <Button
                    key={cv.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid={`default-cultivar-${cv.id}`}
                    onClick={() => applyDefaultCultivar(cv)}
                  >
                    {cv.cultivarName}
                  </Button>
                ))}
              </div>
            </section>

            <div className="space-y-2">
              <Label htmlFor="name">Program name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Line-A resin stabilization"
                required
              />
            </div>

            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="sr-only">Parent labels</legend>
              <div className="space-y-2">
                <Label htmlFor="p1m">P1 maternal label</Label>
                <Input
                  id="p1m"
                  value={form.p1_maternal_label}
                  onChange={(e) => set("p1_maternal_label", e.target.value)}
                  placeholder="e.g. Afghan #4"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p1p">P1 paternal label</Label>
                <Input
                  id="p1p"
                  value={form.p1_paternal_label}
                  onChange={(e) => set("p1_paternal_label", e.target.value)}
                  placeholder="e.g. Colombian Gold"
                />
              </div>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="pair">Cross pair label (optional)</Label>
              <Input
                id="pair"
                value={form.cross_pair_label}
                onChange={(e) => set("cross_pair_label", e.target.value)}
                placeholder="e.g. AFG4 × COLG"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="traits">Target traits (comma separated)</Label>
              <Input
                id="traits"
                value={form.target_traits}
                onChange={(e) => set("target_traits", e.target.value)}
                placeholder="resin, disease resistance, short flowering"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gen">Starting generation</Label>
              <select
                id="gen"
                value={form.starting_generation}
                onChange={(e) => set("starting_generation", e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {BREEDING_GENERATIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex flex-col gap-2 border-t border-border/60 pt-5 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/breeding")}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="w-full gradient-leaf text-primary-foreground sm:w-auto"
              >
                {saving ? "Creating…" : "Create program"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
