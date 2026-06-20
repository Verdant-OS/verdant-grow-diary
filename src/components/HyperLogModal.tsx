/**
 * HyperLogModal — presenter-only Quick Log / Plant Memory modal.
 *
 * Hard constraints (presenter-only, demo-safe):
 *  - No Supabase writes, no AI calls, no alerts, no Action Queue, no device control.
 *  - No file upload or storage. Photo "previews" are local object URLs only,
 *    revoked on remove + unmount.
 *  - Sensor snapshot values are hardcoded demo data. Snapshot badge is
 *    "DEMO SNAPSHOT" and a "Demo/sample data — not live telemetry." note is
 *    shown. Nothing in this modal may be labeled LIVE.
 *  - All form inputs and selected action live in local React state only.
 *  - Commit is a callback-only handoff; this component performs no I/O.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Droplets,
  Leaf,
  Scissors,
  NotebookPen,
  Camera,
  Thermometer,
  Droplet,
  Gauge,
  X,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GeneticsBadge } from "@/components/GeneticsBadge";

export type HyperLogAction =
  | "water"
  | "feed"
  | "defoliate"
  | "note"
  | "environment";

export interface HyperLogDemoFormState {
  waterAmount: string;
  waterUnit: string;
  waterNote: string;
  feedAmount: string;
  feedNutrient: string;
  feedNote: string;
  defoliateIntensity: string;
  defoliateNote: string;
  freeformNote: string;
  // Environment Check — manual/demo draft values. Never live telemetry.
  envTemp: string;
  envHumidity: string;
  envVpd: string;
  envCo2: string;
  envNote: string;
}

interface HyperLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Presenter callback. Receives the selected action, demo form snapshot,
   * and a small extras bag (e.g. local photo preview count). No file
   * handles are exposed — photos stay local in this modal.
   */
  onCommit?: (
    action: HyperLogAction,
    demo: HyperLogDemoFormState,
    extras?: { photoCount: number },
  ) => void;
  /** Optional preselected action (e.g. when launched from Fast Add). */
  initialAction?: HyperLogAction | null;
  /**
   * Optional strain / plant context (string or object). Used presenter-only
   * to render an optional GeneticsBadge inside the Plant Memory Preview.
   * No data fetching, no writes.
   */
  strain?: unknown;
}

const ACTION_TILES: Array<{
  id: HyperLogAction;
  label: string;
  icon: typeof Droplets;
}> = [
  { id: "water", label: "Water", icon: Droplets },
  { id: "feed", label: "Feed", icon: Leaf },
  { id: "defoliate", label: "Defoliate", icon: Scissors },
  { id: "note", label: "Note", icon: NotebookPen },
  { id: "environment", label: "Env Check", icon: Gauge },
];

// Hardcoded demo values — NOT live telemetry.
const DEMO_SNAPSHOT = {
  temp: "24.6°C",
  rh: "58%",
  vpd: "1.12 kPa",
};

const WATER_UNITS = ["ml", "L", "cups"] as const;

const VERDANT_GREEN = "#00C853";

const EMPTY_FORM: HyperLogDemoFormState = {
  waterAmount: "",
  waterUnit: "ml",
  waterNote: "",
  feedAmount: "",
  feedNutrient: "",
  feedNote: "",
  defoliateIntensity: "",
  defoliateNote: "",
  freeformNote: "",
  envTemp: "",
  envHumidity: "",
  envVpd: "",
  envCo2: "",
  envNote: "",
};

export function HyperLogModal({
  open,
  onOpenChange,
  onCommit,
  initialAction = null,
  strain,
}: HyperLogModalProps) {
  const [selected, setSelected] = useState<HyperLogAction | null>(initialAction);
  const [form, setForm] = useState<HyperLogDemoFormState>(EMPTY_FORM);
  const [photos, setPhotos] = useState<Array<{ id: string; url: string; name: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync initialAction when modal re-opens with a preselect.
  useEffect(() => {
    if (open) setSelected(initialAction ?? null);
  }, [open, initialAction]);

  // Revoke any local object URLs on unmount.
  useEffect(() => {
    return () => {
      photos.forEach((p) => {
        try {
          URL.revokeObjectURL(p.url);
        } catch {
          /* noop — presenter-only */
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateField = useCallback(
    <K extends keyof HyperLogDemoFormState>(key: K, value: HyperLogDemoFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: Array<{ id: string; url: string; name: string }> = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const url = URL.createObjectURL(file);
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        url,
        name: file.name,
      });
    }
    if (next.length === 0) return;
    setPhotos((prev) => [...prev, ...next]);
  }, []);

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) {
        try {
          URL.revokeObjectURL(target.url);
        } catch {
          /* noop */
        }
      }
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const resetAll = useCallback(() => {
    setPhotos((prev) => {
      prev.forEach((p) => {
        try {
          URL.revokeObjectURL(p.url);
        } catch {
          /* noop */
        }
      });
      return [];
    });
    setForm(EMPTY_FORM);
    setSelected(null);
  }, []);

  const handleCommit = () => {
    if (!selected) return;
    onCommit?.(selected, form, { photoCount: photos.length });
    onOpenChange(false);
    resetAll();
  };

  const handleClose = (next: boolean) => {
    if (!next) resetAll();
    onOpenChange(next);
  };

  const timelinePreview = useMemo(
    () => buildTimelinePreview(selected, form, photos.length),
    [selected, form, photos.length],
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "p-0 gap-0 border-0 bg-transparent shadow-none",
          "max-w-none w-full sm:max-w-lg",
          "fixed left-0 right-0 bottom-0 top-auto translate-x-0 translate-y-0 rounded-t-2xl",
          "sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          "max-h-[92vh] overflow-hidden flex flex-col",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          "sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95",
        )}
      >
        <div
          data-testid="hyperlog-modal"
          className="bg-[#0a0a0a] border border-white/[0.06] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92vh] font-mono"
          style={{
            boxShadow:
              "0 24px 60px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,200,83,0.06)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/[0.05]">
            <div className="flex items-center gap-2">
              <div
                className="h-2 w-2 rounded-full"
                style={{ background: VERDANT_GREEN, boxShadow: `0 0 8px ${VERDANT_GREEN}` }}
              />
              <DialogTitle className="text-sm font-semibold tracking-wide text-white uppercase">
                HyperLog — Plant Memory
              </DialogTitle>
            </div>
            <button
              onClick={() => handleClose(false)}
              className="text-white/40 hover:text-white/80 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <DialogDescription className="sr-only">
            Demo-only Quick Log presenter. No live data is written.
          </DialogDescription>

          <div className="px-5 py-5 space-y-5 overflow-y-auto">
            {/* Action Tiles */}
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 mb-2.5">
                Action
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {ACTION_TILES.map((tile) => {
                  const Icon = tile.icon;
                  const isActive = selected === tile.id;
                  return (
                    <button
                      key={tile.id}
                      type="button"
                      data-testid={`hyperlog-action-${tile.id}`}
                      onClick={() => setSelected(tile.id)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-3.5",
                        "border transition-all duration-150",
                        "bg-[#111] text-white/70 border-white/[0.06]",
                        "hover:bg-[#161616] hover:text-white",
                        isActive && "text-white",
                      )}
                      style={
                        isActive
                          ? {
                              background: "rgba(0,200,83,0.10)",
                              borderColor: VERDANT_GREEN,
                              boxShadow: `inset 0 0 0 1px ${VERDANT_GREEN}, 0 0 18px rgba(0,200,83,0.18)`,
                            }
                          : undefined
                      }
                      aria-pressed={isActive}
                    >
                      <Icon className="h-4 w-4" style={isActive ? { color: VERDANT_GREEN } : undefined} />
                      <span className="text-[11px] font-medium tracking-wide">{tile.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action-specific form fields */}
            <div data-testid="hyperlog-action-fields">
              {selected === null ? (
                <p
                  className="text-[11px] text-white/40 italic px-3 py-3 rounded-lg border border-dashed border-white/[0.08] bg-[#0d0d0d]"
                  data-testid="hyperlog-no-action-helper"
                >
                  Select an action to preview the plant memory entry.
                </p>
              ) : null}

              {selected === "water" ? (
                <div className="space-y-2.5">
                  <FieldRow>
                    <DemoInput
                      placeholder="Amount (e.g. 500)"
                      value={form.waterAmount}
                      onChange={(v) => updateField("waterAmount", v)}
                      aria-label="Water amount"
                    />
                    <DemoSelect
                      value={form.waterUnit}
                      onChange={(v) => updateField("waterUnit", v)}
                      options={WATER_UNITS as readonly string[]}
                      aria-label="Water unit"
                    />
                  </FieldRow>
                  <DemoTextarea
                    placeholder="Optional note (runoff, pH, etc.)"
                    value={form.waterNote}
                    onChange={(v) => updateField("waterNote", v)}
                  />
                </div>
              ) : null}

              {selected === "feed" ? (
                <div className="space-y-2.5">
                  <FieldRow>
                    <DemoInput
                      placeholder="Amount (e.g. 500 ml)"
                      value={form.feedAmount}
                      onChange={(v) => updateField("feedAmount", v)}
                      aria-label="Feed amount"
                    />
                    <DemoInput
                      placeholder="Nutrient / EC (e.g. 1.4)"
                      value={form.feedNutrient}
                      onChange={(v) => updateField("feedNutrient", v)}
                      aria-label="Nutrient or EC"
                    />
                  </FieldRow>
                  <DemoTextarea
                    placeholder="Optional note (recipe, runoff, pH)"
                    value={form.feedNote}
                    onChange={(v) => updateField("feedNote", v)}
                  />
                </div>
              ) : null}

              {selected === "defoliate" ? (
                <div className="space-y-2.5">
                  <DemoInput
                    placeholder="Intensity / area (e.g. light — lower canopy)"
                    value={form.defoliateIntensity}
                    onChange={(v) => updateField("defoliateIntensity", v)}
                    aria-label="Defoliation intensity"
                  />
                  <DemoTextarea
                    placeholder="Optional note (target leaves, reason)"
                    value={form.defoliateNote}
                    onChange={(v) => updateField("defoliateNote", v)}
                  />
                </div>
              ) : null}

              {selected === "note" ? (
                <DemoTextarea
                  placeholder="Write a freeform observation…"
                  value={form.freeformNote}
                  onChange={(v) => updateField("freeformNote", v)}
                  minRows={3}
                />
              ) : null}

              {selected === "environment" ? (
                <div className="space-y-2.5" data-testid="hyperlog-env-fields">
                  <FieldRow>
                    <DemoInput
                      placeholder="Temp (°C)"
                      value={form.envTemp}
                      onChange={(v) => updateField("envTemp", v)}
                      aria-label="Environment temperature"
                    />
                    <DemoInput
                      placeholder="RH (%)"
                      value={form.envHumidity}
                      onChange={(v) => updateField("envHumidity", v)}
                      aria-label="Environment humidity"
                    />
                  </FieldRow>
                  <FieldRow>
                    <DemoInput
                      placeholder="VPD (kPa)"
                      value={form.envVpd}
                      onChange={(v) => updateField("envVpd", v)}
                      aria-label="Environment VPD"
                    />
                    <DemoInput
                      placeholder="CO₂ (ppm, optional)"
                      value={form.envCo2}
                      onChange={(v) => updateField("envCo2", v)}
                      aria-label="Environment CO2"
                    />
                  </FieldRow>
                  <DemoTextarea
                    placeholder="Optional note"
                    value={form.envNote}
                    onChange={(v) => updateField("envNote", v)}
                  />
                  <p
                    data-testid="hyperlog-env-not-live-copy"
                    className="text-[10px] italic text-amber-300/80"
                  >
                    Environment Check is a Quick Log note, not a live sensor reading.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Sensor Snapshot */}
            <div className="rounded-xl bg-[#0f0f0f] border border-white/[0.06] p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Sensor Snapshot
                </p>
                <span
                  data-testid="hyperlog-demo-snapshot-badge"
                  className="text-[9px] font-semibold uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-sm"
                  style={{
                    color: "#FFB020",
                    background: "rgba(255,176,32,0.10)",
                    border: "1px solid rgba(255,176,32,0.30)",
                  }}
                >
                  DEMO SNAPSHOT
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <SnapshotCell icon={Thermometer} label="Temp" value={DEMO_SNAPSHOT.temp} />
                <SnapshotCell icon={Droplet} label="RH" value={DEMO_SNAPSHOT.rh} />
                <SnapshotCell icon={Gauge} label="VPD" value={DEMO_SNAPSHOT.vpd} />
              </div>
              <p className="mt-3 text-[10px] text-white/35 italic">
                Demo/sample data — not live telemetry.
              </p>
            </div>

            {/* Photo evidence */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Photo Evidence
                </p>
                <span className="text-[9px] uppercase tracking-[0.15em] text-white/30">
                  Local preview only
                </span>
              </div>

              {photos.length > 0 ? (
                <div
                  data-testid="hyperlog-photo-thumbnails"
                  className="grid grid-cols-4 gap-2 mb-2"
                >
                  {photos.map((p) => (
                    <div
                      key={p.id}
                      className="relative aspect-square rounded-lg overflow-hidden border border-white/[0.08] bg-[#0d0d0d]"
                    >
                      <img
                        src={p.url}
                        alt={p.name}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        data-testid={`hyperlog-photo-remove-${p.id}`}
                        aria-label={`Remove ${p.name}`}
                        onClick={() => removePhoto(p.id)}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "w-full rounded-xl border border-dashed border-white/[0.10] bg-[#0d0d0d]",
                  "px-4 py-5 flex flex-col items-center justify-center gap-1.5",
                  "text-white/50 hover:text-white/80 hover:border-white/20 transition-colors",
                )}
              >
                <Camera className="h-5 w-5" />
                <span className="text-xs font-medium">
                  {photos.length > 0 ? "Add another photo" : "Attach Photo"}
                </span>
                <span className="text-[10px] text-white/30">
                  Optional — previews stay in your browser
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                data-testid="hyperlog-photo-input"
              />
            </div>

            {/* Diary timeline preview */}
            <div
              data-testid="hyperlog-timeline-preview"
              className="rounded-xl bg-[#0f0f0f] border border-white/[0.06] p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Plant Memory Preview
                </p>
                <span
                  className="text-[9px] font-semibold uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-sm"
                  style={{
                    color: "#FFB020",
                    background: "rgba(255,176,32,0.10)",
                    border: "1px solid rgba(255,176,32,0.30)",
                  }}
                >
                  DEMO ONLY
                </span>
              </div>

              <div className="relative pl-4">
                <span
                  className="absolute left-1 top-1.5 h-2 w-2 rounded-full"
                  style={{ background: selected ? VERDANT_GREEN : "rgba(255,255,255,0.2)" }}
                />
                <p className="text-[11px] uppercase tracking-wider text-white/40">
                  {timelinePreview.headline}
                </p>
                <p className="mt-1 text-sm text-white/85 leading-snug">
                  {timelinePreview.summary}
                </p>
                {timelinePreview.meta ? (
                  <p className="mt-1.5 text-[10px] text-white/40">
                    {timelinePreview.meta}
                  </p>
                ) : null}
              </div>

              {strain !== undefined && strain !== null ? (
                <div className="mt-3">
                  <GeneticsBadge source={strain} compact={false} />
                </div>
              ) : null}

              <p className="mt-3 text-[10px] text-white/35 italic">
                Demo/sample data — not live telemetry. Nothing is written.
              </p>
            </div>
          </div>

          {/* Footer / CTA */}
          <div className="px-5 pb-5 pt-3 border-t border-white/[0.05] bg-[#0a0a0a]">
            <Button
              type="button"
              data-testid="hyperlog-commit"
              onClick={handleCommit}
              disabled={!selected}
              className={cn(
                "w-full h-11 rounded-xl font-semibold tracking-wide text-sm",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                "transition-all duration-150",
              )}
              style={{
                background: selected ? VERDANT_GREEN : "#1a1a1a",
                color: selected ? "#000" : "rgba(255,255,255,0.4)",
                boxShadow: selected ? `0 0 24px rgba(0,200,83,0.35)` : undefined,
              }}
            >
              Commit to Plant Memory
            </Button>
            <p className="mt-2 text-center text-[10px] text-white/30">
              {selected
                ? "Demo preview — no data will be written."
                : "Select an action to preview the plant memory entry."}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function buildTimelinePreview(
  action: HyperLogAction | null,
  form: HyperLogDemoFormState,
  photoCount: number,
): { headline: string; summary: string; meta: string | null } {
  const photoMeta = photoCount > 0 ? `${photoCount} photo${photoCount === 1 ? "" : "s"} attached` : null;
  if (!action) {
    return {
      headline: "No entry yet",
      summary: "Choose Water, Feed, Defoliate, or Note to see how this entry will appear in the plant memory timeline.",
      meta: null,
    };
  }
  if (action === "water") {
    const amt = form.waterAmount.trim() || "—";
    const summary = `Watered with ${amt} ${form.waterUnit}${form.waterNote.trim() ? ` · ${form.waterNote.trim()}` : ""}`;
    return { headline: "Watering · demo", summary, meta: photoMeta };
  }
  if (action === "feed") {
    const amt = form.feedAmount.trim() || "—";
    const nute = form.feedNutrient.trim() ? ` (${form.feedNutrient.trim()})` : "";
    const summary = `Fed ${amt}${nute}${form.feedNote.trim() ? ` · ${form.feedNote.trim()}` : ""}`;
    return { headline: "Feeding · demo", summary, meta: photoMeta };
  }
  if (action === "defoliate") {
    const intensity = form.defoliateIntensity.trim() || "intensity not set";
    const summary = `Defoliated — ${intensity}${form.defoliateNote.trim() ? ` · ${form.defoliateNote.trim()}` : ""}`;
    return { headline: "Defoliation · demo", summary, meta: photoMeta };
  }
  if (action === "environment") {
    const parts: string[] = [];
    if (form.envTemp.trim()) parts.push(`Temp ${form.envTemp.trim()}°C`);
    if (form.envHumidity.trim()) parts.push(`RH ${form.envHumidity.trim()}%`);
    if (form.envVpd.trim()) parts.push(`VPD ${form.envVpd.trim()} kPa`);
    if (form.envCo2.trim()) parts.push(`CO₂ ${form.envCo2.trim()} ppm`);
    if (form.envNote.trim()) parts.push(form.envNote.trim());
    const summary = parts.length > 0 ? parts.join(" · ") : "No readings entered";
    return { headline: "Env check · demo", summary, meta: photoMeta };
  }
  const note = form.freeformNote.trim() || "Empty note";
  return { headline: "Note · demo", summary: note, meta: photoMeta };
}

function SnapshotCell({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Thermometer;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-[#161616] border border-white/[0.04] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-white/40 mb-1">
        <Icon className="h-3 w-3" />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-sm font-semibold text-white tabular-nums">{value}</div>
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function DemoInput({
  value,
  onChange,
  placeholder,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...rest}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg bg-[#0d0d0d] border border-white/[0.08] px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#00C853]/60 font-mono"
    />
  );
}

function DemoSelect({
  value,
  onChange,
  options,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <select
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg bg-[#0d0d0d] border border-white/[0.08] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00C853]/60 font-mono"
    >
      {options.map((o) => (
        <option key={o} value={o} className="bg-[#0d0d0d]">
          {o}
        </option>
      ))}
    </select>
  );
}

function DemoTextarea({
  value,
  onChange,
  placeholder,
  minRows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={minRows}
      onChange={(e) => onChange(e.target.value)}
      className="w-full resize-none rounded-lg bg-[#0d0d0d] border border-white/[0.08] px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#00C853]/60 font-mono"
    />
  );
}

// Unused but exported for downstream presenters that may want to render a
// non-modal preview card. Keeps the module's public surface explicit.
export const HYPERLOG_DEMO_SNAPSHOT = DEMO_SNAPSHOT;
export const HYPERLOG_PHOTO_ICON = ImageIcon;

export default HyperLogModal;
