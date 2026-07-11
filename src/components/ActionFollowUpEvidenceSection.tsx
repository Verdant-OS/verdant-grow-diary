/**
 * ActionFollowUpEvidenceSection — container that loads the existing
 * follow-up (if any), evaluates eligibility, and coordinates saving
 * through the shipped `saveActionFollowUpEvidence` service.
 *
 * Safety:
 *  - Presentation container. No schema, RLS, Edge, or auth work.
 *  - Never creates a follow-up automatically. Grower must submit.
 *  - Fails closed when the existing-follow-up query fails.
 *  - Only imports the pure rules + persistence service.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CircleCheckBig } from "lucide-react";
import { useAuth } from "@/store/auth";
import {
  ACTION_FOLLOWUP_EVENT_TYPE,
  followupMatchesAction,
} from "@/lib/actionFollowupRules";
import {
  evaluateActionFollowUpEligibility,
  type ActionFollowUpDraft,
} from "@/lib/actionFollowUpEvidenceRules";
import {
  saveActionFollowUpEvidence,
  type ActionFollowUpEvidenceRecord,
  type ActionFollowUpEvidenceSaveResult,
} from "@/lib/actionFollowUpEvidenceService";
import { buildActionFollowUpEvidenceViewModel } from "@/lib/actionFollowUpEvidenceViewModel";
import ActionFollowUpEvidenceForm, {
  type ActionFollowUpFormSubmit,
} from "@/components/ActionFollowUpEvidenceForm";
import ActionFollowUpEvidenceCard from "@/components/ActionFollowUpEvidenceCard";
import ActionFollowUpExistingPhotoSelector, {
  type ExistingPhotoLoadState,
} from "@/components/ActionFollowUpExistingPhotoSelector";
import ActionFollowUpExistingPhotoEvidence from "@/components/ActionFollowUpExistingPhotoEvidence";
import ActionFollowUpQuickLogHandoffButton from "@/components/ActionFollowUpQuickLogHandoffButton";
import {
  loadActionFollowUpExistingPhotoCandidates,
  type ExistingPhotoCandidateLoadResult,
} from "@/lib/actionFollowUpExistingPhotoService";

export interface ActionFollowUpEvidenceSectionAction {
  id: string;
  status: string;
  growId: string;
  tentId: string | null;
  plantId: string | null;
  actionLabel: string;
}

export interface ActionFollowUpEvidenceSectionProps {
  action: ActionFollowUpEvidenceSectionAction;
  /** Optional service injection for tests. */
  save?: (draft: ActionFollowUpDraft) => Promise<ActionFollowUpEvidenceSaveResult>;
  /** Optional photo-candidate loader injection for tests. */
  loadPhotoCandidates?: (ctx: {
    authenticatedUserId: string;
    growId: string;
    tentId: string | null;
    plantId: string | null;
  }) => Promise<ExistingPhotoCandidateLoadResult>;
}

type QueryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; existing: ActionFollowUpEvidenceRecord | null };

function projectRow(row: {
  id: string | null;
  grow_id: string | null;
  tent_id: string | null;
  plant_id: string | null;
  note: string | null;
  details: unknown;
}): ActionFollowUpEvidenceRecord | null {
  if (!row.id || !row.grow_id) return null;
  const d =
    row.details && typeof row.details === "object"
      ? (row.details as Record<string, unknown>)
      : {};
  const outcome = (d.outcome as ActionFollowUpEvidenceRecord["outcome"]) ?? "unclear";
  return {
    diaryEntryId: row.id,
    actionQueueId: typeof d.action_queue_id === "string" ? d.action_queue_id : "",
    growId: row.grow_id,
    tentId: row.tent_id,
    plantId: row.plant_id,
    outcome,
    note: typeof d.note === "string" ? d.note : (row.note ?? ""),
    observedAt: typeof d.observed_at === "string" ? d.observed_at : "",
    photoReference: typeof d.photo_reference === "string" ? d.photo_reference : null,
    sensorSnapshotId: typeof d.sensor_snapshot_id === "string" ? d.sensor_snapshot_id : null,
    idempotencyKey:
      typeof d.idempotency_key === "string"
        ? d.idempotency_key
        : `action-followup:${typeof d.action_queue_id === "string" ? d.action_queue_id : ""}`,
  };
}

function pickPrimary(
  rows: Array<{ id: string | null } & Record<string, unknown>>,
  actionId: string,
): (typeof rows)[number] | null {
  const matched = rows.filter((r) =>
    followupMatchesAction(
      { details: (r as { details?: unknown }).details as { event_type?: unknown; action_queue_id?: unknown } | null },
      actionId,
    ),
  );
  if (matched.length === 0) return null;
  return matched.reduce((earliest, cur) => {
    if (!earliest) return cur;
    const a = String(earliest.id ?? "");
    const b = String(cur.id ?? "");
    return a <= b ? earliest : cur;
  }, matched[0]);
}

export default function ActionFollowUpEvidenceSection({
  action,
  save,
  loadPhotoCandidates,
}: ActionFollowUpEvidenceSectionProps) {
  const { user } = useAuth();
  const authenticatedUserId = user?.id ?? null;
  const [query, setQuery] = useState<QueryState>({ status: "loading" });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [photoState, setPhotoState] = useState<ExistingPhotoLoadState>({ status: "loading" });
  const [selectedPhotoReference, setSelectedPhotoReference] = useState<string | null>(null);

  const saveFn = save ?? saveActionFollowUpEvidence;
  const loadPhotosFn = loadPhotoCandidates ?? loadActionFollowUpExistingPhotoCandidates;

  useEffect(() => {
    let cancelled = false;
    setQuery({ status: "loading" });
    (async () => {
      const { data, error } = await supabase
        .from("diary_entries")
        .select("id,grow_id,tent_id,plant_id,note,details")
        .eq("grow_id", action.growId)
        .contains("details", {
          event_type: ACTION_FOLLOWUP_EVENT_TYPE,
          action_queue_id: action.id,
        });
      if (cancelled) return;
      if (error) {
        setQuery({ status: "error" });
        return;
      }
      const rows = (data ?? []) as Array<Record<string, unknown> & { id: string | null }>;
      const primary = pickPrimary(rows, action.id);
      const existing = primary
        ? projectRow(
            primary as unknown as {
              id: string | null;
              grow_id: string | null;
              tent_id: string | null;
              plant_id: string | null;
              note: string | null;
              details: unknown;
            },
          )
        : null;
      setQuery({ status: "ready", existing });
    })();
    return () => {
      cancelled = true;
    };
  }, [action.id, action.growId, reloadNonce]);

  // Load existing owned photo candidates (Slice 4c). Failure is silent —
  // the selector shows the safe "unavailable" copy and the form remains
  // usable with `photoReference: null`.
  useEffect(() => {
    let cancelled = false;
    if (!authenticatedUserId) {
      setPhotoState({ status: "failed" });
      return;
    }
    setPhotoState({ status: "loading" });
    (async () => {
      try {
        const res = await loadPhotosFn({
          authenticatedUserId,
          growId: action.growId,
          tentId: action.tentId,
          plantId: action.plantId,
        });
        if (cancelled) return;
        if (res.status === "loaded") {
          setPhotoState({ status: "loaded", candidates: res.candidates });
        } else {
          setPhotoState({ status: "failed" });
        }
      } catch {
        if (!cancelled) setPhotoState({ status: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    authenticatedUserId,
    action.growId,
    action.tentId,
    action.plantId,
    loadPhotosFn,
    reloadNonce,
  ]);

  const eligibility = useMemo(
    () =>
      evaluateActionFollowUpEligibility({
        actionId: action.id,
        actionStatus: action.status,
        growId: action.growId,
        tentId: action.tentId,
        plantId: action.plantId,
        existingFollowUpCount:
          query.status === "ready" && query.existing ? 1 : 0,
        currentUserOwnsAction: true,
      }),
    [action, query],
  );

  const handleSubmit = useCallback(
    async (values: ActionFollowUpFormSubmit) => {
      setSaving(true);
      setErrorMessage(null);
      const draft: ActionFollowUpDraft = {
        actionQueueId: action.id,
        growId: action.growId,
        tentId: action.tentId,
        plantId: action.plantId,
        outcome: values.outcome,
        note: values.note,
        observedAt: values.observedAt,
        photoReference: values.photoReference,
        sensorSnapshotId: values.sensorSnapshotId,
      };
      try {
        const result = await saveFn(draft);
        if (result.status === "created") {
          toast.success("Follow-up recorded.");
          setQuery({ status: "ready", existing: result.followUp });
          setShowForm(false);
        } else if (result.status === "existing") {
          toast.message("A follow-up is already linked to this action.");
          setQuery({ status: "ready", existing: result.followUp });
          setShowForm(false);
        } else if (result.status === "blocked") {
          let msg = "This action is not ready for follow-up.";
          if (result.reason === "action_not_completed") {
            msg = "This action is not ready for follow-up.";
          } else if (result.reason === "action_not_found" || result.reason === "wrong_owner") {
            msg = "This action could not be verified.";
          } else if (
            result.reason === "existing_follow_up_unreadable" ||
            result.reason === "relationship_mismatch"
          ) {
            msg = "A follow-up is already linked to this action.";
          } else if (result.reason === "invalid_draft") {
            msg = "Please check the follow-up details and try again.";
          }
          setErrorMessage(msg);
        } else {
          setErrorMessage("Couldn't record the follow-up. Try again.");
        }
      } catch {
        setErrorMessage("Couldn't record the follow-up. Try again.");
      } finally {
        setSaving(false);
      }
    },
    [action, saveFn],
  );

  const viewModel = useMemo(
    () =>
      query.status === "ready" && query.existing
        ? buildActionFollowUpEvidenceViewModel({
            record: query.existing,
            actionLabel: action.actionLabel,
          })
        : null,
    [query, action.actionLabel],
  );

  const ineligibleCopy = useMemo(() => {
    if (eligibility.eligible === true) return "";
    const reason: string = eligibility.reason;
    if (reason === "action_not_completed")
      return "Complete this action to record a follow-up.";
    return "Follow-up isn't available for this action.";
  }, [eligibility]);

  return (
    <section
      data-testid="action-followup-section"
      aria-label="Action follow-up"
      className="glass rounded-2xl p-4 mb-4 space-y-3"
    >
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <CircleCheckBig className="h-4 w-4" /> What happened afterward?
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Record a short follow-up so this action becomes useful plant memory.
        </p>
      </div>

      {query.status === "loading" && (
        <p className="text-sm text-muted-foreground" data-testid="action-followup-loading">
          Loading follow-up…
        </p>
      )}

      {query.status === "error" && (
        <div className="space-y-2" data-testid="action-followup-query-error">
          <p role="alert" className="text-sm text-red-500">
            We couldn't check the follow-up status. Try again.
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setReloadNonce((n) => n + 1)}
          >
            Retry
          </Button>
        </div>
      )}

      {query.status === "ready" && viewModel && (
        <ActionFollowUpEvidenceCard
          viewModel={viewModel}
          photoEvidenceSlot={
            viewModel.hasPhotoEvidence ? (
              <ActionFollowUpExistingPhotoEvidence reference={viewModel.photoReference} />
            ) : null
          }
        />
      )}

      {query.status === "ready" && !viewModel && (
        <>
          {eligibility.eligible ? (
            showForm ? (
              <ActionFollowUpEvidenceForm
                saving={saving}
                errorMessage={errorMessage}
                onSubmit={handleSubmit}
                onCancel={() => {
                  setShowForm(false);
                  setErrorMessage(null);
                }}
                photoReference={selectedPhotoReference}
                photoSelectorSlot={
                  <div className="space-y-3">
                    <ActionFollowUpExistingPhotoSelector
                      state={photoState}
                      value={selectedPhotoReference}
                      onChange={setSelectedPhotoReference}
                      disabled={saving}
                    />
                    <ActionFollowUpQuickLogHandoffButton
                      action={{
                        actionId: action.id,
                        growId: action.growId,
                        tentId: action.tentId,
                        plantId: action.plantId,
                      }}
                      disabled={saving}
                      onPhotoCreated={() => setReloadNonce((n) => n + 1)}
                    />
                  </div>
                }
              />
            ) : (
            <Button
              size="sm"
              variant="secondary"
              data-testid="action-followup-add-btn"
              onClick={() => setShowForm(true)}
            >
              Add follow-up
            </Button>
            )
          ) : (
            <p
              className="text-xs text-muted-foreground"
              data-testid="action-followup-ineligible"
            >
              {ineligibleCopy}
            </p>
          )}
        </>
      )}
    </section>
  );
}
