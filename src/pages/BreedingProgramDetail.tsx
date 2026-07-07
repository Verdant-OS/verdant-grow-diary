import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
    return <div className="container mx-auto max-w-3xl px-4 py-6 text-sm">Loading…</div>;
  }
  if (error) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-6 text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (!program) return null;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Link
            to="/breeding"
            className="text-xs text-muted-foreground hover:underline"
          >
            ← Programs
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{program.name}</h1>
          <Badge variant="outline">{program.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {program.p1_maternal_label ?? "—"} × {program.p1_paternal_label ?? "—"}
          {program.cross_pair_label ? ` · ${program.cross_pair_label}` : ""} · SOP{" "}
          {program.sop_version}
        </p>
        {program.target_traits.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Targets: {program.target_traits.join(", ")}
          </p>
        )}
      </header>

      <div className="space-y-3">
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
              className={isActive ? "border-primary" : undefined}
              data-testid={`step-${step.step_key}`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>
                    <span className="text-muted-foreground text-xs mr-2">
                      Step {step.step_index + 1} · {step.generation_label}
                    </span>
                    {(step.required_criteria as unknown as { key: string }[])
                      .length > 0
                      ? step.step_key.replace(/_/g, " ")
                      : step.step_key}
                  </span>
                  <Badge
                    variant={
                      step.status === "complete"
                        ? "default"
                        : step.status === "active"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {step.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{step.instruction_summary}</p>

                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Required criteria — {readiness.metRequired}/{readiness.totalRequired} met
                  </div>
                  {step.required_criteria.map((c) => {
                    const met = step.criteria_met?.[c.key] === true;
                    const attached = stepEvidence.filter((e) => e.criterion_key === c.key);
                    return (
                      <div key={c.key} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <Checkbox
                            id={`${step.id}-${c.key}`}
                            checked={met}
                            disabled={step.status === "complete"}
                            onCheckedChange={(v) =>
                              toggleCriterion(step, c.key, v === true)
                            }
                          />
                          <div className="flex-1">
                            <label
                              htmlFor={`${step.id}-${c.key}`}
                              className="text-sm font-medium"
                            >
                              {c.label}
                              {c.required && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  (required)
                                </span>
                              )}
                            </label>
                            {attached.length > 0 && (
                              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                                {attached.map((a) => (
                                  <li key={a.id}>
                                    📓 {a.diary_entry_at?.slice(0, 10) ?? ""} —{" "}
                                    {a.diary_note?.slice(0, 80) ?? "(no note)"}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {isActive && diary.length > 0 && (
                              <div className="mt-2">
                                <label className="text-xs text-muted-foreground">
                                  Link diary entry as evidence:
                                </label>
                                <select
                                  className="mt-1 w-full rounded-md border bg-background px-2 py-1 text-xs"
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
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">
                      {readiness.readyToAdvance
                        ? "All required criteria met."
                        : `Missing: ${readiness.missing.join(", ") || "—"}`}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => advance(step)}
                      disabled={!readiness.readyToAdvance}
                    >
                      Confirm & advance
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
