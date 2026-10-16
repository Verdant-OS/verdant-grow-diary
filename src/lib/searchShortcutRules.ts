/**
 * Platform label for the global-search shortcut. Apple platforms use ⌘K.
 * Everywhere else the handler is Ctrl+K, shown as "Ctrl K".
 */
export function searchShortcutLabel(platform: string | null | undefined): "⌘K" | "Ctrl K" {
  const value = (platform ?? "").toLowerCase();
  if (/mac|iphone|ipad|ipod/.test(value)) return "⌘K";
  return "Ctrl K";
}
