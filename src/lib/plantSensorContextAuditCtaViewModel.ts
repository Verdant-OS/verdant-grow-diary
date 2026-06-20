/**
 * plantSensorContextAuditCtaViewModel — pure helper that decides whether
 * the Sensor Context Audit panel should render a Quick Log manual-sensor
 * CTA, and produces only safe identity context (plant/tent/grow + manual
 * source label). Never fabricates sensor readings.
 *
 * No I/O. No React. No Supabase. No fetch. No model calls.
 */
import type { PlantSensorContextStatus } from "@/lib/plantSensorContextAuditViewModel";
import {
  buildPlantQuickLogPrefill,
  type PlantQuickLogPrefill,
  type PlantQuickLogPrefillInput,
} from "@/lib/plantQuickLogPrefillRules";

export type PlantSensorContextCtaKind = "none" | "add" | "refresh" | "inert";

export interface PlantSensorContextCtaView {
  kind: PlantSensorContextCtaKind;
  /** Visible button label. Empty for "none". */
  label: string;
  /** Inert fallback copy when no safe handler/identity context exists. */
  inertMessage: string | null;
  /** Identity-only prefill — never any sensor values. null when no CTA. */
  prefill: (PlantQuickLogPrefill & { source: "manual" }) | null;
}

export interface PlantSensorContextCtaInput {
  status: PlantSensorContextStatus;
  identity: PlantQuickLogPrefillInput | null | undefined;
  /** True when a Quick Log open-handler/route is wired on this screen. */
  hasOpenHandler: boolean;
}

const NO_CTA: PlantSensorContextCtaView = {
  kind: "none",
  label: "",
  inertMessage: null,
  prefill: null,
};

const INERT_COPY = "Manual sensor entry is not wired here yet.";

export function buildPlantSensorContextAuditCta(
  input: PlantSensorContextCtaInput,
): PlantSensorContextCtaView {
  const { status } = input;
  if (status !== "missing" && status !== "stale") return NO_CTA;

  const label =
    status === "missing"
      ? "Add manual sensor snapshot"
      : "Add fresh sensor snapshot";

  const prefill = buildPlantQuickLogPrefill(input.identity ?? null);
  if (!input.hasOpenHandler || !prefill) {
    return {
      kind: "inert",
      label,
      inertMessage: INERT_COPY,
      prefill: null,
    };
  }

  return {
    kind: status === "missing" ? "add" : "refresh",
    label,
    inertMessage: null,
    // Identity + manual source label only. No sensor values.
    prefill: { ...prefill, source: "manual" },
  };
}
