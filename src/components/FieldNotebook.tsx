import { useEffect, useRef, useState } from "react";
import {
  acknowledgeFound,
  applyTransport,
  backToNote,
  emptyDraft,
  reconcileAttempt,
  type FieldNotebookServerEntry,
  type NotebookDraft,
  type RefreshReflection,
  type SaveTransport,
} from "@/lib/fieldNotebookOutcomeRules";
import {
  FIELD_NOTEBOOK_EMPTY_NOTE_PLACEHOLDER,
  FIELD_NOTEBOOK_READING_MISSING,
  formatFoundTitle,
  formatReadingProvenance,
  formatReadingValue,
  formatServerClockLabel,
  statusView,
  vpdAllowed,
  type ReadingSlot,
} from "@/lib/fieldNotebookViewModel";

export interface FieldNotebookTent {
  id: string;
  name: string;
  weekLabel: string;
  ageLabel: string;
  startedLabel: string;
}

export interface FieldNotebookSaveRequest {
  tentId: string;
  tentName: string;
  note: string;
  idempotencyKey: string;
}

export interface FieldNotebookSaveResponse {
  transport: SaveTransport;
  reflection: RefreshReflection;
}

const NONE: RefreshReflection = {
  timelineHasEntry: false,
  countIncludesEntry: false,
  lastActivityIncludesEntry: false,
};

function reading(label: ReadingSlot["label"], slot: ReadingSlot | undefined): ReadingSlot {
  return (
    slot ?? {
      label,
      value: null,
      source: null,
      ageLabel: null,
      capturedAtMs: null,
    }
  );
}

export default function FieldNotebook({
  tents,
  readingsByTent,
  onSave,
  onFindEntry,
}: {
  tents: FieldNotebookTent[];
  readingsByTent: Record<string, ReadingSlot[]>;
  onSave: (request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>;
  onFindEntry: (tentId: string, knownEventId: string | null) => Promise<FieldNotebookServerEntry[]>;
}) {
  const [selectedId, setSelectedId] = useState(tents[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, NotebookDraft>>({});
  const [surface, setSurface] = useState<"grow" | "timeline">("grow");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const keys = useRef<Record<string, string>>({});

  const selected = tents.find((t) => t.id === selectedId) ?? tents[0];
  const draft = selected ? (drafts[selected.id] ?? emptyDraft(selected.id)) : null;

  useEffect(() => {
    const node = selected ? tabRefs.current[selected.id] : null;
    if (typeof node?.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selected]);

  if (!selected || !draft) return null;
  const current: NotebookDraft = draft;

  const slots = readingsByTent[selected.id] ?? [];
  const temp = reading(
    "TEMP",
    slots.find((s) => s.label === "TEMP"),
  );
  const rh = reading(
    "RH",
    slots.find((s) => s.label === "RH"),
  );
  const ppfd = reading(
    "PPFD",
    slots.find((s) => s.label === "PPFD"),
  );
  const vpdSlot = reading(
    "VPD",
    slots.find((s) => s.label === "VPD"),
  );
  const showVpd = vpdAllowed(temp, rh) && vpdSlot.value !== null;
  const visiblePhase =
    surface === "timeline" && (draft.phase === "check_found" || draft.phase === "check_none")
      ? draft.phase
      : draft.phase;
  const clockLabel = draft.serverOccurredAt ? formatServerClockLabel(draft.serverOccurredAt) : null;
  const view = statusView({
    phase: visiblePhase,
    tentName: selected.name,
    serverTimeLabel: clockLabel,
  });

  function put(next: NotebookDraft) {
    setDrafts((prev) => ({ ...prev, [next.tentId]: next }));
  }

  async function submit(kind: "save" | "retry") {
    if (kind === "save" && current.writeBlocked) return;
    if (kind === "retry" && current.phase !== "clear_failure") return;
    const idempotencyKey = keys.current[selected.id] ?? crypto.randomUUID();
    keys.current[selected.id] = idempotencyKey;
    put({ ...current, phase: "saving" });
    try {
      const response = await onSave({
        tentId: selected.id,
        tentName: selected.name,
        note: current.note,
        idempotencyKey,
      });
      const next = applyTransport(current, response.transport, response.reflection);
      if (next.phase === "saved") delete keys.current[selected.id];
      put(next);
    } catch {
      put(applyTransport(current, { kind: "dispatched_no_receipt" }, NONE));
    }
  }

  async function checkTimeline() {
    const candidates = await onFindEntry(selected.id, current.knownEventId);
    const reconciled = reconcileAttempt(current.knownEventId, candidates);
    if (reconciled.status === "found") {
      put({
        ...current,
        phase: "check_found",
        serverOccurredAt: reconciled.entry.occurredAt,
        writeBlocked: true,
      });
    } else if (reconciled.status === "none") {
      put({ ...current, phase: "check_none", writeBlocked: true });
    } else {
      put({ ...current, phase: "uncertain", writeBlocked: true });
    }
    setSurface("timeline");
  }

  const foundLabel =
    draft.serverOccurredAt && formatServerClockLabel(draft.serverOccurredAt)
      ? formatFoundTitle(selected.name, clockLabel ?? "")
      : selected.name;

  return (
    <section
      className="rounded-xl border bg-card p-3 text-card-foreground"
      data-testid="field-notebook"
      aria-label="Current Grow"
    >
      <h2 className="text-sm font-semibold">Current Grow</h2>
      <div
        className="mt-2 flex gap-2 overflow-x-auto"
        data-testid="field-notebook-tabs"
        role="tablist"
      >
        {tents.map((tent) => {
          const active = tent.id === selected.id;
          return (
            <button
              key={tent.id}
              ref={(node) => {
                tabRefs.current[tent.id] = node;
              }}
              type="button"
              role="tab"
              aria-selected={active}
              className={`min-h-11 shrink-0 px-3 text-sm ${active ? "border-b-2 border-primary font-bold text-primary" : ""}`}
              onClick={() => {
                setSelectedId(tent.id);
                setSurface("grow");
              }}
            >
              {tent.name}
            </button>
          );
        })}
      </div>

      {surface === "grow" ? (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{selected.name}</p>
            <h3 className="text-xl font-semibold">
              {selected.name} · {selected.weekLabel}
            </h3>
            <p className="text-sm text-muted-foreground">
              {selected.ageLabel} · Started: {selected.startedLabel}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-sm" data-testid="field-notebook-readings">
            {(
              [
                ["TEMP", temp],
                ["RH", rh],
                [
                  "VPD",
                  showVpd ? vpdSlot : { ...vpdSlot, value: null, source: null, ageLabel: null },
                ],
                ["PPFD", ppfd],
              ] as const
            ).map(([label, slot]) => (
              <div key={label}>
                <div className="text-xs text-muted-foreground">{label}</div>
                <div>{formatReadingValue(slot.value)}</div>
                <div className="text-xs text-muted-foreground">
                  {slot.value === null
                    ? ""
                    : (formatReadingProvenance(slot) ?? FIELD_NOTEBOOK_READING_MISSING)}
                </div>
              </div>
            ))}
          </div>
          <label className="block text-sm font-medium" htmlFor="field-notebook-note">
            Observation
          </label>
          <textarea
            id="field-notebook-note"
            className="min-h-24 w-full rounded-md border bg-background p-2 text-base"
            placeholder={FIELD_NOTEBOOK_EMPTY_NOTE_PLACEHOLDER}
            value={draft.note}
            onChange={(event) =>
              put({
                ...draft,
                note: event.target.value,
                phase: draft.writeBlocked ? draft.phase : "editing",
              })
            }
          />
          {view.statusLine ? (
            <p className="text-sm" data-testid="field-notebook-status">
              {view.statusLine}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            {view.showCheckTimeline ? (
              <button
                type="button"
                className="min-h-11 rounded-md border px-3 text-sm font-medium"
                onClick={() => void checkTimeline()}
              >
                Check Timeline
              </button>
            ) : null}
            <button
              type="button"
              className="min-h-11 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
              disabled={view.primaryDisabled || draft.phase === "saving"}
              onClick={() => void submit(view.showRetry ? "retry" : "save")}
            >
              {view.primaryLabel}
            </button>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="field-notebook-photo-note">
            Photo reload across a refresh is unproven. A chosen photo stays in this session only.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3" data-testid="field-notebook-timeline-check">
          <p className="text-sm font-medium">Timeline</p>
          <p data-testid="field-notebook-status">{view.statusLine}</p>
          {draft.phase === "check_found" ? (
            <>
              <p className="font-semibold">{foundLabel}</p>
              <p>Entry found</p>
              <p>{draft.note}</p>
            </>
          ) : (
            <p>{draft.note}</p>
          )}
          <button
            type="button"
            className="min-h-11 w-full rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            onClick={() => {
              if (draft.phase === "check_found") {
                delete keys.current[selected.id];
                put(acknowledgeFound(draft));
                setSurface("grow");
                return;
              }
              put(backToNote(draft));
              setSurface("grow");
            }}
          >
            {view.primaryLabel}
          </button>
        </div>
      )}
    </section>
  );
}
