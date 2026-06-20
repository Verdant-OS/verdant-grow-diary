import { readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

import { getCachedTsFiles } from "./support/scannerGuardrailHarness";

function matchesNeedle(text: string, needle: RegExp | string): boolean {
  if (typeof needle === "string") return text.includes(needle);
  needle.lastIndex = 0;
  return needle.test(text);
}

function collectSearchFiles(path: string): string[] {
  const abs = resolve(process.cwd(), path);
  const stat = statSync(abs);
  if (stat.isDirectory()) return getCachedTsFiles(abs);
  if (/\.(ts|tsx)$/.test(abs)) return [abs];
  return [];
}

export function findMatches(paths: string[], needle: RegExp | string): string[] {
  const out: string[] = [];

  for (const path of paths) {
    for (const file of collectSearchFiles(path)) {
      const src = readFileSync(file, "utf8");
      if (matchesNeedle(src, needle)) {
        out.push(relative(process.cwd(), file).replace(/\\/g, "/"));
      }
    }
  }

  return out.sort();
}
