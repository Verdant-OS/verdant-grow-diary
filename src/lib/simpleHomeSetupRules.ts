/**
 * simpleHomeSetupRules — pure shaping for the Simple home's setup card.
 *
 * Phase 2 of the simplification ("easy setup, pause and recovery"): a grower
 * whose room is incomplete lands on Home and sees exactly where they are in
 * grow → tent → plant, one primary action that resumes the existing Start
 * Your Room flow where it left off, the plain page as a second route, and an
 * honest line about the plan's grow allowance. Nothing here creates a record:
 * every action is a link to a surface where creating is an explicit submit.
 *
 * Resume rule: `/start-room` resumes a partial room only for the single grow
 * the account holds, and only when a verified plan limit blocks another grow
 * (otherwise it opens at "create a grow"). In every other case the card sends
 * the grower to the existing list page scoped to the grow instead.
 *
 * Pure: no React, no Supabase, no clock.
 */
import type { Capabilities } from "@/lib/entitlements/types";
import { growDetailPath, plantsPath, tentsPath } from "@/lib/routes";
import { SIMPLE_HOME_SETUP_ROUTE, type SimpleHomeState } from "@/lib/simpleHomeViewModel";

export type SimpleHomeSetupState = Extract<
  SimpleHomeState,
  { kind: "no-grow" | "no-tent" | "no-plant" }
>;

export type SetupStepKey = "grow" | "tent" | "plant";

export interface SetupStep {
  key: SetupStepKey;
  label: string;
  done: boolean;
  /** The record's name when done, otherwise what the step creates. */
  detail: string;
}

export interface SetupAction {
  label: string;
  href: string;
}

export interface SimpleHomeSetupProgress {
  /** "start" when no grow exists yet; "continue" when the room is partial. */
  kind: "start" | "continue";
  title: string;
  body: string;
  steps: SetupStep[];
  nextStep: SetupStepKey;
  primary: SetupAction;
  /** The plain list page when the primary resumes the wizard; null otherwise. */
  secondary: SetupAction | null;
  growId: string | null;
  growName: string | null;
  growHref: string | null;
  /** Honest allowance line, or null when the plan could not be read. */
  allowance: string | null;
  /** Offer renaming the one existing grow (suggested names are editable). */
  canRename: boolean;
}

export const SIMPLE_HOME_SETUP_COPY = {
  startTitle: "Set up your grow",
  startBody:
    "Verdant keeps your notes by grow → tent → plant. Nothing is created by visiting this page; the setup asks before it saves anything.",
  continueTitle: "Continue setup",
  continueBody: "You are part-way through. Pick up where you left off, or use the plain pages.",
  stepGrow: "Grow",
  stepTent: "Tent",
  stepPlant: "Plant",
  stepGrowPending: "Your current run",
  stepTentPending: "Where the plants live",
  stepPlantPending: "Where your notes go",
  ctaStart: "Start setup",
  ctaContinue: "Continue setup",
  ctaAddTent: "Add a tent",
  ctaAddPlant: "Add a plant",
  secondaryTent: "Or add a tent on the Tents page",
  secondaryPlant: "Or add a plant on the Plants page",
  nextTent: "Next: add a tent",
  nextPlant: "Next: add your first plant",
  allowanceOneFree: "Your plan includes 1 active grow. Nothing is used until you create it.",
  allowanceOneInUse: (growName: string) =>
    `Your plan includes 1 active grow, and “${growName}” is it. Finish setting it up here, or rename it.`,
  allowanceMany: (limit: number, inUse: number) =>
    `Your plan includes ${limit} active ${limit === 1 ? "grow" : "grows"} (${inUse} in use).`,
  renameToggle: "Rename grow",
  renameLabel: "Grow name",
  renameSave: "Save name",
  renameCancel: "Cancel",
  renameSaving: "Saving…",
  renameSaved: "Name saved.",
  renameInvalid: "Give the grow a name between 1 and 80 characters.",
  renameUnconfirmed:
    "The new name didn't come back from the server. Nothing was changed on this screen.",
  renameFailed: "Couldn't save the name. Your text is still here; try again.",
} as const;

const UNTITLED_GROW = "Untitled grow";

function cleanName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** 1–80 trimmed characters, the same bound the setup flow applies to room names. */
export function isValidGrowName(value: unknown): boolean {
  const name = cleanName(value);
  return name !== null && name.length <= 80;
}

/**
 * Whether `/start-room` resumes this exact room. Mirrors the setup flow's own
 * resume preconditions without importing it:
 *  - its reader needs one grow, a matching or unset active grow, and (for the
 *    plant step) exactly one tent;
 *  - it applies a partial resume only when creating another grow is blocked
 *    by a verified plan limit. A plan that can still add a grow (paid, or
 *    not yet verified) opens at "create a grow" so that choice is not hidden.
 */
export function canResumeSetupWizard(input: {
  grows: ReadonlyArray<{ id: string }>;
  activeGrowId: string | null;
  tentCount: number;
  nextStep: SetupStepKey;
  capabilities: Pick<Capabilities, "maxActiveGrows"> | null | undefined;
}): boolean {
  if (input.nextStep === "grow") return true;
  if (input.grows.length !== 1) return false;
  if (input.activeGrowId && input.activeGrowId !== input.grows[0].id) return false;
  const limit = input.capabilities?.maxActiveGrows;
  if (typeof limit !== "number" || !Number.isFinite(limit)) return false;
  if (input.grows.length < limit) return false;
  if (input.nextStep === "tent") return input.tentCount === 0;
  return input.tentCount === 1;
}

/**
 * Plan-allowance sentence from capabilities, never from a plan name. Unknown
 * capabilities (loading or lookup failed) say nothing rather than guess.
 */
export function explainGrowAllowance(input: {
  capabilities: Pick<Capabilities, "maxActiveGrows"> | null | undefined;
  activeGrowCount: number;
  growName: string | null;
}): string | null {
  const limit = input.capabilities?.maxActiveGrows;
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return null;
  const inUse = Math.max(0, Math.floor(input.activeGrowCount));
  if (limit === 1) {
    if (inUse === 1 && input.growName) {
      return SIMPLE_HOME_SETUP_COPY.allowanceOneInUse(input.growName);
    }
    if (inUse === 0) return SIMPLE_HOME_SETUP_COPY.allowanceOneFree;
  }
  return SIMPLE_HOME_SETUP_COPY.allowanceMany(limit, inUse);
}

export function buildSimpleHomeSetupProgress(input: {
  state: SimpleHomeSetupState;
  grows: ReadonlyArray<{ id: string; name?: string | null }>;
  activeGrowId: string | null;
  tentCount: number;
  capabilities: Pick<Capabilities, "maxActiveGrows"> | null | undefined;
}): SimpleHomeSetupProgress {
  const { state } = input;
  const growId = state.kind === "no-grow" ? null : state.growId;
  const grow = growId ? input.grows.find((g) => g.id === growId) : undefined;
  const growName = grow ? (cleanName(grow.name) ?? UNTITLED_GROW) : null;
  const nextStep: SetupStepKey =
    state.kind === "no-grow" ? "grow" : state.kind === "no-tent" ? "tent" : "plant";
  const tentCount = Math.max(0, Math.floor(input.tentCount));
  const hasGrow = growId !== null;
  const hasTent = hasGrow && tentCount > 0;

  const steps: SetupStep[] = [
    {
      key: "grow",
      label: SIMPLE_HOME_SETUP_COPY.stepGrow,
      done: hasGrow,
      detail: growName ?? SIMPLE_HOME_SETUP_COPY.stepGrowPending,
    },
    {
      key: "tent",
      label: SIMPLE_HOME_SETUP_COPY.stepTent,
      done: hasTent,
      detail: hasTent
        ? tentCount === 1
          ? "1 tent"
          : `${tentCount} tents`
        : SIMPLE_HOME_SETUP_COPY.stepTentPending,
    },
    {
      key: "plant",
      label: SIMPLE_HOME_SETUP_COPY.stepPlant,
      done: false,
      detail: SIMPLE_HOME_SETUP_COPY.stepPlantPending,
    },
  ];

  const resume = canResumeSetupWizard({
    grows: input.grows,
    activeGrowId: input.activeGrowId,
    tentCount,
    nextStep,
    capabilities: input.capabilities,
  });

  let primary: SetupAction;
  let secondary: SetupAction | null = null;
  if (nextStep === "grow") {
    primary = { label: SIMPLE_HOME_SETUP_COPY.ctaStart, href: SIMPLE_HOME_SETUP_ROUTE };
  } else if (nextStep === "tent") {
    primary = resume
      ? { label: SIMPLE_HOME_SETUP_COPY.ctaContinue, href: SIMPLE_HOME_SETUP_ROUTE }
      : { label: SIMPLE_HOME_SETUP_COPY.ctaAddTent, href: tentsPath(growId) };
    secondary = resume
      ? { label: SIMPLE_HOME_SETUP_COPY.secondaryTent, href: tentsPath(growId) }
      : null;
  } else {
    primary = resume
      ? { label: SIMPLE_HOME_SETUP_COPY.ctaContinue, href: SIMPLE_HOME_SETUP_ROUTE }
      : { label: SIMPLE_HOME_SETUP_COPY.ctaAddPlant, href: plantsPath(growId) };
    secondary = resume
      ? { label: SIMPLE_HOME_SETUP_COPY.secondaryPlant, href: plantsPath(growId) }
      : null;
  }

  return {
    kind: hasGrow ? "continue" : "start",
    title: hasGrow ? SIMPLE_HOME_SETUP_COPY.continueTitle : SIMPLE_HOME_SETUP_COPY.startTitle,
    body: hasGrow ? SIMPLE_HOME_SETUP_COPY.continueBody : SIMPLE_HOME_SETUP_COPY.startBody,
    steps,
    nextStep,
    primary,
    secondary,
    growId,
    growName,
    growHref: growId ? growDetailPath(growId) : null,
    allowance: explainGrowAllowance({
      capabilities: input.capabilities,
      activeGrowCount: input.grows.length,
      growName,
    }),
    canRename: hasGrow && input.grows.length === 1,
  };
}
