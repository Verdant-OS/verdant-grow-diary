import { Stage } from "@/mock";
import { cn } from "@/lib/utils";

const map: Record<Stage, { label: string; cls: string }> = {
  seedling: { label: "Seedling", cls: "bg-[hsl(var(--info))]/15 text-[hsl(var(--info))] border-[hsl(var(--info))]/30" },
  veg: { label: "Veg", cls: "bg-primary/15 text-primary border-primary/30" },
  flower: { label: "Flower", cls: "bg-[hsl(var(--leaf-glow))]/15 text-[hsl(var(--leaf-glow))] border-[hsl(var(--leaf-glow))]/30" },
  flush: { label: "Flush", cls: "bg-secondary text-foreground border-border" },
  harvest: { label: "Harvest", cls: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30" },
  cure: { label: "Cure", cls: "bg-muted text-muted-foreground border-border" },
};

export default function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  const m = map[stage] ?? { label: stage, cls: "bg-secondary text-foreground border-border" };
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", m.cls, className)}>{m.label}</span>;
}
