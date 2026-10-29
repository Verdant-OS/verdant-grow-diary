/**
 * SimpleHomeSetupCard — "Start setup" / "Continue setup" on the Simple home.
 *
 * Presenter only. Shows the grow → tent → plant checklist, one primary action
 * (resume the existing Start Your Room flow, or the plain page), the honest
 * plan-allowance line, and an optional rename for the one existing grow. The
 * rename keeps the grower's text on failure and reports the real outcome.
 * Nothing on this card creates a record.
 */
import { useId, useState } from "react";
import { ArrowRight, Check, Circle, Pencil } from "lucide-react";
import { Link } from "@/lib/react-router-compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isValidGrowName,
  SIMPLE_HOME_SETUP_COPY,
  type SimpleHomeSetupProgress,
} from "@/lib/simpleHomeSetupRules";
import type { GrowRenameResult } from "@/lib/growRenameService";

interface Props {
  progress: SimpleHomeSetupProgress;
  testId: string;
  /** Writes the new name; the card shows the result. Omit to hide the rename offer. */
  onRename?: (growId: string, name: string) => Promise<GrowRenameResult>;
  /** Called after a confirmed rename so the caller can refresh its grows read. */
  onRenamed?: () => void;
}

type RenameStatus =
  { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "failed"; message: string };

export default function SimpleHomeSetupCard({ progress, testId, onRename, onRenamed }: Props) {
  const inputId = useId();
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftName, setDraftName] = useState(progress.growName ?? "");
  const [status, setStatus] = useState<RenameStatus>({ kind: "idle" });

  const renameOffered = progress.canRename && !!progress.growId && typeof onRename === "function";
  const saving = status.kind === "saving";

  async function submitRename() {
    if (!renameOffered || !progress.growId || saving) return;
    if (!isValidGrowName(draftName)) {
      setStatus({ kind: "failed", message: SIMPLE_HOME_SETUP_COPY.renameInvalid });
      return;
    }
    setStatus({ kind: "saving" });
    const result = await onRename!(progress.growId, draftName);
    if (result.ok) {
      setStatus({ kind: "saved" });
      setDraftName(result.name);
      setRenameOpen(false);
      onRenamed?.();
    } else {
      // The grower's text stays in the field; only the outcome changes.
      setStatus({ kind: "failed", message: result.message });
    }
  }

  return (
    <section
      data-testid={testId}
      data-setup-kind={progress.kind}
      data-setup-next={progress.nextStep}
      className="rounded-2xl border border-primary/30 bg-primary/5 p-5 md:p-7"
      aria-labelledby={`${testId}-title`}
    >
      <h2 id={`${testId}-title`} className="font-display text-xl font-semibold md:text-2xl">
        {progress.title}
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
        {progress.body}
      </p>

      <ol className="mt-4 grid gap-2 sm:grid-cols-3" data-testid={`${testId}-steps`}>
        {progress.steps.map((step) => (
          <li
            key={step.key}
            data-testid={`${testId}-step-${step.key}`}
            data-done={step.done ? "true" : "false"}
            className={`flex items-start gap-2 rounded-xl border p-3 ${
              step.done ? "border-primary/40 bg-background/60" : "border-border/60"
            }`}
          >
            {step.done ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <Circle
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <span className="min-w-0">
              <span className="block text-sm font-semibold">
                {step.label}
                <span className="sr-only">{step.done ? " — done" : " — not yet"}</span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      {progress.allowance ? (
        <p
          className="mt-3 text-sm text-muted-foreground"
          data-testid={`${testId}-allowance`}
          role="note"
        >
          {progress.allowance}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <Button asChild size="lg" className="min-h-12 gradient-leaf text-primary-foreground">
          <Link to={progress.primary.href} data-testid={`${testId}-cta`}>
            {progress.primary.label}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        {progress.secondary ? (
          <Link
            to={progress.secondary.href}
            className="min-h-11 inline-flex items-center text-sm text-primary hover:underline"
            data-testid={`${testId}-secondary`}
          >
            {progress.secondary.label}
          </Link>
        ) : null}
      </div>

      {renameOffered ? (
        <div className="mt-5 border-t border-border/50 pt-4" data-testid={`${testId}-rename`}>
          {renameOpen ? (
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void submitRename();
              }}
            >
              <div className="flex-1">
                <label htmlFor={inputId} className="mb-1 block text-xs text-muted-foreground">
                  {SIMPLE_HOME_SETUP_COPY.renameLabel}
                </label>
                <Input
                  id={inputId}
                  value={draftName}
                  maxLength={80}
                  disabled={saving}
                  onChange={(event) => setDraftName(event.target.value)}
                  data-testid={`${testId}-rename-input`}
                  className="min-h-11"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="min-h-11"
                  disabled={saving}
                  data-testid={`${testId}-rename-save`}
                >
                  {saving ? SIMPLE_HOME_SETUP_COPY.renameSaving : SIMPLE_HOME_SETUP_COPY.renameSave}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  disabled={saving}
                  onClick={() => {
                    setRenameOpen(false);
                    setStatus({ kind: "idle" });
                  }}
                >
                  {SIMPLE_HOME_SETUP_COPY.renameCancel}
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 gap-2"
              onClick={() => {
                setStatus({ kind: "idle" });
                setRenameOpen(true);
              }}
              data-testid={`${testId}-rename-toggle`}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {SIMPLE_HOME_SETUP_COPY.renameToggle}
              {progress.growName ? <span className="sr-only"> ({progress.growName})</span> : null}
            </Button>
          )}
          {status.kind === "failed" || status.kind === "saved" ? (
            <p
              role={status.kind === "failed" ? "alert" : "status"}
              aria-live="polite"
              data-testid={`${testId}-rename-status`}
              className={`mt-2 text-xs ${
                status.kind === "failed" ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {status.kind === "failed" ? status.message : SIMPLE_HOME_SETUP_COPY.renameSaved}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
