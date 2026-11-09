import { useQueryClient } from "@tanstack/react-query";
import FieldNotebook, {
  type FieldNotebookSaveRequest,
  type FieldNotebookSaveResponse,
  type FieldNotebookTent,
} from "@/components/FieldNotebook";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";
import { supabase } from "@/integrations/supabase/client";
import { applyQuickLogV2Refresh } from "@/lib/quickLogV2RefreshRules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import type { FieldNotebookServerEntry, RefreshReflection } from "@/lib/fieldNotebookOutcomeRules";
import type { ReadingSlot } from "@/lib/fieldNotebookViewModel";

const EMPTY_REFLECTION: RefreshReflection = {
  timelineHasEntry: false,
  countIncludesEntry: false,
  lastActivityIncludesEntry: false,
};

const FULL_REFLECTION: RefreshReflection = {
  timelineHasEntry: true,
  countIncludesEntry: true,
  lastActivityIncludesEntry: true,
};

export default function FieldNotebookMount({
  tents,
  readingsByTent = {},
}: {
  tents: Array<{ id: string; name: string }>;
  readingsByTent?: Record<string, ReadingSlot[]>;
}) {
  const queryClient = useQueryClient();
  const { save } = useQuickLogV2Save();
  const notebookTents: FieldNotebookTent[] = tents.map((tent) => ({
    id: tent.id,
    name: tent.name,
    weekLabel: "Week —",
    ageLabel: "Age: —",
    startedLabel: "—",
  }));

  async function onSave(request: FieldNotebookSaveRequest): Promise<FieldNotebookSaveResponse> {
    const built = buildQuickLogV2SavePayload({
      resolved: {
        ok: true,
        targetType: "tent",
        targetId: request.tentId,
        tentId: request.tentId,
        plantId: null,
        growId: null,
      },
      action: "note",
      volumeMl: "",
      note: request.note,
      temperatureC: "",
      humidityPct: "",
      vpdKpa: "",
      idempotencyKey: request.idempotencyKey,
    });
    if (!built.ok) {
      return {
        transport: { kind: "definitive_rejection", reason: built.reason },
        reflection: EMPTY_REFLECTION,
      };
    }
    const result = await save(built.payload, { verifyPersistedNote: true });
    if (!result.ok) {
      if (result.definitiveRejected) {
        return {
          transport: { kind: "definitive_rejection", reason: result.reason ?? "rejected" },
          reflection: EMPTY_REFLECTION,
        };
      }
      return { transport: { kind: "dispatched_no_receipt" }, reflection: EMPTY_REFLECTION };
    }
    const entry: FieldNotebookServerEntry = {
      growEventId: result.growEventId ?? "",
      tentId: request.tentId,
      tentName: request.tentName,
      note: request.note,
      occurredAt: result.serverOccurredAt ?? "",
    };
    if (!result.growEventId || !result.serverOccurredAt) {
      return { transport: { kind: "acknowledged", entry }, reflection: EMPTY_REFLECTION };
    }
    try {
      applyQuickLogV2Refresh(queryClient, {
        targetType: "tent",
        targetId: request.tentId,
        tentId: request.tentId,
      });
      await queryClient.refetchQueries({ queryKey: ["quick_log_grouped_timeline"] });
      await queryClient.refetchQueries({ queryKey: ["timeline_memory"] });
      await queryClient.refetchQueries({ queryKey: ["dashboard_recent_activity"] });
    } catch {
      return { transport: { kind: "acknowledged", entry }, reflection: EMPTY_REFLECTION };
    }
    return { transport: { kind: "acknowledged", entry }, reflection: FULL_REFLECTION };
  }

  async function onFindEntry(
    _tentId: string,
    knownEventId: string | null,
  ): Promise<FieldNotebookServerEntry[]> {
    if (!knownEventId) return [];
    const { data, error } = await supabase
      .from("grow_events")
      .select("id,tent_id,note,occurred_at")
      .eq("id", knownEventId)
      .maybeSingle();
    if (error || !data || data.id !== knownEventId || typeof data.occurred_at !== "string")
      return [];
    const tent = tents.find((item) => item.id === data.tent_id);
    return [
      {
        growEventId: data.id,
        tentId: typeof data.tent_id === "string" ? data.tent_id : _tentId,
        tentName: tent?.name ?? "",
        note: typeof data.note === "string" ? data.note : "",
        occurredAt: data.occurred_at,
      },
    ];
  }

  if (notebookTents.length === 0) return null;
  return (
    <FieldNotebook
      tents={notebookTents}
      readingsByTent={readingsByTent}
      onSave={onSave}
      onFindEntry={onFindEntry}
    />
  );
}
