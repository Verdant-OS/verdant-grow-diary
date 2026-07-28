import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MAX_IMAGE_BYTES = 500 * 1024;
const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);

export function collectImageFiles(rootDir) {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      const extension = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
      if (IMAGE_EXTENSIONS.has(extension)) files.push(absolute);
    }
  };
  visit(rootDir);
  return files.sort();
}

export function validateImageBudget(rootDir, maxBytes = MAX_IMAGE_BYTES) {
  const files = collectImageFiles(rootDir);
  const violations = files
    .map((absolute) => ({ path: relative(rootDir, absolute), bytes: statSync(absolute).size }))
    .filter(({ bytes }) => bytes > maxBytes);
  if (violations.length) {
    const details = violations.map(({ path, bytes }) => `${path} (${bytes} bytes)`).join(", ");
    throw new Error(`Image budget exceeded (${maxBytes} bytes): ${details}`);
  }
  return { files: files.length, maxBytes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const rootDir = process.argv[2];
  if (!rootDir) throw new Error("Usage: node scripts/validate-public-image-budget.mjs <directory>");
  const result = validateImageBudget(rootDir);
  console.log(
    `[validate-public-image-budget] OK — ${result.files} image(s) <= ${result.maxBytes} bytes`,
  );
}
