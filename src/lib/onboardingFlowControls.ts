import {
  clearBrowserSessionFormDraft,
  readBrowserSessionFormDraft,
  writeBrowserSessionFormDraft,
} from "@/lib/sessionFormDraftStore";
import {
  DEFAULT_START_SCREEN,
  START_SCREEN_OPTIONS,
  type StartScreenChoice,
} from "@/lib/startScreenPreferences";
import { START_YOUR_ROOM_DRAFT_FORM_ID } from "@/lib/startYourRoomDraftRules";

/** Ordered onboarding surfaces. The first step has no Back control. */
export type OnboardingFlowStep = "start-screen" | "start-room";

const CHOICE_FORM_ID = "onboarding-start-screen";

/**
 * Navigation for /onboarding and /start-room.
 * Answers on the start screen live in the session draft so Back restores them.
 * Restart drops both drafts and returns to the first step.
 */
export class OnboardingFlowControls {
  static readonly backLabel = "Back";
  static readonly restartLabel = "Restart";
  static readonly skipLabel = "Skip for now";
  static readonly choiceFormId = CHOICE_FORM_ID;

  /**
   * Space under the primary action so it clears MobileNav
   * (`bottom-2` + `h-16`) and the safe area at 393px.
   * The page starts at the top instead of centering into that band.
   */
  static readonly mobilePrimaryClearanceClass =
    "min-h-[100dvh] justify-start pb-[calc(8rem+env(safe-area-inset-bottom))] md:justify-center md:pb-10";

  /**
   * Width that keeps the primary action clear of the Quick Log FAB
   * (`right-4` + `w-14`) at 393px. Desktop uses the full row.
   */
  static readonly mobilePrimaryButtonWidthClass = "w-[calc(100%-4.5rem)] md:w-full";

  static readonly restartConfirmTitle = "Restart this setup?";
  static readonly restartConfirmBody =
    "This clears the answers on this device. Rooms already saved in your account stay there.";
  static readonly restartConfirmAction = "Restart setup";

  static showsBack(step: OnboardingFlowStep, savedRoom = false): boolean {
    return step !== "start-screen" && !savedRoom;
  }

  /** A confirmed grow, tent, or plant. Back and Restart would drop the resume ids. */
  static savedRoom(ids: {
    growId?: string | null;
    tentId?: string | null;
    plantId?: string | null;
  }): boolean {
    return Boolean(ids.growId || ids.tentId || ids.plantId);
  }

  /**
   * Restart is off once a room row exists, while a create is in flight,
   * and while the last create's outcome is still unknown.
   */
  static restartEnabled(input: {
    savedRoom: boolean;
    busy: boolean;
    createOutcomeUnknown: boolean;
  }): boolean {
    return !input.savedRoom && !input.busy && !input.createOutcomeUnknown;
  }

  static backHref(): "/onboarding" {
    return "/onboarding";
  }

  static restartHref(): "/onboarding" {
    return "/onboarding";
  }

  static readStartScreenChoice(userId: string): StartScreenChoice {
    const stored = readBrowserSessionFormDraft(userId, CHOICE_FORM_ID, parseChoice);
    return stored ?? DEFAULT_START_SCREEN;
  }

  static rememberStartScreenChoice(userId: string, choice: StartScreenChoice): void {
    writeBrowserSessionFormDraft(userId, CHOICE_FORM_ID, choice);
  }

  /** Drop the start-screen answer and the start-room form draft. */
  static clearFlowAnswers(userId: string): void {
    clearBrowserSessionFormDraft(userId, CHOICE_FORM_ID);
    clearBrowserSessionFormDraft(userId, START_YOUR_ROOM_DRAFT_FORM_ID);
  }
}

function parseChoice(value: unknown): StartScreenChoice | null {
  if (typeof value !== "string") return null;
  return START_SCREEN_OPTIONS.some((option) => option.key === value)
    ? (value as StartScreenChoice)
    : null;
}
