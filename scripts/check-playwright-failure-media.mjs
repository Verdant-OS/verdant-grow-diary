import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Refuse unexpected browser media without exporting filenames or contents. */
export function assertNoPlaywrightFailureMedia(
  directories = ["test-results", "playwright-report"],
) {
  const visit = (directory) => {
    if (lstatSync(directory).isSymbolicLink()) throw new Error("failure_media_boundary_unverified");
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("failure_media_boundary_unverified");
      if (entry.isDirectory()) visit(join(directory, entry.name));
      else if (/\.(?:png|jpe?g|gif|webm|mp4|zip)$/i.test(entry.name))
        throw new Error("unexpected_playwright_failure_media");
    }
  };
  for (const directory of directories) if (existsSync(directory)) visit(directory);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assertNoPlaywrightFailureMedia();
  console.log("PASS: no Playwright failure media or trace archives.");
}
