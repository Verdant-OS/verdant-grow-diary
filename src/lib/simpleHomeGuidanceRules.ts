/**
 * simpleHomeGuidanceRules — pure shaping for the Simple home's tips (Phase 3).
 *
 * Two outputs from data the Simple home already read:
 *  - "What next?" steps: every current suggestion, in priority order, shown on
 *    demand whatever the tips setting.
 *  - The guidance card: the first step whose notice is visible, only when tips
 *    are on and the account read has settled.
 *
 * Every step is about using Verdant. None gives cultivation, feeding, watering
 * or equipment advice. A read that is loading or failed contributes no step:
 * we do not guess what is missing.
 *
 * Tips are a separate account preference from the Simple/Advanced view;
 * nothing here reads or writes the view.
 *
 * Pure: no React, no Supabase, no clock (`now` is injected).
 */
import { dashboardPath, timelinePath } from "@/lib/routes";
import {
  applyNoticeAction,
  parseNoticeRecord,
  resolveNoticeVisibility,
  type NoticeAction,
  type NoticeRecord,
} from "@/lib/noticeStateRules";

export type GuidanceTips = "on" | "off";
export const DEFAULT_GUIDANCE_TIPS: GuidanceTips = "on";

/** Namespaced key inside the account's own user metadata. */
export const GUIDANCE_METADATA_KEY = "verdant_guidance" as const;

export const GUIDANCE_STEP_IDS = [
  "plant-needs-grow",
  "first-observation",
  "observation-gap",
  "look-back",
  "advanced-tools",
] as const;
export type GuidanceStepId = (typeof GUIDANCE_STEP_IDS)[number];

export function isGuidanceStepId(value: unknown): value is GuidanceStepId {
  return typeof value === "string" && (GUIDANCE_STEP_IDS as readonly string[]).includes(value);
}

/** Days since the newest observation at which the gap step appears. */
export const OBSERVATION_GAP_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export const GUIDANCE_COPY = {
  cardLabel: "Tip",
  notNow: "Not now",
  remindLater: "Remind me in 3 days",
  hiddenForNow: "Hidden for today.",
  snoozed: "We'll remind you in 3 days.",
  retired: "We won't show this tip again. It's still under What next?",
  saveFailed: "Hidden for now. Couldn't save that to your account, so it may come back.",
  whatNext: "What next?",
  whatNextEmpty: "Nothing to suggest right now. Your notes are up to date.",
  plantNeedsGrowTitle: (name: string) => `Link ${name} to a grow`,
  plantNeedsGrowBody: "Quick Log can't file notes for a plant that isn't linked to a grow yet.",
  plantNeedsGrowAction: "Open the plant",
  firstObservationTitle: "Add your first observation",
  firstObservationBody: "Write down what you see today. A photo is optional.",
  firstObservationAction: "Add an observation",
  observationGapTitle: "Add today's observation",
  observationGapBody: (days: number) =>
    `Your last observation was ${days} days ago. A short note keeps your plant's history complete.`,
  observationGapAction: "Add an observation",
  lookBackTitle: "Look back over your notes",
  lookBackBody: "The Timeline shows every observation in order, so you can compare day to day.",
  lookBackAction: "Open the Timeline",
  advancedToolsTitle: "Sensors, alerts and AI Doctor",
  advancedToolsBody: "They live in Advanced view. Opening it here doesn't change your saved view.",
  advancedToolsAction: "Open Advanced view",
  tipsSettingTitle: "Tips",
  tipsSettingLabel: "Show tips on Home",
  tipsSettingDescription:
    "One small tip at a time about using Verdant. What next? still works when tips are off.",
  restoreHidden: "Bring back hidden tips",
  saving: "Saving…",
  saved: "Saved to your account.",
  writeFailed: "Couldn't save to your account. Try again.",
  accountUnavailable: "Couldn't check your account for saved tip settings.",
} as const;

export type GuidanceStepAction = { kind: "quick-log" } | { kind: "link"; href: string };

export interface GuidanceStep {
  id: GuidanceStepId;
  title: string;
  body: string;
  actionLabel: string;
  action: GuidanceStepAction;
  /** False for discovery suggestions: they appear under What next? only, never as a tip card. */
  onCard: boolean;
}

export interface GuidanceState {
  tips: GuidanceTips;
  notices: Partial<Record<GuidanceStepId, NoticeRecord>>;
}

export const DEFAULT_GUIDANCE_STATE: GuidanceState = { tips: DEFAULT_GUIDANCE_TIPS, notices: {} };

/** Reads the account copy. Null when absent or malformed; unknown ids are dropped. */
export function readGuidanceFromMetadata(metadata: unknown): GuidanceState | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>)[GUIDANCE_METADATA_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const tips: GuidanceTips = value.tips === "off" ? "off" : "on";
  const notices: GuidanceState["notices"] = {};
  const rawNotices = value.notices;
  if (rawNotices && typeof rawNotices === "object" && !Array.isArray(rawNotices)) {
    for (const id of GUIDANCE_STEP_IDS) {
      const record = parseNoticeRecord((rawNotices as Record<string, unknown>)[id]);
      if (record) notices[id] = record;
    }
  }
  return { tips, notices };
}

/** The stored shape. Known ids only, so the value stays small in the session token. */
export function serializeGuidanceState(state: GuidanceState): Record<string, unknown> {
  const notices: Record<string, NoticeRecord> = {};
  for (const id of GUIDANCE_STEP_IDS) {
    const record = state.notices[id];
    if (record) notices[id] = record;
  }
  return { v: 1, tips: state.tips, notices };
}

export function applyGuidanceNoticeAction(
  state: GuidanceState,
  id: GuidanceStepId,
  action: NoticeAction,
  now: Date,
): GuidanceState {
  const next = applyNoticeAction(state.notices[id], action, now);
  const notices = { ...state.notices };
  if (next) notices[id] = next;
  else delete notices[id];
  return { ...state, notices };
}

export interface GuidanceStepsInput {
  growId: string;
  plants: ReadonlyArray<{
    name: string;
    href: string;
    quickLogTargetKey: string | null;
  }>;
  /** Observation timestamps from a successful read; null while loading or after a failure. */
  observationTimes: readonly string[] | null;
  now: Date;
}

/** Every current suggestion, highest priority first. Deterministic. */
export function buildWhatNextSteps(input: GuidanceStepsInput): GuidanceStep[] {
  const steps: GuidanceStep[] = [];
  const unlinked = input.plants.find((p) => !p.quickLogTargetKey);
  if (unlinked) {
    steps.push({
      id: "plant-needs-grow",
      onCard: true,
      title: GUIDANCE_COPY.plantNeedsGrowTitle(unlinked.name),
      body: GUIDANCE_COPY.plantNeedsGrowBody,
      actionLabel: GUIDANCE_COPY.plantNeedsGrowAction,
      action: { kind: "link", href: unlinked.href },
    });
  }
  const canLog = input.plants.some((p) => p.quickLogTargetKey);
  if (input.observationTimes) {
    const times = input.observationTimes
      .map((ts) => Date.parse(ts))
      .filter((t) => Number.isFinite(t));
    if (times.length === 0) {
      if (canLog) {
        steps.push({
          id: "first-observation",
          onCard: true,
          title: GUIDANCE_COPY.firstObservationTitle,
          body: GUIDANCE_COPY.firstObservationBody,
          actionLabel: GUIDANCE_COPY.firstObservationAction,
          action: { kind: "quick-log" },
        });
      }
    } else {
      const days = Math.floor((input.now.getTime() - Math.max(...times)) / DAY_MS);
      if (canLog && days >= OBSERVATION_GAP_DAYS) {
        steps.push({
          id: "observation-gap",
          onCard: true,
          title: GUIDANCE_COPY.observationGapTitle,
          body: GUIDANCE_COPY.observationGapBody(days),
          actionLabel: GUIDANCE_COPY.observationGapAction,
          action: { kind: "quick-log" },
        });
      }
      steps.push({
        id: "look-back",
        onCard: false,
        title: GUIDANCE_COPY.lookBackTitle,
        body: GUIDANCE_COPY.lookBackBody,
        actionLabel: GUIDANCE_COPY.lookBackAction,
        action: { kind: "link", href: timelinePath(input.growId) },
      });
    }
  }
  steps.push({
    id: "advanced-tools",
    onCard: false,
    title: GUIDANCE_COPY.advancedToolsTitle,
    body: GUIDANCE_COPY.advancedToolsBody,
    actionLabel: GUIDANCE_COPY.advancedToolsAction,
    action: { kind: "link", href: dashboardPath(input.growId) },
  });
  return steps;
}

export type GuidanceReadStatus = "loading" | "ready" | "unavailable";

/**
 * The one step the card shows, or null. Only steps that ask the grower to act
 * reach the card; discovery suggestions stay under What next?. Nothing while the account read is
 * pending or failed: a tip dismissed on another device must not reappear here.
 */
export function selectGuidanceCardStep(input: {
  steps: readonly GuidanceStep[];
  state: GuidanceState;
  status: GuidanceReadStatus;
  now: Date;
}): GuidanceStep | null {
  if (input.status !== "ready" || input.state.tips !== "on") return null;
  return (
    input.steps.find(
      (step) =>
        step.onCard &&
        resolveNoticeVisibility(input.state.notices[step.id], input.now) === "visible",
    ) ?? null
  );
}
