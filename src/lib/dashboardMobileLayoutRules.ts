/**
 * Narrow dashboard layout. Phone widths through 430px must wrap grow-check
 * labels and keep the last lines above the Quick Log button.
 */
export class DashboardMobileLayout {
  /** Widest phone width this layout treats as narrow (inclusive). */
  static readonly stackMaxPx = 430;

  static readonly checkedWidthsPx = [360, 393, 430] as const;

  static stacksAt(viewportPx: number): boolean {
    return viewportPx <= DashboardMobileLayout.stackMaxPx;
  }

  /**
   * Today's Grow Checks row: stack the method label above its actions.
   * Tailwind 4 `max-[431px]` is width < 431px, so 430px is included.
   * `max-[389px]` stays for the locked layout-safety source pin.
   */
  static readonly growCheckRowClass =
    "py-2 flex items-center justify-between gap-3 max-[389px]:flex-col max-[389px]:items-stretch max-[431px]:flex-col max-[431px]:items-stretch";

  /** Method line wraps. A single-line truncate clips "Checked by …" on a phone. */
  static readonly growCheckMethodClass =
    "min-w-0 text-xs text-muted-foreground whitespace-normal break-words";

  /**
   * Filter trigger fills the row through 430px and lets the value wrap.
   * The shared SelectTrigger clamps its label to one line.
   */
  static readonly growCheckFilterTriggerClass =
    "h-auto min-h-11 w-full basis-full whitespace-normal py-1 text-left text-xs [&>span]:line-clamp-none! [&>span]:whitespace-normal! sm:w-[220px] sm:basis-auto";

  static readonly disclosureDescriptionClass =
    "min-w-0 basis-full text-xs text-muted-foreground break-words sm:basis-auto";

  static readonly environmentCopyClass = "min-w-0 flex-1";

  static readonly environmentSubtitleClass = "text-xs text-muted-foreground break-words";
}
