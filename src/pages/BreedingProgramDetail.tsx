import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, BookOpenCheck, ClipboardCheck, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import {
  attachDiaryEvidence,
  completeStepAndAdvance,
  getBreedingProgram,
  listOwnDiaryEntries,
  setStepCriterionMet,
  type BreedingEvidenceRecord,
  type BreedingProgramSummary,
  type BreedingStepRecord,
} from "@/lib/breeding/breedingProgramApi";
import { evaluateStepReadiness } from "@/lib/breeding/breedingProgramProgress";
import type { BreedingCriterionKey } from "@/constants/breedingProgramTemplate";

interface DiaryEntry {
  id: string;
  note: string;
  entry_at: string;
  grow_id: string;
}

export default function BreedingProgramDetail() {
  const { programId } = useParams<{ programId: string }>();
  const [program, setProgram] = useState<BreedingProgramSummary | null>(null);
  const [steps, setSteps] = useState<BreedingStepRecord[]>([]);
  const [evidence, setEvidence] = useState<BreedingEvidenceRecord[]>([]);
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!programId) return;
    setLoading(true);
    try {
      const [res, entries] = await Promise.all([
        getBreedingProgram(programId),
        listOwnDiaryEntries(100),
      ]);
      setProgram(res.program);
      setSteps(res.steps);
      setEvidence(res.evidence);
      setDiary(entries);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const evidenceByStep = useMemo(() => {
    const map = new Map<string, BreedingEvidenceRecord[]>();
    for (const e of evidence) {
      const list = map.get(e.step_id) ?? [];
      list.push(e);
      map.set(e.step_id, list);
    }
    return map;
  }, [evidence]);

  async function toggleCriterion(
    step: BreedingStepRecord,
    key: BreedingCriterionKey,
    checked: boolean,
  ) {
    try {
      await setStepCriterionMet(step.id, { [key]: checked });
      await reload();
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Failed to update.",
        variant: "destructive",
      });
    }
  }

  async function attach(
    step: BreedingStepRecord,
    diaryEntryId: string,
    criterionKey: BreedingCriterionKey,
  ) {
    if (!program) return;
    try {
      await attachDiaryEvidence({
        programId: program.id,
        stepId: step.id,
        diaryEntryId,
        criterionKey,
      });
      toast({ title: "Diary evidence linked" });
      await reload();
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Failed to link diary.",
        variant: "destructive",
      });
    }
  }

  async function advance(step: BreedingStepRecord) {
    if (!program) return;
    const readiness = evaluateStepReadiness({
      id: step.id,
      stepIndex: step.step_index,
      stepKey: step.step_key,
      status: step.status,
      requiredCriteria: step.required_criteria,
      criteriaMet: step.criteria_met,
    });
    if (!readiness.readyToAdvance) {
      toast({
        title: "Cannot advance: required criteria not met",
        description: readiness.missing.join(", "),
        variant: "destructive",
      });
      return;
    }
    try {
      await completeStepAndAdvance(program.id, step.id);
      toast({ title: "Step complete" });
      await reload();
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Failed to advance.",
        variant: "destructive",
      });
    }
  }

  if (loading && !program) {
    return (
      <div
        className="flex min-h-48 items-center justify-center rounded-3xl border border-border/60 bg-card/50 text-muted-foreground"
        role="status"
        aria-label="Loading breeding program"
      >
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto min-w-0 max-w-5xl">
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>Unable to load this breeding program</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!program) return null;

  return (
    <div className="mx-auto min-w-0 max-w-5xl">
      <PageHeader
        title={program.name}
        eyebrow="Breeding program"
        description={`${program.p1_maternal_label ?? "Unassigned maternal"} × ${program.p1_paternal_label ?? "Unassigned paternal"}${program.cross_pair_label ? ` · ${program.cross_pair_label}` : ""}`}
        icon={<BookOpenCheck className="size-5" />}
        meta={
          <>
            <Badge variant="outline" className="capitalize">
              {program.status}
            </Badge>
            <Badge variant="outline">SOP {program.sop_version}</Badge>
            {program.target_traits.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Targets: {program.target_traits.join(", ")}
              </span>
            )}
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
            <Link to="/breeding">
              <ArrowLeft data-icon="inline-start" />
              All programs
            </Link>
          </Button>
        }
      />

      <section className="space-y-3" aria-label="Breeding program steps">
        {steps.map((step) => {
          const stepEvidence = evidenceByStep.get(step.id) ?? [];
          const readiness = evaluateStepReadiness({
            id: step.id,
            stepIndex: step.step_index,
            stepKey: step.step_key,
            status: step.status,
            requiredCriteria: step.required_criteria,
            criteriaMet: step.criteria_met,
          });
          const isActive = step.status === "active";
          return (
            <Card
              key={step.id}
              className={`overflow-hidden rounded-3xl border-border/60 bg-card/65 shadow-card backdrop-blur-xl ${isActive ? "border-primary/60 ring-1 ring-primary/15" : ""}`}
              data-testid={`step-${step.step_key}`}
            >
              <CardHeader className="gap-3 border-b border-border/60 p-4 sm:p-5">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <CardTitle className="min-w-0 break-words font-display text-lg capitalize">
                    <span className="mr-2 text-xs font-medium normal-case text-muted-foreground">
                      Step {step.step_index + 1} · {step.generation_label}
                    </span>
                    {(step.required_criteria as unknown as { key: string }[]).length > 0
                      ? step.step_key.replace(/_/g, " ")
                      : step.step_key}
                  </CardTitle>
                  <Badge
                    variant={
                      step.status === "complete"
                        ? "default"
                        : step.status === "active"
                          ? "secondary"
                          : "outline"
                    }
                    className="shrink-0 capitalize"
                  >
                    {step.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 p-4 pt-4 sm:p-5 sm:pt-5">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.instruction_summary}
                </p>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <span>Required criteria</span>
                    <span aria-hidden="true">•</span>
                    <span>
                      {readiness.metRequired}/{readiness.totalRequired} met
                    </span>
                  </div>
                  {step.required_criteria.map((c) => {
                    const met = step.criteria_met?.[c.key] === true;
                    const attached = stepEvidence.filter((e) => e.criterion_key === c.key);
                    const evidenceSelectId = `${step.id}-${c.key}-evidence`;
                    return (
                      <div
                        key={c.key}
                        className="space-y-3 rounded-2xl border border-border/70 bg-background/45 p-3.5 sm:p-4"
                      >
                        <div className="flex items-start gap-2">
                          <Checkbox
                            id={`${step.id}-${c.key}`}
                            checked={met}
                            disabled={step.status === "complete"}
                            onCheckedChange={(v) => toggleCriterion(step, c.key, v === true)}
                          />
                          <div className="min-w-0 flex-1">
                            <label
                              htmlFor={`${step.id}-${c.key}`}
                              className="cursor-pointer text-sm font-medium leading-relaxed"
                            >
                              {c.label}
                              {c.required && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  (required)
                                </span>
                              )}
                            </label>
                            {attached.length > 0 && (
                              <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                                {attached.map((a) => (
                                  <li key={a.id} className="break-words">
                                    Evidence · {a.diary_entry_at?.slice(0, 10) ?? ""} —{" "}
                                    {a.diary_note?.slice(0, 80) ?? "(no note)"}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {isActive && diary.length > 0 && (
                              <div className="mt-2">
                                <label
                                  htmlFor={evidenceSelectId}
                                  className="text-xs font-medium text-muted-foreground"
                                >
                                  Link diary entry as evidence
                                </label>
                                <select
                                  id={evidenceSelectId}
                                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                  defaultValue=""
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      void attach(step, e.target.value, c.key);
                                      e.target.value = "";
                                    }
                                  }}
                                >
                                  <option value="">Choose a diary entry…</option>
                                  {diary.map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.entry_at.slice(0, 10)} — {d.note.slice(0, 60)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {isActive && (
                  <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {readiness.readyToAdvance
                        ? "All required criteria met."
                        : `Missing: ${readiness.missing.join(", ") || "—"}`}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => advance(step)}
                      disabled={!readiness.readyToAdvance}
                      className="w-full gradient-leaf text-primary-foreground sm:w-auto"
                    >
                      <ClipboardCheck data-icon="inline-start" />
                      Confirm & advance
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
