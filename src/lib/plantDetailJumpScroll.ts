import { APP_SHELL_STICKY_HEADER_PX } from "@/lib/appShellHeaderMetrics";

/**
 * Plant Detail JUMP TO landing offset. Derived from the AppShell sticky header
 * height (65px: 64px row + 1px border, see appShellHeaderMetrics) plus a gap.
 * One shared value for every jump target (Overview, Timeline, Alerts, Actions,
 * Doctor) instead of per-section magic numbers.
 */
export const PLANT_DETAIL_STICKY_HEADER_PX = APP_SHELL_STICKY_HEADER_PX;
export const PLANT_DETAIL_JUMP_GAP_PX = 12;
export const PLANT_DETAIL_JUMP_SCROLL_MARGIN_PX =
  PLANT_DETAIL_STICKY_HEADER_PX + PLANT_DETAIL_JUMP_GAP_PX;

/** Reserve the sticky header above a jump target before it is scrolled into view. */
export function applyPlantDetailJumpOffset(target: HTMLElement): void {
  if (!target.style) return;
  target.style.scrollMarginTop = `${PLANT_DETAIL_JUMP_SCROLL_MARGIN_PX}px`;
}

/**
 * Section-level jumps (no specific item) align the section top so a tall card's
 * title is never centered off-screen. Item-level reveals keep the center default.
 */
export function resolvePlantDetailJumpBlock(
  hasPreferredTarget: boolean,
  explicitBlock?: ScrollLogicalPosition,
): ScrollLogicalPosition {
  if (explicitBlock) return explicitBlock;
  return hasPreferredTarget ? "center" : "start";
}
