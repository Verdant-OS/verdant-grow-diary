import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import NotebookRouteLink, { navigateNotebookHref } from "@/components/NotebookRouteLink";
import { withGrowId } from "@/lib/routes";
import { acknowledgeFound, backToNote, type NotebookDraft } from "@/lib/fieldNotebookOutcomeRules";
import {
  notebookDrafts,
  notebookSessionOwner,
  readNotebookDraft,
  subscribeNotebookSession,
  writeNotebookDraft,
} from "@/lib/fieldNotebookSession";
import { formatFoundTitle, formatServerClockLabel } from "@/lib/fieldNotebookViewModel";

/** Recovery for attempts that navigated here. An uncertain note is also stored for this account. */
export default function FieldNotebookTimelineRecovery({
  growId = null,
}: {
  growId?: string | null;
}) {
  const router = useRouter({ warn: false });
  const [drafts, setDrafts] = useState<NotebookDraft[]>(() =>
    notebookDrafts().filter((draft) => draft.recoverySurface === "timeline"),
  );

  useEffect(
    () =>
      subscribeNotebookSession(() => {
        setDrafts(notebookDrafts().filter((draft) => draft.recoverySurface === "timeline"));
      }),
    [],
  );

  if (drafts.length === 0) return null;
  return (
    <section
      className="mb-4 space-y-3"
      aria-label="Field notebook recovery"
      data-testid="field-notebook-recovery"
    >
      {drafts.map((draft) => {
        const clock = draft.verifiedEntry
          ? formatServerClockLabel(draft.verifiedEntry.occurredAt)
          : null;
        return (
          <div key={draft.tentId} className="rounded-md border p-3">
            <p className="text-sm font-medium">Not sure this saved</p>
            {draft.phase === "check_found" && draft.verifiedEntry ? (
              <>
                <p className="font-semibold">
                  {clock
                    ? formatFoundTitle(draft.verifiedEntry.tentName, clock)
                    : draft.verifiedEntry.tentName}
                </p>
                <p>Entry found</p>
                <p>{draft.verifiedEntry.note}</p>
                <button
                  type="button"
                  className="mt-2 min-h-11 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
                  onClick={() => {
                    const cleared = acknowledgeFound(readNotebookDraft(draft.tentId));
                    writeNotebookDraft(cleared, notebookSessionOwner());
                    setDrafts((current) => current.filter((item) => item.tentId !== draft.tentId));
                  }}
                >
                  Yes, that's it
                </button>
              </>
            ) : (
              <>
                <p>No matching entry found</p>
                <p>{draft.attempt?.note ?? draft.note}</p>
                <button
                  type="button"
                  className="mt-2 min-h-11 rounded-md border px-3 text-sm font-medium"
                  onClick={() => {
                    const back = {
                      ...backToNote(readNotebookDraft(draft.tentId)),
                      recoverySurface: "grow" as const,
                    };
                    writeNotebookDraft(back, notebookSessionOwner());
                    setDrafts((current) => current.filter((item) => item.tentId !== draft.tentId));
                    if (router) navigateNotebookHref(router, withGrowId("/", growId));
                  }}
                >
                  Back to note
                </button>
              </>
            )}
            <NotebookRouteLink
              to={withGrowId("/", growId)}
              className="mt-2 inline-flex min-h-11 items-center text-sm underline"
            >
              Back to the grow
            </NotebookRouteLink>
          </div>
        );
      })}
    </section>
  );
}
