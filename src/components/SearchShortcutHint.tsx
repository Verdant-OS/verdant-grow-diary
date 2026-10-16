import { useEffect, useState } from "react";

import { searchShortcutLabel } from "@/lib/searchShortcutRules";

/**
 * The shortcut glyph is chosen after mount so server HTML and the first
 * client paint stay the same, then the hint matches the platform.
 */
export function SearchShortcutHint({ className }: { className?: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const platform = typeof navigator === "undefined" ? "" : navigator.platform;
    setLabel(searchShortcutLabel(platform));
  }, []);

  return <kbd className={className}>{label ?? "\u00a0"}</kbd>;
}
