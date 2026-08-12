/**
 * PlantLabResultsPanel — the plant's own measured lab results (COA data),
 * grower-entered and grower-owned.
 *
 * Presentation + one validated insert + own-row delete. Reads via
 * usePlantLabTests, renders the pure labResultsRules view. Quietly absent
 * while loading and whenever the read is unavailable (e.g. the lab_tests
 * migration is not applied to the target database yet) — this panel never
 * blocks or errors the page. Shows an empty state once the table is
 * reachable so the feature is discoverable.
 *
 * No AI calls, no device control, no cross-plant comparison or ranking.
 */
import { useState } from "react";
import { FlaskConical, Loader2, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  LAB_RESULTS_ADD_LABEL,
  LAB_RESULTS_HEADING,
  buildLabResultsView,
  validateLabTestDraft,
  type LabTestDraft,
} from "@/lib/labResultsRules";
import { usePlantLabTests } from "@/hooks/usePlantLabTests";
import { useDeleteLabTest, useSaveLabTest } from "@/hooks/useLabTestMutations";

interface Props {
  plantId: string | null | undefined;
  /**
   * Read-only mode for the archived-plant timeline: saved COA evidence stays
   * visible after archiving, but add/delete controls are suppressed and the
   * panel disappears entirely when there is nothing to show.
   */
  readOnly?: boolean;
}

const EMPTY_DRAFT: LabTestDraft = {
  testedAt: "",
  thcaPercent: "",
  thcPercent: "",
  cbdaPercent: "",
  cbdPercent: "",
  terpenes: [{ name: "", percent: "" }],
  labName: "",
  note: "",
};

const CANNABINOID_INPUTS: Array<{ key: keyof LabTestDraft & string; label: string }> = [
  { key: "thcaPercent", label: "THCa %" },
  { key: "thcPercent", label: "THC %" },
  { key: "cbdaPercent", label: "CBDa %" },
  { key: "cbdPercent", label: "CBD %" },
];

export default function PlantLabResultsPanel({ plantId, readOnly = false }: Props) {
  const { data: rows, isLoading } = usePlantLabTests(plantId ?? null);
  const save = useSaveLabTest();
  const remove = useDeleteLabTest();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LabTestDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<string[]>([]);
  /** Two-step delete: first click arms the row, second click deletes. */
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);

  // Quietly absent without a plant, while loading, or when the read is
  // unavailable (null = table unreachable, e.g. migration not applied yet).
  if (!plantId || isLoading || rows === undefined || rows === null) return null;
  // Read-only with nothing recorded: nothing to show and nothing to add.
  if (readOnly && rows.length === 0) return null;

  const view = buildLabResultsView(rows);

  const setField = (key: keyof LabTestDraft, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setTerpene = (index: number, field: "name" | "percent", value: string) =>
    setDraft((d) => ({
      ...d,
      terpenes: d.terpenes.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    }));

  const handleSave = () => {
    const result = validateLabTestDraft(draft, Date.now());
    setErrors(result.errors);
    if (!result.ok || !result.payload) return;
    save.mutate(
      { plantId, payload: result.payload },
      {
        onSuccess: () => {
          toast.success("Lab result saved.");
          setDraft(EMPTY_DRAFT);
          setErrors([]);
          setOpen(false);
        },
        onError: () => {
          toast.error("Could not save the lab result. Please try again.");
        },
      },
    );
  };

  const handleDelete = (id: string) => {
    if (armedDeleteId !== id) {
      setArmedDeleteId(id);
      return;
    }
    setArmedDeleteId(null);
    remove.mutate(
      { labTestId: id },
      { onError: () => toast.error("Could not delete the lab result.") },
    );
  };

  return (
    <section
      aria-labelledby="plant-lab-results-heading"
      data-testid="plant-lab-results-panel"
      data-count={view.count}
      data-readonly={readOnly ? "true" : "false"}
      className="glass rounded-2xl p-4 my-3 space-y-3"
    >
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <h2
          id="plant-lab-results-heading"
          className="text-base font-semibold tracking-tight inline-flex items-center gap-2"
        >
          <FlaskConical className="h-4 w-4 text-muted-foreground" aria-hidden />
          {LAB_RESULTS_HEADING}
        </h2>
        {readOnly ? null : (
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) setErrors([]);
            }}
          >
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" data-testid="plant-lab-results-add">
                <Plus className="h-3.5 w-3.5" /> {LAB_RESULTS_ADD_LABEL}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{LAB_RESULTS_ADD_LABEL}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="lab-test-date">Test date</Label>
                  <Input
                    id="lab-test-date"
                    type="date"
                    value={draft.testedAt}
                    onChange={(e) => setField("testedAt", e.target.value)}
                    data-testid="lab-test-date"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CANNABINOID_INPUTS.map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`lab-test-${key}`}>{label}</Label>
                      <Input
                        id={`lab-test-${key}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step="0.01"
                        placeholder="—"
                        value={draft[key] as string}
                        onChange={(e) => setField(key, e.target.value)}
                        data-testid={`lab-test-${key}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <Label>Terpenes (% as printed)</Label>
                  {draft.terpenes.map((t, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        aria-label={`Terpene ${i + 1} name`}
                        placeholder="e.g. myrcene"
                        value={t.name}
                        onChange={(e) => setTerpene(i, "name", e.target.value)}
                      />
                      <Input
                        aria-label={`Terpene ${i + 1} percent`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step="0.01"
                        placeholder="%"
                        className="w-24"
                        value={t.percent}
                        onChange={(e) => setTerpene(i, "percent", e.target.value)}
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        terpenes: [...d.terpenes, { name: "", percent: "" }],
                      }))
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> Add terpene
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lab-test-lab-name">Lab name (optional)</Label>
                  <Input
                    id="lab-test-lab-name"
                    value={draft.labName}
                    onChange={(e) => setField("labName", e.target.value)}
                    data-testid="lab-test-lab-name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lab-test-note">Note (optional)</Label>
                  <Textarea
                    id="lab-test-note"
                    rows={2}
                    value={draft.note}
                    onChange={(e) => setField("note", e.target.value)}
                  />
                </div>
                {errors.length > 0 ? (
                  <ul
                    data-testid="lab-test-errors"
                    className="list-disc pl-5 text-xs text-destructive space-y-0.5"
                    role="alert"
                  >
                    {errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                ) : null}
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={save.isPending}
                  data-testid="lab-test-save"
                  className="w-full"
                >
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Save lab result
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </header>

      {view.hasAny ? (
        <ul className="space-y-2" data-testid="plant-lab-results-list">
          {view.cards.map((card, cardIndex) => (
            <li
              key={card.id}
              data-testid="plant-lab-result-card"
              className="rounded-xl border border-border/50 bg-card/40 p-3 text-sm space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">
                  {card.dateLabel}
                  {card.labName ? (
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                      {card.labName}
                    </span>
                  ) : null}
                </div>
                {readOnly ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(card.id)}
                    data-testid="plant-lab-result-delete"
                    // Position keeps names unique even for same-day results;
                    // date + lab give the context a screen reader needs.
                    aria-label={`${
                      armedDeleteId === card.id ? "Confirm delete" : "Delete"
                    } lab result ${cardIndex + 1} of ${view.count} (${card.dateLabel}${
                      card.labName ? `, ${card.labName}` : ""
                    })`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    {armedDeleteId === card.id ? "Confirm delete" : null}
                  </Button>
                )}
              </div>
              {card.cannabinoids.length > 0 ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {card.cannabinoids.map((c) => (
                    <span key={c.key} className="text-muted-foreground">
                      {c.label} <span className="text-foreground font-medium">{c.valueLabel}</span>
                    </span>
                  ))}
                  {card.totalThcLabel ? (
                    <span className="text-muted-foreground">
                      Total THC (calculated){" "}
                      <span className="text-foreground font-medium">{card.totalThcLabel}</span>
                    </span>
                  ) : null}
                  {card.totalCbdLabel ? (
                    <span className="text-muted-foreground">
                      Total CBD (calculated){" "}
                      <span className="text-foreground font-medium">{card.totalCbdLabel}</span>
                    </span>
                  ) : null}
                </div>
              ) : null}
              {card.terpenes.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {card.terpenes.map((t) => (
                    <span
                      key={t.name}
                      className="rounded-md border border-border/50 bg-background/40 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {t.name} {t.valueLabel}
                    </span>
                  ))}
                </div>
              ) : null}
              {card.note ? <p className="text-xs text-muted-foreground">{card.note}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground" data-testid="plant-lab-results-empty">
          {view.emptyCopy}
        </p>
      )}

      <p className="text-[11px] text-muted-foreground/80">{view.honestyNote}</p>
    </section>
  );
}
