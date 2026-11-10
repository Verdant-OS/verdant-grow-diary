import { useEffect, useRef, useState } from "react";
import NotebookRouteLink from "@/components/NotebookRouteLink";
import { timelinePath } from "@/lib/routes";
import {
  acknowledgeFound,
  applyTransport,
  backToNote,
  emptyDraft,
  canonicalNotebookNote,
  draftAfterTimelineCheck,
  maySubmit,
  notesMatchCanonical,
  reconcileAttempt,
  type FieldNotebookAttempt,
  type FieldNotebookServerEntry,
  type NotebookDraft,
  type RefreshReflection,
  type SaveTransport,
} from "@/lib/fieldNotebookOutcomeRules";
import {
  notebookSessionOwner,
  readNotebookDraft,
  subscribeNotebookSession,
  writeNotebookDraft,
} from "@/lib/fieldNotebookSession";
import {
  FIELD_NOTEBOOK_EMPTY_NOTE_PLACEHOLDER,
  FIELD_NOTEBOOK_READING_MISSING,
  formatFoundTitle,
  formatRetractedLine,
  formatReadingProvenance,
  formatReadingValue,
  formatServerClockLabel,
  statusView,
  vpdAllowed,
  type ReadingSlot,
} from "@/lib/fieldNotebookViewModel";
type FindResult =
  | FieldNotebookServerEntry[]
  | { availability: "unavailable" }
  | {
      availability: "authoritative";
      candidates: FieldNotebookServerEntry[];
      matchedEventId: string;
    };

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
  attemptId: string;
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
  return slot ?? { label, value: null, source: null, ageLabel: null, capturedAtMs: null };
}

function beginAttempt(
  draft: NotebookDraft,
  tentName: string,
  reuse: boolean,
): FieldNotebookAttempt {
  if (reuse && draft.attempt) return draft.attempt;
  return {
    attemptId: crypto.randomUUID(),
    tentId: draft.tentId,
    tentName,
    note: canonicalNotebookNote(draft.note),
    idempotencyKey: crypto.randomUUID(),
  };
}

export default function FieldNotebook({
  tents,
  readingsByTent,
  onSave,
  onFindEntry,
  growId = null,
}: {
  tents: FieldNotebookTent[];
  readingsByTent: Record<string, ReadingSlot[]>;
  onSave: (request: FieldNotebookSaveRequest) => Promise<FieldNotebookSaveResponse>;
  onFindEntry: (
    tentId: string,
    knownEventId: string | null,
    idempotencyKey?: string | null,
  ) => Promise<FindResult>;
  growId?: string | null;
}) {
  const saveInFlight = useRef(false);
  const [selectedId, setSelectedId] = useState(tents[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, NotebookDraft>>(() => {
    const initial: Record<string, NotebookDraft> = {};
    for (const tent of tents) initial[tent.id] = readNotebookDraft(tent.id);
    return initial;
  });
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const selected = tents.find((t) => t.id === selectedId) ?? tents[0];
  const draft = selected ? (drafts[selected.id] ?? readNotebookDraft(selected.id)) : null;

  useEffect(() => {
    return subscribeNotebookSession(() => {
      setDrafts((prev) => {
        const next = { ...prev };
        for (const tent of tents) next[tent.id] = readNotebookDraft(tent.id);
        return next;
      });
    });
  }, [tents]);

  useEffect(() => {
    const node = selected ? tabRefs.current[selected.id] : null;
    if (typeof node?.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selected?.id]);

  if (!selected || !draft) return null;

  function put(next: NotebookDraft, asOwner: string | null = notebookSessionOwner()) {
    writeNotebookDraft(next, asOwner);
    setDrafts((prev) => ({ ...prev, [next.tentId]: next }));
  }

  async function submit(kind: "save" | "retry" | "save_again") {
    const live = drafts[selected.id] ?? readNotebookDraft(selected.id);
    const ready =
      kind === "save" &&
      live.phase === "saved" &&
      !notesMatchCanonical(live.note, live.completedNote)
        ? { ...live, phase: "editing" as const }
        : live;
    if (kind === "save_again" && (live.phase !== "uncertain" || live.attempt == null)) return;
    if (kind === "save" && !maySubmit(ready)) return;
    if (kind === "retry" && live.phase !== "clear_failure") return;
    if (saveInFlight.current || readNotebookDraft(selected.id).phase === "saving") return;
    const reuseAttempt =
      kind === "retry" ||
      kind === "save_again" ||
      (ready.attempt != null && notesMatchCanonical(ready.note, ready.attempt.note));
    const attempt = beginAttempt(ready, selected.name, reuseAttempt);
    const ownerAtSubmit = notebookSessionOwner();
    const tentId = selected.id;
    const frozen: NotebookDraft = {
      ...ready,
      phase: "saving",
      attempt,
      saveAgainRejected: kind === "save_again" ? ready.saveAgainRejected === true : false,
      knownEventId: null,
      verifiedEntry: null,
      serverOccurredAt: null,
      recoverySurface: "grow",
    };
    saveInFlight.current = true;
    put(frozen);
    try {
      const response = await onSave({
        tentId,
        tentName: selected.name,
        note: attempt.note,
        idempotencyKey: attempt.idempotencyKey,
        attemptId: attempt.attemptId,
      });
      settleSave(tentId, attempt, ownerAtSubmit, response.transport, response.reflection);
    } catch {
      // A throw after dispatch is the same as no reply: the rejection offer does not survive it.
      settleSave(tentId, attempt, ownerAtSubmit, { kind: "dispatched_no_receipt" }, NONE);
    } finally {
      saveInFlight.current = false;
    }
  }

  function settleSave(
    tentId: string,
    attempt: FieldNotebookAttempt,
    ownerAtSubmit: string | null,
    transport: SaveTransport,
    reflection: RefreshReflection,
  ) {
    const current = readNotebookDraft(tentId);
    if (current.attempt?.attemptId !== attempt.attemptId || current.phase !== "saving") return;
    const settled = applyTransport(
      { ...current, attempt, note: attempt.note },
      transport,
      reflection,
    );
    const next = {
      ...settled,
      note: settled.phase === "uncertain" && attempt ? attempt.note : current.note,
    };
    writeNotebookDraft(next, ownerAtSubmit);
    setDrafts((prev) => ({ ...prev, [tentId]: next }));
  }

  async function checkTimeline() {
    const tentId = selected.id;
    const started = drafts[tentId] ?? readNotebookDraft(tentId);
    const ownerAtCheck = notebookSessionOwner();
    let receipt: Awaited<ReturnType<typeof onFindEntry>>;
    try {
      receipt = await onFindEntry(
        tentId,
        started.knownEventId,
        started.attempt?.idempotencyKey ?? null,
      );
    } catch {
      receipt = { availability: "unavailable" };
    }
    const availability =
      Array.isArray(receipt) ||
      ("candidates" in receipt && receipt.availability === "authoritative")
        ? "authoritative"
        : "unavailable";
    const candidates = Array.isArray(receipt)
      ? receipt
      : "candidates" in receipt
        ? receipt.candidates
        : [];
    const matchedEventId = Array.isArray(receipt)
      ? started.knownEventId
      : "matchedEventId" in receipt
        ? receipt.matchedEventId
        : started.knownEventId;
    const reconciled = reconcileAttempt(matchedEventId, candidates, availability);
    setDrafts((prev) => {
      const live = prev[tentId] ?? started;
      if (started.attempt && live.attempt?.attemptId !== started.attempt.attemptId) {
        return prev;
      }
      const next = draftAfterTimelineCheck(started, live.note, reconciled);
      writeNotebookDraft(next, ownerAtCheck);
      return { ...prev, [tentId]: next };
    });
  }

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
  const showVpd = vpdAllowed(temp, rh) && vpdSlot.value !== null && vpdSlot.value.trim() !== "";
  const clockLabel = draft.verifiedEntry
    ? formatServerClockLabel(draft.verifiedEntry.occurredAt)
    : draft.serverOccurredAt
      ? formatServerClockLabel(draft.serverOccurredAt)
      : null;
  const noteChanged =
    draft.completedNote !== null && !notesMatchCanonical(draft.note, draft.completedNote);
  const view = statusView({
    phase: draft.phase,
    tentName: selected.name,
    serverTimeLabel: clockLabel,
    noteChanged,
    saveAgainRejected: draft.saveAgainRejected === true,
  });
  const foundLabel =
    draft.verifiedEntry && clockLabel
      ? formatFoundTitle(draft.verifiedEntry.tentName, clockLabel)
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
              onClick={() => setSelectedId(tent.id)}
            >
              {tent.name}
            </button>
          );
        })}
      </div>
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
        {draft.phase === "check_found" || draft.phase === "check_none" ? null : (
          <>
            <label className="block text-sm font-medium" htmlFor="field-notebook-note">
              Observation
            </label>
            <textarea
              id="field-notebook-note"
              className="min-h-24 w-full rounded-md border bg-background p-2 text-base"
              placeholder={FIELD_NOTEBOOK_EMPTY_NOTE_PLACEHOLDER}
              value={draft.note}
              readOnly={
                draft.phase === "saving" ||
                draft.idempotencyRetracted === true ||
                (draft.phase === "uncertain" && draft.attempt != null)
              }
              onChange={(event) => {
                if (
                  draft.phase === "saving" ||
                  draft.idempotencyRetracted === true ||
                  (draft.phase === "uncertain" && draft.attempt != null)
                ) {
                  return;
                }
                const note = event.target.value;
                if (draft.writeBlocked) {
                  put({ ...draft, note });
                  return;
                }
                const sameAttempt =
                  draft.attempt != null && notesMatchCanonical(note, draft.attempt.note);
                if (sameAttempt && draft.phase === "clear_failure") {
                  put({ ...draft, note });
                  return;
                }
                const sameCompleted =
                  draft.completedNote !== null && notesMatchCanonical(note, draft.completedNote);
                put({
                  ...draft,
                  note,
                  phase: sameCompleted ? "saved" : "editing",
                  attempt: sameCompleted || sameAttempt ? draft.attempt : null,
                });
              }}
            />
          </>
        )}
        {draft.idempotencyRetracted || view.statusLine ? (
          <p className="text-sm" data-testid="field-notebook-status">
            {draft.idempotencyRetracted ? formatRetractedLine() : view.statusLine}
          </p>
        ) : null}
        {draft.phase === "check_found" && draft.verifiedEntry ? (
          <div data-testid="field-notebook-timeline-check">
            <p className="font-semibold">{foundLabel}</p>
            <p>Entry found</p>
            <p>{draft.verifiedEntry.note}</p>
          </div>
        ) : null}
        {draft.phase === "check_none" ? (
          <div data-testid="field-notebook-timeline-check">
            <p>{draft.attempt?.note ?? draft.note}</p>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          {draft.phase === "saved" ? (
            <NotebookRouteLink
              to={timelinePath(growId)}
              className="inline-flex min-h-11 items-center text-sm font-medium underline"
            >
              View in Timeline
            </NotebookRouteLink>
          ) : null}
          {view.showCheckTimeline ? (
            <button
              type="button"
              className="min-h-11 rounded-md border px-3 text-sm font-medium"
              onClick={() => {
                void checkTimeline();
              }}
            >
              Check Timeline
            </button>
          ) : null}
          {draft.phase === "uncertain" &&
          (draft.idempotencyRetracted || draft.saveAgainRejected) ? (
            <button
              type="button"
              className="min-h-11 rounded-md border px-3 text-sm font-medium"
              onClick={() => {
                put({
                  ...emptyDraft(draft.tentId),
                  note: draft.attempt?.note ?? draft.note,
                });
              }}
            >
              Start a new note
            </button>
          ) : null}
          {draft.phase === "uncertain" && draft.attempt && !draft.idempotencyRetracted ? (
            <button
              type="button"
              className="min-h-11 rounded-md border px-3 text-sm font-medium"
              onClick={() => {
                void submit("save_again");
              }}
            >
              Save again (won't duplicate)
            </button>
          ) : null}
          {view.showCheckTimeline ? (
            <NotebookRouteLink
              to={timelinePath(growId)}
              className="inline-flex min-h-11 items-center text-sm font-medium underline"
            >
              Open Timeline
            </NotebookRouteLink>
          ) : null}
          {draft.phase === "check_found" || draft.phase === "check_none" ? (
            <button
              type="button"
              className="min-h-11 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
              onClick={() => {
                if (draft.phase === "check_found" && draft.verifiedEntry) {
                  put({ ...acknowledgeFound(draft), recoverySurface: "grow" });
                  return;
                }
                put(backToNote(draft));
              }}
            >
              {draft.phase === "check_found" ? "Yes, that's it" : "Back to note"}
            </button>
          ) : (
            <button
              type="button"
              className="min-h-11 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
              disabled={
                draft.phase === "saving" ||
                (draft.phase === "editing" && !maySubmit(draft)) ||
                (draft.phase === "saved" ? false : view.primaryDisabled)
              }
              onClick={() => {
                if (draft.phase === "saved" && !noteChanged) {
                  put({ ...draft, note: "", completedNote: null, phase: "editing", attempt: null });
                  return;
                }
                void submit(view.showRetry ? "retry" : "save");
              }}
            >
              {view.primaryLabel}
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground" data-testid="field-notebook-photo-note">
          Photo reload across a refresh is unproven. A chosen photo stays in this session only.
        </p>
      </div>
    </section>
  );
}
