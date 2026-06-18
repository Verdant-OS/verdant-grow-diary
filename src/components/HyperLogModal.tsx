import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Droplets, Leaf, Scissors, NotebookPen, Camera, Thermometer, Droplet, Gauge, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type HyperLogAction = "water" | "feed" | "defoliate" | "note";

interface HyperLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommit?: (action: HyperLogAction) => void;
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
];

// Hardcoded demo values — NOT live telemetry.
const DEMO_SNAPSHOT = {
  temp: "24.6°C",
  rh: "58%",
  vpd: "1.12 kPa",
};

const VERDANT_GREEN = "#00C853";

export function HyperLogModal({ open, onOpenChange, onCommit }: HyperLogModalProps) {
  const [selected, setSelected] = useState<HyperLogAction | null>(null);

  const handleCommit = () => {
    if (!selected) return;
    onCommit?.(selected);
    onOpenChange(false);
    setSelected(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Mobile: bottom sheet. Desktop: centered modal.
          "p-0 gap-0 border-0 bg-transparent shadow-none",
          "max-w-none w-full sm:max-w-lg",
          "fixed left-0 right-0 bottom-0 top-auto translate-x-0 translate-y-0 rounded-t-2xl",
          "sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          "sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:slide-in-from-bottom-0",
          "sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95",
        )}
      >
        <div
          className="bg-[#0a0a0a] border border-white/[0.06] rounded-t-2xl sm:rounded-2xl overflow-hidden"
          style={{
            boxShadow: "0 24px 60px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,200,83,0.06)",
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
                Quick Log
              </DialogTitle>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="text-white/40 hover:text-white/80 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <DialogDescription className="sr-only">
            Quick Log a grow action with optional sensor snapshot and photo evidence.
          </DialogDescription>

          <div className="px-5 py-5 space-y-5">
            {/* Action Tiles */}
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 mb-2.5">
                Action
              </p>
              <div className="grid grid-cols-4 gap-2">
                {ACTION_TILES.map((tile) => {
                  const Icon = tile.icon;
                  const isActive = selected === tile.id;
                  return (
                    <button
                      key={tile.id}
                      type="button"
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

            {/* Sensor Snapshot */}
            <div className="rounded-xl bg-[#0f0f0f] border border-white/[0.06] p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Sensor Snapshot
                </p>
                <span
                  className="text-[9px] font-semibold uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-sm"
                  style={{
                    color: "#FFB020",
                    background: "rgba(255,176,32,0.10)",
                    border: "1px solid rgba(255,176,32,0.30)",
                  }}
                >
                  Demo Snapshot
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
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 mb-2.5">
                Photo Evidence
              </p>
              <button
                type="button"
                className={cn(
                  "w-full rounded-xl border border-dashed border-white/[0.10] bg-[#0d0d0d]",
                  "px-4 py-6 flex flex-col items-center justify-center gap-1.5",
                  "text-white/50 hover:text-white/80 hover:border-white/20 transition-colors",
                )}
              >
                <Camera className="h-5 w-5" />
                <span className="text-xs font-medium">Attach Photo</span>
                <span className="text-[10px] text-white/30">Optional — drag, paste, or browse</span>
              </button>
            </div>
          </div>

          {/* Footer / CTA */}
          <div className="px-5 pb-5 pt-1">
            <Button
              type="button"
              onClick={handleCommit}
              disabled={!selected}
              className={cn(
                "w-full h-11 rounded-xl font-semibold tracking-wide text-sm",
                "text-black",
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
              {selected ? "Ready to commit." : "Select an action to continue."}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
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

export default HyperLogModal;
