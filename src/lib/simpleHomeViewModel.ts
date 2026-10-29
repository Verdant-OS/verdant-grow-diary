/**
 * simpleHomeViewModel — pure shaping for the Simple home surface.
 *
 * The Simple home shows three things: the grower's plants (with tent context),
 * one prominent "Add an observation" action, and recent entries that reopen the
 * saved observation. It never invents records: loading stays loading, a failed
 * read is an error with a retry, and "nothing yet" appears only after a
 * successful read returned nothing.
 *
 * Deterministic: plants sort by name then id; recent entries keep the merged
 * order their reader already established.
 */
import type { Plant, Tent } from "@/mock";
import type { RecentItem } from "@/lib/growStatus";
import { plantDetailPath, plantsPath, tentDetailPath, tentsPath, timelinePath } from "@/lib/routes";
import { buildQuickLogTimelineNavTarget } from "@/lib/quickLogTimelineNavigationTarget";
import { buildTimelineEntryAnchorId } from "@/lib/timelineEntryAnchorRules";

export const SIMPLE_HOME_COPY = {
  title: "Home",
  addObservation: "Add an observation",
  addObservationHelp: "Write down what you see today. A photo is optional.",
  addObservationFor: (plantName: string) => `Add an observation for ${plantName}`,
  plantsHeading: "My plants",
  recentHeading: "Recent entries",
  openEntry: "Open this entry",
  viewTimeline: "See the full timeline",
  noGrowTitle: "Set up your grow",
  noGrowBody:
    "Verdant keeps your notes by grow → tent → plant. Set up your first grow, tent and plant, then come back here to log.",
  noGrowCta: "Start setup",
  chooseGrowTitle: "Which grow do you want to work in?",
  chooseGrowBody: "You have more than one grow. Pick the one you are tending now.",
  noTentTitle: "Add a tent",
  noTentBody: "Your grow has no tent yet. Add one, then add the plants that live in it.",
  noTentCta: "Add a tent",
  noPlantTitle: "Add your first plant",
  noPlantBody: "Your tent is ready. Add a plant so your observations have somewhere to live.",
  noPlantCta: "Add a plant",
  recentEmpty: "No entries yet. Your first observation will show up here.",
  recentUnavailable: "Couldn't load recent entries.",
  recentLoading: "Loading recent entries…",
  retry: "Try again",
  inTent: (tentName: string) => `in ${tentName}`,
  tentUnknown: "Tent not set",
} as const;

export const SIMPLE_HOME_SETUP_ROUTE = "/start-room" as const;

export interface SimpleHomePlantRow {
  id: string;
  name: string;
  strain: string | null;
  stage: string | null;
  tentId: string | null;
  tentName: string | null;
  href: string;
  tentHref: string | null;
  /** Explicit Quick Log launch target for this row's own button. */
  quickLogTargetKey: `plant:${string}`;
}

export type SimpleHomeReadStatus = "pending" | "error" | "success";

export interface SimpleHomeInput {
  grows: ReadonlyArray<{ id: string; name?: string | null }>;
  growsLoading: boolean;
  growsError: string | null;
  /** `?growId=` from the URL, only when it maps to one of the grower's grows. */
  scopedGrowId: string | null;
  activeGrowId: string | null;
  tents: { status: SimpleHomeReadStatus; rows: readonly Tent[] | null | undefined };
  plants: { status: SimpleHomeReadStatus; rows: readonly Plant[] | null | undefined };
}

export type SimpleHomeState =
  | { kind: "loading"; resource: "grows" | "tents" | "plants" }
  | { kind: "grows-error" }
  | { kind: "no-grow" }
  | { kind: "choose-grow"; grows: { id: string; name: string; href: string }[] }
  | { kind: "tents-error"; growId: string }
  | { kind: "plants-error"; growId: string }
  | { kind: "no-tent"; growId: string; href: string }
  | { kind: "no-plant"; growId: string; href: string }
  | {
      kind: "ready";
      growId: string;
      growName: string | null;
      plants: SimpleHomePlantRow[];
      tentCount: number;
    };

/**
 * Which grow the Simple home works in. A valid URL scope wins, then the
 * grower's stored active grow, then a lone grow. Several grows with no
 * selection is a choice for the grower, never an arbitrary pick.
 */
export function resolveSimpleHomeGrowId(input: {
  grows: ReadonlyArray<{ id: string }>;
  scopedGrowId: string | null;
  activeGrowId: string | null;
}): string | null {
  const ids = new Set(input.grows.map((g) => g.id));
  if (input.scopedGrowId && ids.has(input.scopedGrowId)) return input.scopedGrowId;
  if (input.activeGrowId && ids.has(input.activeGrowId)) return input.activeGrowId;
  if (input.grows.length === 1) return input.grows[0].id;
  return null;
}

function compareRows(a: SimpleHomePlantRow, b: SimpleHomePlantRow): number {
  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  if (byName !== 0) return byName;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildSimpleHomePlantRows(
  plants: readonly Plant[],
  tents: readonly Tent[],
  growId: string,
): SimpleHomePlantRow[] {
  const tentNames = new Map(tents.map((t) => [t.id, t.name]));
  return plants
    .filter((p) => p && typeof p.id === "string" && p.id.length > 0 && p.isArchived !== true)
    .filter((p) => !p.growId || p.growId === growId)
    .map((p) => {
      const tentId = typeof p.tentId === "string" && p.tentId.length > 0 ? p.tentId : null;
      const name = typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Unnamed plant";
      return {
        id: p.id,
        name,
        strain: typeof p.strain === "string" && p.strain.trim() ? p.strain.trim() : null,
        stage: p.stage ?? null,
        tentId,
        tentName: tentId ? (tentNames.get(tentId) ?? null) : null,
        href: plantDetailPath(p.id, { tentId }),
        tentHref: tentId ? tentDetailPath(tentId) : null,
        quickLogTargetKey: `plant:${p.id}` as const,
      };
    })
    .sort(compareRows);
}

export function buildSimpleHomeState(input: SimpleHomeInput): SimpleHomeState {
  if (input.growsLoading) return { kind: "loading", resource: "grows" };
  if (input.growsError || !Array.isArray(input.grows)) return { kind: "grows-error" };
  if (input.grows.length === 0) return { kind: "no-grow" };

  const growId = resolveSimpleHomeGrowId(input);
  if (!growId) {
    return {
      kind: "choose-grow",
      grows: input.grows.map((g) => ({
        id: g.id,
        name: typeof g.name === "string" && g.name.trim() ? g.name.trim() : "Untitled grow",
        href: `/?growId=${encodeURIComponent(g.id)}`,
      })),
    };
  }

  if (input.tents.status === "pending") return { kind: "loading", resource: "tents" };
  if (input.tents.status === "error" || !Array.isArray(input.tents.rows)) {
    return { kind: "tents-error", growId };
  }
  if (input.tents.rows.length === 0) {
    return { kind: "no-tent", growId, href: tentsPath(growId) };
  }

  if (input.plants.status === "pending") return { kind: "loading", resource: "plants" };
  if (input.plants.status === "error" || !Array.isArray(input.plants.rows)) {
    return { kind: "plants-error", growId };
  }

  const rows = buildSimpleHomePlantRows(input.plants.rows, input.tents.rows, growId);
  if (rows.length === 0) return { kind: "no-plant", growId, href: plantsPath(growId) };

  const grow = input.grows.find((g) => g.id === growId);
  return {
    kind: "ready",
    growId,
    growName: typeof grow?.name === "string" && grow.name.trim() ? grow.name.trim() : null,
    plants: rows,
    tentCount: input.tents.rows.length,
  };
}

export interface SimpleHomeRecentEntry {
  id: string;
  title: string;
  detail: string | null;
  ts: string;
  href: string;
}

export const SIMPLE_HOME_RECENT_LIMIT = 5;

/**
 * Diary rows only (the journal is the product). Each row links to its own
 * Timeline anchor so "find it again" is one tap, not a search.
 */
export function selectSimpleHomeRecentEntries(
  items: readonly RecentItem[],
  growId: string,
): SimpleHomeRecentEntry[] {
  return items
    .filter((item) => item.kind === "diary")
    .slice(0, SIMPLE_HOME_RECENT_LIMIT)
    .map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail ?? null,
      ts: item.ts,
      href: buildSimpleHomeRecentEntryHref(item, growId),
    }));
}

/** Reader ids are `grow-event-<id>` or `diary-<id>`; both have Timeline anchors. */
export function buildSimpleHomeRecentEntryHref(item: RecentItem, growId: string): string {
  const fallback = timelinePath(growId);
  if (typeof item.id !== "string") return fallback;
  if (item.id.startsWith("grow-event-")) {
    const target = buildQuickLogTimelineNavTarget({
      growId,
      growEventId: item.id.slice("grow-event-".length),
    });
    return target?.href ?? fallback;
  }
  if (item.id.startsWith("diary-")) {
    const anchor = buildTimelineEntryAnchorId(item.id.slice("diary-".length));
    return anchor ? `${fallback}#${anchor}` : fallback;
  }
  return item.href ?? fallback;
}
