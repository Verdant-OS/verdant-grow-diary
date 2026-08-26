import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { VERDANT_SEO_GUIDES } from "../../src/constants/verdantSeoContent";
import { projectResolvedGuide } from "./validate-corpus.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..");
const cohortRegistryPath = path.join(
  root,
  "docs",
  "knowledge-library",
  "post-v1-public-route-cohorts.json",
);

function compareBytes(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseRegistry(): {
  cohorts?: ReadonlyArray<{ id?: string; paths?: ReadonlyArray<string> }>;
} {
  try {
    return JSON.parse(readFileSync(cohortRegistryPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Knowledge corpus material receipt blocked: post-v1 cohort registry is not readable JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function projectCohortGuides(paths: ReadonlyArray<string>) {
  const wanted = new Set(paths);
  const projected = VERDANT_SEO_GUIDES.filter((guide) => wanted.has(`/guides/${guide.slug}`)).map(
    (guide) => projectResolvedGuide(guide),
  );
  const found = new Set(projected.map((guide) => guide.path));
  const missing = paths.filter((routePath) => !found.has(routePath));
  if (missing.length > 0) {
    throw new Error(
      `Knowledge corpus material receipt blocked: selected cohort paths are absent from the resolved guide registry: ${missing.join(", ")}`,
    );
  }
  return projected.sort((left, right) => compareBytes(left.path, right.path));
}

function main() {
  const cohortId = process.argv[2];
  if (!cohortId || process.argv.length !== 3) {
    throw new Error("Usage: bun scripts/knowledge/print-corpus-material.ts <approved-cohort-id>");
  }
  const cohortRegistry = parseRegistry();
  const cohort = cohortRegistry.cohorts?.find((candidate) => candidate.id === cohortId);
  if (!cohort || !Array.isArray(cohort.paths)) {
    throw new Error(`Knowledge corpus material receipt blocked: unknown cohort ${cohortId}`);
  }
  console.log(
    JSON.stringify(
      {
        evidenceScope: "resolved_runtime_content_only",
        publicationStatus: "NOT_MEASURED",
        renderedCrawlStatus: "NOT_MEASURED",
        cohortId,
        pages: projectCohortGuides(cohort.paths).map((guide) => ({
          path: guide.path,
          publishedOn: guide.publishedOn,
          modifiedOn: guide.modifiedOn,
          material: guide.material.map(({ key, sha256 }) => ({ key, sha256 })),
          internalLinks: guide.internalLinks,
          externalSources: guide.externalSources,
          relatedPaths: guide.relatedPaths,
        })),
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
