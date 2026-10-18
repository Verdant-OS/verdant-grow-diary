import { useEffect, useState } from "react";
import { searchShortcutHint } from "@/lib/searchShortcutRules";

/** First paint stays ⌘K so SSR markup matches; the effect corrects non-Apple platforms. */
export default function SearchShortcutHint() {
  const [hint, setHint] = useState<"⌘K" | "Ctrl K">("⌘K");
  useEffect(() => {
    setHint(searchShortcutHint(navigator.platform));
  }, []);
  return hint;
}
