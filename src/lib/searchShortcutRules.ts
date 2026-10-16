/** Platform label for the global-search shortcut. Apple uses ⌘K; everyone else uses Ctrl K. */
export function searchShortcutHint(platform: string | null | undefined): "⌘K" | "Ctrl K" {
  return /mac|iphone|ipad|ipod/i.test(platform ?? "") ? "⌘K" : "Ctrl K";
}
