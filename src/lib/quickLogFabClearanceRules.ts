/**
 * Bottom clearance rules for the signed-in application shell (`AppShell`) so
 * the fixed Quick Log floating action button (FAB) does not obscure readable
 * content on mobile viewports (e.g. 375px on Plant, Alerts, and Settings) or
 * desktop viewports (including high-zoom breakpoints).
 */

/** `bottom-[calc(5rem+env(safe-area-inset-bottom))]` on the mobile shell FAB. */
export const MOBILE_QUICK_LOG_FAB_BOTTOM_REM = 5;

/** `h-14` (3.5rem) on the mobile shell FAB. */
export const MOBILE_QUICK_LOG_FAB_HEIGHT_REM = 3.5;

/** `md:bottom-6` (1.5rem) on the desktop Quick Log FAB. */
export const DESKTOP_QUICK_LOG_FAB_BOTTOM_REM = 1.5;

/** `h-11` (`size="lg"`, 2.75rem) on the desktop Quick Log FAB. */
export const DESKTOP_QUICK_LOG_FAB_HEIGHT_REM = 2.75;

/** Minimum vertical gap (in rem) between the top of either FAB and the last line of content. */
export const QUICK_LOG_FAB_CONTENT_GAP_REM = 1;

/**
 * Total bottom padding (in rem) required on mobile viewports (`< md`) so the
 * last line of content scrolls clear of the mobile Quick Log FAB above `MobileNav`.
 */
export function mobileQuickLogContentClearanceRem(): number {
  return (
    MOBILE_QUICK_LOG_FAB_BOTTOM_REM +
    MOBILE_QUICK_LOG_FAB_HEIGHT_REM +
    QUICK_LOG_FAB_CONTENT_GAP_REM
  );
}

/**
 * Total bottom padding (in rem) required on desktop viewports (`md+`) so the
 * last line of content scrolls clear of `QuickLogV2Fab`.
 */
export function desktopQuickLogContentClearanceRem(): number {
  return (
    DESKTOP_QUICK_LOG_FAB_BOTTOM_REM +
    DESKTOP_QUICK_LOG_FAB_HEIGHT_REM +
    QUICK_LOG_FAB_CONTENT_GAP_REM
  );
}

/**
 * Responsive Tailwind padding-bottom classes for `AppShell`'s `#main-content`
 * region, incorporating device `safe-area-inset-bottom`.
 */
export const QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS =
  "pb-[calc(9.5rem+env(safe-area-inset-bottom))] md:pb-[calc(5.25rem+env(safe-area-inset-bottom))]";

/**
 * Responsive Tailwind padding-bottom classes for the `TentQuickLogTargetScope`
 * content wrapper inside `AppShell` so the last readable content on signed-in
 * routes (Plant, Alerts, Settings) clears the mobile Quick Log FAB before the
 * shell's legal footer.
 */
export const QUICK_LOG_FAB_PAGE_BODY_CLEARANCE_CLASS = "pb-24 md:pb-6";

/** `right-4` on the mobile shell FAB. */
export const MOBILE_QUICK_LOG_FAB_RIGHT_REM = 1;

/** `px-3` on `#main-content` below `sm`. */
export const SHELL_MAIN_PADDING_X_REM = 0.75;

/** `sm:px-5` on `#main-content` from `sm` until `md`. */
export const SHELL_MAIN_PADDING_X_SM_REM = 1.25;

/**
 * Extra inline-end padding (rem) for the Timeline filter row only, so the
 * "All plants" control clears the FAB. `mainPaddingRem` is the shell's
 * horizontal padding already applied outside the row (`px-3` or `sm:px-5`).
 */
export function mobileQuickLogSideClearanceRem(mainPaddingRem: number): number {
  return (
    MOBILE_QUICK_LOG_FAB_RIGHT_REM +
    MOBILE_QUICK_LOG_FAB_HEIGHT_REM +
    QUICK_LOG_FAB_CONTENT_GAP_REM -
    mainPaddingRem
  );
}

/** Timeline filter row only. Not used on the shell page body. */
export const QUICK_LOG_FAB_TIMELINE_FILTER_CLEARANCE_CLASS = [
  `pr-[${mobileQuickLogSideClearanceRem(SHELL_MAIN_PADDING_X_REM)}rem]`,
  `sm:pr-[${mobileQuickLogSideClearanceRem(SHELL_MAIN_PADDING_X_SM_REM)}rem]`,
  "md:pr-0",
].join(" ");

/**
 * Bottom edge of a toast while the signed-in shell's bottom nav and FAB are
 * on screen: the same 9.5rem stack as `mobileQuickLogContentClearanceRem`
 * (FAB bottom + height + gap) plus the safe-area inset. Above the FAB, so a
 * toast does not cover Quick Log.
 */
export function mobileShellToastBottomOffset(): string {
  return `calc(${mobileQuickLogContentClearanceRem()}rem + env(safe-area-inset-bottom))`;
}

/**
 * Document-level CSS injected only while `AppShell` (bottom nav) is mounted.
 * The media queries keep `md+` and, by absence of the tag, public routes on
 * the library default toast position.
 */
export function mobileShellToastOffsetCss(): string {
  const offset = mobileShellToastBottomOffset();
  return [
    "@media (max-width: 767px) {",
    "  [data-sonner-toaster] {",
    `    --offset-bottom: ${offset} !important;`,
    `    --mobile-offset-bottom: ${offset} !important;`,
    "  }",
    "}",
    "@media (min-width: 640px) and (max-width: 767px) {",
    "  [data-verdant-toast-viewport] {",
    "    top: auto !important;",
    `    bottom: ${offset} !important;`,
    "  }",
    "}",
  ].join("\n");
}

/** Right edge of the Timeline filter content, in CSS pixels, for a viewport width. */
export function timelineFilterRightPx(viewportPx: number, mainPaddingRem: number): number {
  const extra = mobileQuickLogSideClearanceRem(mainPaddingRem);
  return viewportPx - (mainPaddingRem + extra) * 16;
}

/** Left edge of the mobile FAB, in CSS pixels. */
export function mobileFabLeftPx(viewportPx: number): number {
  return viewportPx - (MOBILE_QUICK_LOG_FAB_RIGHT_REM + MOBILE_QUICK_LOG_FAB_HEIGHT_REM) * 16;
}
