/**
 * Bottom space the signed-in shell must keep clear of the fixed Quick Log
 * buttons. At 200% zoom a desktop window often falls under the `md` breakpoint,
 * so the mobile button (above the bottom nav) is the one that covers the last
 * lines, including Derived VPD on tent and plant pages.
 */

/** `bottom-[calc(5rem+safe-area)]` on the mobile shell button. */
export const MOBILE_QUICK_LOG_FAB_BOTTOM_REM = 5;

/** `h-14` on the mobile shell button. */
export const MOBILE_QUICK_LOG_FAB_HEIGHT_REM = 3.5;

/** `md:bottom-6` on the desktop Quick Log button. */
export const DESKTOP_QUICK_LOG_FAB_BOTTOM_REM = 1.5;

/** `h-11` (`size="lg"`) on the desktop Quick Log button. */
export const DESKTOP_QUICK_LOG_FAB_HEIGHT_REM = 2.75;

/** Gap between the top of either button and the last line of page text. */
export const QUICK_LOG_FAB_CONTENT_GAP_REM = 1;

export function mobileQuickLogContentClearanceRem(): number {
  return (
    MOBILE_QUICK_LOG_FAB_BOTTOM_REM +
    MOBILE_QUICK_LOG_FAB_HEIGHT_REM +
    QUICK_LOG_FAB_CONTENT_GAP_REM
  );
}

export function desktopQuickLogContentClearanceRem(): number {
  return (
    DESKTOP_QUICK_LOG_FAB_BOTTOM_REM +
    DESKTOP_QUICK_LOG_FAB_HEIGHT_REM +
    QUICK_LOG_FAB_CONTENT_GAP_REM
  );
}

export const QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS =
  "pb-[calc(9.5rem+env(safe-area-inset-bottom))] md:pb-[calc(5.25rem+env(safe-area-inset-bottom))]";
