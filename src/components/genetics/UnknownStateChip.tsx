/**
 * Explicit missing-context chip. Renders an honest "Unknown / Unassigned / Not
 * tested / Inconclusive / Archived" marker so absent data is never silently
 * shown as present or healthy.
 */
import { cn } from "@/lib/utils";

export type UnknownKind =
  | "unknown"
  | "unassigned"
  | "not_tested"
  | "inconclusive"
  | "archived"
  | "not_applicable";

const LABEL: Record<UnknownKind, string> = {
  unknown: "Unknown",
  unassigned: "Unassigned",
  not_tested: "Not tested",
  inconclusive: "Inconclusive",
  archived: "Archived",
  not_applicable: "Not applicable",
};

export interface UnknownStateChipProps {
  kind: UnknownKind;
  label?: string;
  className?: string;
}

export function UnknownStateChip({ kind, label, className }: UnknownStateChipProps) {
  return (
    <span
      data-testid="unknown-state-chip"
      data-kind={kind}
      className={cn(
        "inline-flex items-center rounded-full border border-dashed border-white/15 bg-white/[0.03] px-2 py-0.5 text-[11px] font-medium text-white/45 max-w-full truncate",
        className,
      )}
    >
      {label ?? LABEL[kind]}
    </span>
  );
}

export default UnknownStateChip;
