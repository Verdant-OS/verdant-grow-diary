/**
 * AppShell sticky top bar metrics: the single source for the header height.
 * AppShell sizes its header row from APP_SHELL_HEADER_ROW_PX, and in-page
 * jumps (Plant Detail JUMP TO, hash landings) reserve APP_SHELL_STICKY_HEADER_PX,
 * so the two cannot drift apart.
 */
export const APP_SHELL_HEADER_ROW_PX = 64;
/** The header's `border-b` bottom border. */
export const APP_SHELL_HEADER_BORDER_PX = 1;
/** Full rendered sticky header height (row + bottom border) = 65px. */
export const APP_SHELL_STICKY_HEADER_PX = APP_SHELL_HEADER_ROW_PX + APP_SHELL_HEADER_BORDER_PX;
