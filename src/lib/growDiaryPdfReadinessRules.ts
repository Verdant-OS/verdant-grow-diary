import type { CountValue, RecentItem } from "@/lib/growStatus";

export function isUsableGrowDiaryPdfCount(value: CountValue | null | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Activity remains loading until after the hook's counts phase has settled. */
export function getGrowDiaryPdfReadiness(
  diary: CountValue | null | undefined,
  recent: { status: "loading" | "ok" | "unavailable"; items?: readonly RecentItem[] | null },
): "loading" | "unavailable" | "ready" {
  if (recent.status === "loading") return "loading";
  if (recent.status !== "ok" || !Array.isArray(recent.items) || !isUsableGrowDiaryPdfCount(diary)) {
    return "unavailable";
  }
  return "ready";
}
