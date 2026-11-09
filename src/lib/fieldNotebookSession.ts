import { emptyDraft, type NotebookDraft } from "@/lib/fieldNotebookOutcomeRules";

/** In-memory only. A reload still drops drafts (#2806). */
const drafts = new Map<string, NotebookDraft>();

export function readNotebookDraft(tentId: string): NotebookDraft {
  return drafts.get(tentId) ?? emptyDraft(tentId);
}

export function writeNotebookDraft(draft: NotebookDraft): void {
  drafts.set(draft.tentId, draft);
}

export function notebookDrafts(): NotebookDraft[] {
  return [...drafts.values()];
}

export function clearNotebookSession(): void {
  drafts.clear();
}
