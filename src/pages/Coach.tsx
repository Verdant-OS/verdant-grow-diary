import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGrows } from "@/store/grows";
import { useAuth } from "@/store/auth";

import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Camera, Loader2, Wand2, ListChecks, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  useGrowPlants,
  useGrowSensorReadings,
  getGrowDataMeta,
} from "@/hooks/useGrowData";
import { useDiaryEntries } from "@/hooks/use-diary-entries";
import { evaluateAiContextSufficiency } from "@/lib/aiContextSufficiencyRules";
import { adaptDiaryForAiContext } from "@/lib/coachContextAdapter";
import CoachContextSufficiencyPanel from "@/components/CoachContextSufficiencyPanel";
import CoachAiDoctorHistoryPanel from "@/components/CoachAiDoctorHistoryPanel";
import StructuredDiagnosisCard from "@/components/StructuredDiagnosisCard";
import {
  validateAndSanitizeDiagnosis,
  type Diagnosis,
  type DiagnosisSuggestedAction,
} from "@/lib/aiDoctorDiagnosisRules";
import { ACTION_QUEUE_SOURCE_VALUES } from "@/lib/actionQueueProvenanceRules";
import { persistAiDoctorSession } from "@/lib/aiDoctorSessionPersistence";
import { harmonizeDiagnosisConfidence } from "@/lib/aiDoctorConfidenceRules";
import { actionsPath } from "@/lib/routes";

type Mode = "diagnose" | "next_steps";

interface Analysis {
  summary: string;
  likely_issue: string | null;
  confidence: "low" | "medium" | "high";
  risk_level: "low" | "medium" | "high" | "unknown";
  evidence: string[];
  possible_causes: string[];
  recommended_actions: string[];
  do_not_do: string[];
  follow_up_24h: string;
  follow_up_3_day: string;
}

interface CoachResponse {
  analysis?: Analysis;
  /** Raw structured diagnosis from edge function; sanitize before render. */
  diagnosis?: unknown;
  sparse?: boolean;
  empty?: boolean;
  error?: string;
}

export default function Coach() {
  const { user } = useAuth();

  const { activeGrow, activeGrowId } = useGrows();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CoachResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [queuedIdx, setQueuedIdx] = useState<Set<number>>(new Set());
  const [queuingIdx, setQueuingIdx] = useState<number | null>(null);
  // Persisted AI Doctor session id for the *currently rendered* diagnosis.
  // Reset whenever a new ask() starts; only applied if the persistence
  // result still belongs to the most recent diagnosis (race-safe).
  const [persistedSessionId, setPersistedSessionId] = useState<string | null>(null);
  const diagnosisSeqRef = useRef(0);

  // --- Real grow context for AI sufficiency evaluation (presenter only) ---
  const { data: ctxPlants = [] } = useGrowPlants(undefined, activeGrowId ?? undefined);
  const { data: ctxSensors = [] } = useGrowSensorReadings(undefined);
  const { data: ctxDiary = [] } = useDiaryEntries();
  const contextSufficiency = useMemo(() => {
    const plantsMeta = getGrowDataMeta(["grow", "plants", "all", activeGrowId ?? "all"]);
    const sensorsMeta = getGrowDataMeta(["grow", "sensors", "all"]);
    // Route raw diary rows through the normalization rules so malformed
    // details degrade context safely and valid pH/EC/watering/photo signals
    // can lift sufficiency where appropriate.
    const diaryAdapted = adaptDiaryForAiContext({
      rawDiaryEntries: ctxDiary as readonly unknown[],
    });
    const liveSensors = ctxSensors.map((r) => ({
      at: (r as { recordedAt?: string | number | Date; at?: string | number | Date }).recordedAt
        ?? (r as { at?: string | number | Date }).at,
      temp: r.temp,
      rh: r.rh,
      vpd: r.vpd,
      ph: (r as { ph?: number }).ph,
      ec: (r as { ec?: number }).ec,
    }));
    return evaluateAiContextSufficiency({
      activeGrow: activeGrowId ? { id: activeGrowId } : null,
      plants: ctxPlants.map((p) => ({
        id: p.id,
        stage: p.stage ?? null,
        strain: p.strain ?? null,
        // Mock Plant type doesn't carry medium yet; treat as unknown so the
        // rule helper can warn honestly without inventing values.
        medium: (p as { medium?: string | null }).medium ?? null,
      })),
      recentDiaryEntries: diaryAdapted.recentDiaryEntries,
      recentWateringOrFeeding: diaryAdapted.recentWateringOrFeeding,
      recentSensorReadings: [...liveSensors, ...diaryAdapted.diaryDerivedSensors],
      hasPhoto: !!photoFile || diaryAdapted.hasDiaryPhoto,
      sensorMeta: sensorsMeta,
      contextMeta: plantsMeta,
      questionKind: photoFile ? "visual-diagnosis" : "general",
    });
  }, [activeGrowId, ctxPlants, ctxSensors, ctxDiary, photoFile]);

  // SECURITY: never send user_id from the client. DB default (auth.uid()) wins.
  // status always defaults to pending_approval. No device-control fields.
  async function addToQueue(idx: number, recommendation: string) {
    if (!user || !activeGrowId || !analysis) return;
    const risk: "low" | "medium" | "high" | "critical" =
      analysis.risk_level === "unknown" ? "low" : analysis.risk_level;
    setQueuingIdx(idx);
    const { data: inserted, error } = await supabase
      .from("action_queue")
      .insert({
        grow_id: activeGrowId,
        action_type: "advisory",
        target_metric: "general",
        suggested_change: recommendation,
        reason: analysis.likely_issue || analysis.summary || "AI Coach recommendation",
        risk_level: risk,
        source: "ai_coach",
        status: "pending_approval",
      })
      .select("id,grow_id")
      .single();
    setQueuingIdx(null);
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (error.code === "42501" || msg.includes("row-level security") || msg.includes("violates")) {
        toast.error(
          "This action cannot be queued until the plant/tent is assigned to this grow.",
          { description: "Open Lineage Repair to assign tents to this grow." },
        );
        return;
      }
      toast.error(error.message);
      return;
    }
    setQueuedIdx((s) => new Set(s).add(idx));

    // SECURITY: audit-only insert. No device commands. user_id omitted (DB default auth.uid()).
    if (inserted?.id) {
      const { error: auditError } = await supabase.from("action_queue_events").insert({
        action_queue_id: inserted.id,
        grow_id: inserted.grow_id ?? activeGrowId,
        event_type: "created",
        previous_status: null,
        new_status: "pending_approval",
        note: "Created from AI Coach recommendation",
      });
      if (auditError) {
        toast.warning("Action queued, but audit log failed.", {
          description: auditError.message,
        });
        return;
      }
    }
    toast.success("Action queued for approval.");
  }

  // Sanitized structured diagnosis from AI Doctor v1 (approval-first).
  const diagnosis: Diagnosis | null = useMemo(() => {
    if (!result?.diagnosis) return null;
    return validateAndSanitizeDiagnosis(result.diagnosis).diagnosis;
  }, [result?.diagnosis]);
  const [doctorQueuedKeys, setDoctorQueuedKeys] = useState<Set<string>>(new Set());

  // SECURITY: never send user_id from the client. status pins pending_approval.
  // Source is "ai_doctor"; no device commands. Idempotent per (title|detail).
  async function addDoctorSuggestionToQueue(
    action: DiagnosisSuggestedAction,
  ): Promise<void> {
    if (!user || !activeGrowId || !diagnosis) return;
    const key = `${action.title}::${action.detail}`;
    if (doctorQueuedKeys.has(key)) return;
    const risk: "low" | "medium" | "high" = action.priority;
    const { data: inserted, error } = await supabase
      .from("action_queue")
      .insert({
        grow_id: activeGrowId,
        action_type: action.type === "task" ? "task" : "advisory",
        target_metric: "general",
        suggested_change: `${action.title}: ${action.detail}`,
        reason:
          action.reason ||
          diagnosis.likelyIssue ||
          diagnosis.summary ||
          "AI Doctor suggestion",
        risk_level: risk,
        source: ACTION_QUEUE_SOURCE_VALUES.AI_DOCTOR,
        status: "pending_approval",
      })
      .select("id,grow_id")
      .single();
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (
        error.code === "42501" ||
        msg.includes("row-level security") ||
        msg.includes("violates")
      ) {
        toast.error(
          "This action cannot be queued until the plant/tent is assigned to this grow.",
          { description: "Open Lineage Repair to assign tents to this grow." },
        );
        return;
      }
      toast.error(error.message);
      return;
    }
    setDoctorQueuedKeys((s) => new Set(s).add(key));
    if (inserted?.id) {
      await supabase.from("action_queue_events").insert({
        action_queue_id: inserted.id,
        grow_id: inserted.grow_id ?? activeGrowId,
        event_type: "created",
        previous_status: null,
        new_status: "pending_approval",
        note: "Created from AI Doctor suggestion (approval required)",
      });
    }
    toast.success("AI Doctor suggestion queued for approval.");
  }



  async function ask(mode: Mode) {
    if (!user) return;
    const seq = ++diagnosisSeqRef.current;
    setBusy(true); setResult(null); setPersistedSessionId(null);
    try {
      let photoUrl: string | undefined;
      if (mode === "diagnose" && photoFile) {
        const ext = photoFile.name.split(".").pop() || "jpg";
        const path = `${user.id}/coach/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("diary-photos").upload(path, photoFile, { contentType: photoFile.type });
        if (error) throw error;
        const { data: signed, error: sErr } = await supabase.storage.from("diary-photos").createSignedUrl(path, 600);
        if (sErr) throw sErr;
        photoUrl = signed.signedUrl;
      }
      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: { mode, growId: activeGrowId, photoUrl, question: question.trim() || undefined },
      });
      if (error) throw error;
      const d = data as CoachResponse | null;
      if (d?.error) throw new Error(d.error);
      setResult(d ?? null);

      // Persist a read-only snapshot of the completed AI Doctor response.
      // SECURITY: never include user_id (DB default auth.uid()). Only the
      // sanitized diagnosis is persisted. Persistence is non-blocking —
      // failures only emit a soft warning and never affect rendering.
      if (d && (d.analysis || d.diagnosis)) {
        const sanitized = d.diagnosis
          ? validateAndSanitizeDiagnosis(d.diagnosis).diagnosis
          : null;
        const rawConf =
          sanitized && typeof sanitized.confidence === "number"
            ? sanitized.confidence
            : null;
        const harmonized =
          rawConf !== null
            ? harmonizeDiagnosisConfidence(
                rawConf,
                contextSufficiency.confidenceCeiling,
              )
            : null;
        // Fire-and-forget; we intentionally do not await before clearing busy.
        void persistAiDoctorSession(supabase, {
          growId: activeGrowId,
          tentId: null,
          plantId: null,
          question: question.trim() || null,
          analysis: d.analysis ?? null,
          diagnosis: sanitized,
          rawConfidence: rawConf,
          displayedConfidence: harmonized?.displayedConfidence ?? null,
          contextConfidenceCeiling: contextSufficiency.confidenceCeiling ?? null,
          contextSufficiency,
        }).then((res) => {
          if (res.ok) {
            // Only apply the persisted id if this diagnosis is still the
            // most recent one rendered. Prevents an older request's id
            // from attaching to a newer diagnosis.
            if (seq === diagnosisSeqRef.current && res.id) {
              setPersistedSessionId(res.id);
            }
          } else if ("error" in res) {
            toast.warning("Couldn't save this AI Doctor session for later review.", {
              description: res.error,
            });
          }
        });
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Coach failed");
    } finally { setBusy(false); }
  }

  function handleFile(f: File | null) {
    setPhotoFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  const analysis = result?.analysis;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />AI Coach</h1>
        <p className="text-sm text-muted-foreground">
          {activeGrow ? <>Coaching <span className="text-foreground">{activeGrow.name}</span> using your recent diary.</> : "Pick a grow for personalized advice."}
        </p>
      </div>

      <CoachContextSufficiencyPanel result={contextSufficiency} className="mb-4" />

      <CoachAiDoctorHistoryPanel growId={activeGrowId ?? null} />


      <div className="glass rounded-2xl p-4 space-y-4">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="relative aspect-video w-full rounded-xl border-2 border-dashed border-border/60 overflow-hidden bg-secondary/40 hover:border-primary/60 transition">
          {preview ? <img src={preview} className="h-full w-full object-cover" alt="" /> : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Camera className="h-8 w-8" /><span className="text-sm">Add photo to diagnose</span>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        </button>

        <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Optional: ask a question, e.g. 'why are leaves curling?'" rows={2} />

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => ask("diagnose")} disabled={busy || !photoFile} className="gradient-leaf text-primary-foreground">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Wand2 className="h-4 w-4" />Diagnose photo</>}
          </Button>
          <Button onClick={() => ask("next_steps")} disabled={busy || !activeGrowId} variant="secondary">
            What should I do next?
          </Button>
        </div>
      </div>

      {diagnosis && (
        <div className="mt-4 animate-fade-in">
          <StructuredDiagnosisCard
            diagnosis={diagnosis}
            disableQueueing={!activeGrowId}
            onAddToQueue={(action) => addDoctorSuggestionToQueue(action)}
            contextCeiling={contextSufficiency.confidenceCeiling}
            aiDoctorSessionId={persistedSessionId ?? undefined}
            testId="coach-ai-doctor-diagnosis"
          />
        </div>
      )}

      {analysis && (
        <div className="glass rounded-2xl p-4 mt-4 animate-fade-in space-y-3 text-sm">
          {(() => {
            const rank = { low: 0, medium: 1, high: 2 } as const;
            const cappedConf =
              rank[analysis.confidence] > rank[contextSufficiency.confidenceCeiling]
                ? contextSufficiency.confidenceCeiling
                : analysis.confidence;
            const capped = cappedConf !== analysis.confidence;
            return (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" />Coach
                <span
                  className="ml-auto uppercase tracking-wider"
                  data-testid="coach-displayed-confidence"
                  data-capped={String(capped)}
                >
                  conf: {cappedConf} · risk: {analysis.risk_level}
                  {capped && " · limited-context guidance"}
                  {result?.sparse && " · sparse data"}
                </span>
              </div>
            );
          })()}
          <p className="font-medium">{analysis.summary}</p>
          {analysis.likely_issue && (
            <p className="text-xs"><span className="text-muted-foreground">Likely issue:</span> {analysis.likely_issue}</p>
          )}
          <Section title="Evidence" items={analysis.evidence} />
          <Section title="Possible causes" items={analysis.possible_causes} />
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Recommended actions
            </p>
            <ul className="space-y-1.5">
              {analysis.recommended_actions.map((it, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex-1">• {it}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 shrink-0"
                    disabled={
                      !activeGrowId || queuingIdx === i || queuedIdx.has(i)
                    }
                    onClick={() => addToQueue(i, it)}
                  >
                    {queuingIdx === i ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : queuedIdx.has(i) ? (
                      "Queued"
                    ) : (
                      <>
                        <Plus className="h-3 w-3" />
                        Add to Action Queue
                      </>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
            <div className="mt-2">
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                <Link to={actionsPath()}>
                  <ListChecks className="h-3 w-3" /> Open Action Queue
                </Link>
              </Button>
            </div>
          </div>
          <Section title="Do NOT do" items={analysis.do_not_do} />
          <div className="text-xs space-y-1 pt-2 border-t border-border/40">
            <p><span className="text-muted-foreground">Next 24h:</span> {analysis.follow_up_24h}</p>
            <p><span className="text-muted-foreground">Next 3 days:</span> {analysis.follow_up_3_day}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{title}</p>
      <ul className="list-disc list-inside space-y-0.5">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}
