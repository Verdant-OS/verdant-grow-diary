import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const NAVIGATION_RULES = "src/lib/growerNavigationRules.ts";

/**
 * Source bundle for static tests that protect desktop grower navigation.
 *
 * Navigation destinations are data-driven, so scanning AppSidebar alone
 * would miss routes and labels declared in the shared rules module.
 */
export function readDesktopGrowerNavigationSource(): string {
  return [read("src/components/AppSidebar.tsx"), read(NAVIGATION_RULES)].join("\n");
}

/** Mobile counterpart to {@link readDesktopGrowerNavigationSource}. */
export function readMobileGrowerNavigationSource(): string {
  return [read("src/components/MobileNav.tsx"), read(NAVIGATION_RULES)].join("\n");
}
