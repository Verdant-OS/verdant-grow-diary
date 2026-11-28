import { useState } from "react";
import GlanceNameList from "@/components/GlanceNameList";
import type { GrowTentListState } from "@/hooks/useGrowDetailData";
import { buildGlanceNameListView, sortGlanceItemsByLabel } from "@/lib/glanceNameListRules";
import { tentDetailPath } from "@/lib/routes";

/**
 * The grow's tents, right under the grow name, so a grower sees what is in
 * the grow as soon as the page opens (Cheek, 2026-11-28).
 */
export default function GrowTentsGlance({
  tentList,
}: {
  /** Undefined while the grow read has not reported a tent list. */
  tentList: GrowTentListState | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const ok = tentList?.status === "ok";
  const view = buildGlanceNameListView({
    items: ok
      ? sortGlanceItemsByLabel(
          tentList.tents.map((tent) => ({
            id: tent.id,
            label: tent.name,
            href: tentDetailPath(tent.id),
          })),
        )
      : [],
    complete: ok,
    loading: tentList === undefined || tentList.status === "loading",
    expanded,
  });
  return (
    <GlanceNameList
      view={view}
      title="Tents"
      noun={{ singular: "tent", plural: "tents" }}
      emptyText="No tents in this grow yet."
      loadingText="Loading tents…"
      unknownText="Tent list not loaded. Open Tents below to see them."
      onToggle={() => setExpanded((open) => !open)}
      testId="grow-detail-tents-glance"
      className="mb-4"
    />
  );
}
