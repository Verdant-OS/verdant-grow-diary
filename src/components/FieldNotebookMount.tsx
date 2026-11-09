import { useQueryClient } from "@tanstack/react-query";
import FieldNotebook, {
  type FieldNotebookSaveRequest,
  type FieldNotebookSaveResponse,
  type FieldNotebookTent,
} from "@/components/FieldNotebook";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";
import { readDashboardRecent } from "@/hooks/useDashboardScopedData";
import { dispatchQuickLogV2EntryCreated } from "@/lib/quickLogV2EntryCreatedEvent";
import { applyQuickLogV2Refresh } from "@/lib/quickLogV2RefreshRules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { findNotebookEntry } from "@/lib/fieldNotebookFindService";
import { buildQuickLogGroupedTimelineQueryOptions } from "@/hooks/useQuickLogGroupedTimeline";
import { reflectionFromEvidence } from "@/lib/fieldNotebookReflection";
import type { FieldNotebookServerEntry, RefreshReflection } from "@/lib/fieldNotebookOutcomeRules";
import type { ReadingSlot } from "@/lib/fieldNotebookViewModel";

const EMPTY_REFLECTION: RefreshReflection = {
  timelineHasEntry: false,
  countIncludesEntry: false,
  lastActivityIncludesEntry: false,
};

export function FieldNotebookScope({
  growsLoading,
  growId,
  tents,
  reloadRecent,
}: {
  growsLoading: boolean;
  growId: string | null;
  tents: Array<{ id: string; name: string }>;
  reloadRecent?: () => Promise<void>;
}) {
  if (growsLoading || !growId) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="field-notebook-scope">
        {growsLoading
          ? "Current grow is still resolving."
          : "Choose a grow before recording an observation."}
      </p>
    );
  }
  return <FieldNotebookMount growId={growId} tents={tents} reloadRecent={reloadRecent} />;
}

export default function FieldNotebookMount({
  growId,
  tents,
  readingsByTent = {},
  reloadRecent,
}: {
  growId: string;
  tents: Array<{ id: string; name: string }>;
  readingsByTent?: Record<string, ReadingSlot[]>;
  reloadRecent?: () => Promise<void>;
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

  async function reflect(growEventId: string, tentId: string): Promise<RefreshReflection> {
    dispatchQuickLogV2EntryCreated({
      createdAt: new Date().toISOString(),
      growEventId,
      source: "quick_log_v2",
      activityId: "note",
    });
    applyQuickLogV2Refresh(queryClient, {
      targetType: "tent",
      targetId: tentId,
      tentId,
    });
    let fetchedTimeline: unknown = null;
    try {
      fetchedTimeline = await queryClient.fetchQuery(
        buildQuickLogGroupedTimelineQueryOptions({ kind: "tent", tentId }),
      );
    } catch {
      fetchedTimeline = null;
    }
    await queryClient.refetchQueries({ queryKey: ["quick_log_grouped_timeline"] });
    await queryClient.refetchQueries({ queryKey: ["timeline_memory"] });
    if (reloadRecent) await reloadRecent();
    const recent = await readDashboardRecent(growId);
    const cached = [
      ...queryClient.getQueriesData({ queryKey: ["quick_log_grouped_timeline"] }),
      ...queryClient.getQueriesData({ queryKey: ["timeline_memory"] }),
    ].map(([, data]) => data);
    const timelineCaches = [fetchedTimeline, ...cached];
    return reflectionFromEvidence({
      timelineCaches,
      recentItems: recent.status === "ok" ? recent.items : null,
      growEventId,
    });
  }

  async function onSave(request: FieldNotebookSaveRequest): Promise<FieldNotebookSaveResponse> {
    const built = buildQuickLogV2SavePayload({
      resolved: {
        ok: true,
        targetType: "tent",
        targetId: request.tentId,
        tentId: request.tentId,
        plantId: null,
        growId,
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
      if (result.reason === "save_in_flight") {
        return {
          transport: { kind: "not_dispatched", reason: "save_in_flight" },
          reflection: EMPTY_REFLECTION,
        };
      }
      if (result.definitiveRejected) {
        return {
          transport: { kind: "definitive_rejection", reason: result.reason ?? "rejected" },
          reflection: EMPTY_REFLECTION,
        };
      }
      const keptId = "growEventId" in result ? result.growEventId : null;
      if (typeof keptId === "string" && keptId.length > 0) {
        const entry: FieldNotebookServerEntry = {
          growEventId: keptId,
          tentId: request.tentId,
          tentName: request.tentName,
          note: request.note,
          occurredAt: "",
        };
        return { transport: { kind: "acknowledged", entry }, reflection: EMPTY_REFLECTION };
      }
      return { transport: { kind: "dispatched_no_receipt" }, reflection: EMPTY_REFLECTION };
    }
    const entry: FieldNotebookServerEntry = {
      growEventId: result.growEventId ?? "",
      tentId: request.tentId,
      tentName: request.tentName,
      note: result.persistedNote ?? request.note,
      occurredAt: result.serverOccurredAt ?? "",
    };
    if (!result.growEventId || !result.serverOccurredAt) {
      return { transport: { kind: "acknowledged", entry }, reflection: EMPTY_REFLECTION };
    }
    try {
      const reflection = await reflect(result.growEventId, request.tentId);
      return { transport: { kind: "acknowledged", entry }, reflection };
    } catch {
      return { transport: { kind: "acknowledged", entry }, reflection: EMPTY_REFLECTION };
    }
  }

  if (notebookTents.length === 0) return null;
  return (
    <FieldNotebook
      tents={notebookTents}
      readingsByTent={readingsByTent}
      growId={growId}
      onSave={onSave}
      onFindEntry={async (tentId, knownEventId) => {
        const tent = tents.find((item) => item.id === tentId);
        const receipt = await findNotebookEntry({
          tentId,
          tentName: tent?.name ?? "",
          knownEventId,
        });
        if (receipt.availability === "unavailable") return { availability: "unavailable" };
        return receipt.candidates;
      }}
    />
  );
}
