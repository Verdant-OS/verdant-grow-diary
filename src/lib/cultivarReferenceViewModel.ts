import type {
  CultivarSeedExpression,
  VerdantCultivarProfile,
} from "@/constants/verdantCultivars";

export interface CultivarSummaryRow {
  label: string;
  value: string;
}

export function formatCultivarSeedExpression(value: CultivarSeedExpression): string {
  switch (value) {
    case "clone_only":
      return "Clone-only";
    case "feminized":
      return "Feminized";
    case "regular":
      return "Regular";
    case "unknown":
      return "Information limited";
  }
}

export function formatReportedPercentRange(
  min: number | null,
  max: number | null,
): string {
  if (min == null || max == null) return "Information limited";
  if (min === max) return `${min}% reported`;
  return `${min}–${max}% reported`;
}

export function buildCultivarSummaryRows(
  cultivar: VerdantCultivarProfile,
  formattedVerifiedDate: string,
): readonly CultivarSummaryRow[] {
  return [
    {
      label: "Breeder/source",
      value: cultivar.breeder ?? "Varies / disputed",
    },
    {
      label: "Life cycle",
      value: cultivar.lifeCycle === "autoflower" ? "Autoflower" : "Photoperiod",
    },
    {
      label: "Seed expression",
      value: formatCultivarSeedExpression(cultivar.seedExpression),
    },
    {
      label: "Reported flower window",
      value: cultivar.flowerWeeks,
    },
    {
      label: "Reported THC",
      value: formatReportedPercentRange(cultivar.thcPctMin, cultivar.thcPctMax),
    },
    {
      label: "Reported CBD",
      value: formatReportedPercentRange(cultivar.cbdPctMin, cultivar.cbdPctMax),
    },
    {
      label: "Guide version",
      value: `v${cultivar.guideVersion}`,
    },
    {
      label: "Last verified",
      value: formattedVerifiedDate,
    },
  ];
}
