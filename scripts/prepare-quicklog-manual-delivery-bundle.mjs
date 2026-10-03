#!/usr/bin/env node
/** Compile a pinned review bundle from committed bytes. No database or network access. */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildManualDeliveryBundle,
  MANUAL_DELIVERY_FILES,
} from "./lib/quicklogManualDeliveryOrder.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function prepareManualDeliveryBundle({
  candidateSha,
  outputDir,
  git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }),
  mkdir = mkdirSync,
  write = writeFileSync,
} = {}) {
  if (typeof outputDir !== "string" || !outputDir.trim()) {
    throw new Error("delivery_bundle_input_rejected");
  }
  if (git(["rev-parse", "HEAD"]).trim() !== candidateSha) {
    throw new Error("delivery_bundle_checkout_mismatch");
  }
  const sources = MANUAL_DELIVERY_FILES.map(({ file }) =>
    git(["show", `HEAD:supabase/migrations/${file}`]),
  );
  const bundle = buildManualDeliveryBundle({ candidateSha, sources });
  const directory = resolve(outputDir);
  // An existing bundle is not silently overwritten or re-stamped.
  mkdir(directory, { recursive: false });
  for (const step of bundle.steps) {
    write(resolve(directory, step.file), step.sql, { encoding: "utf8", flag: "wx" });
  }
  write(resolve(directory, "manifest.json"), `${JSON.stringify(bundle.manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return bundle.manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error("delivery_bundle_input_rejected");
    prepareManualDeliveryBundle({
      candidateSha: process.env.MANUAL_DELIVERY_CANDIDATE_SHA,
      outputDir: process.argv[2],
    });
    process.stdout.write("Manual delivery bundle prepared; production authorization is false.\n");
  } catch {
    process.stderr.write("Manual delivery bundle rejected; no database process was started.\n");
    process.exitCode = 1;
  }
}
