import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function matchesNeedle(text: string, needle: RegExp | string): boolean {
  if (typeof needle === "string") return text.includes(needle);
  needle.lastIndex = 0;
  return needle.test(text);
}

export function findMatches(paths: string[], needle: RegExp | string): string[] {
  const out: string[] = [];

  function walk(path: string) {
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path).sort()) {
        walk(join(path, entry));
      }
      return;
    }

    if (!path.endsWith(".ts") && !path.endsWith(".tsx")) return;

    const src = readFileSync(path, "utf8");
    if (matchesNeedle(src, needle)) out.push(path.replace(/\\/g, "/"));
  }

  for (const path of paths) walk(path);
  return out.sort();
}
