import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { VERDANT_SEO_GUIDES } from "../../src/constants/verdantSeoContent";
import { projectResolvedGuide } from "./validate-corpus.mjs";
import { validateCorpusReviewPacket } from "./validate-corpus-review-packet.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..");
const packetPath = path.join(
  root,
  "docs",
  "knowledge-library",
  "corpus",
  "pv1-symptom-evidence-guides",
  "revisions",
  "draft-001.json",
);
const cohortRegistryPath = path.join(
  root,
  "docs",
  "knowledge-library",
  "post-v1-public-route-cohorts.json",
);
const schemaPath = path.join(
  root,
  "docs",
  "knowledge-library",
  "schemas",
  "corpus-review-packet.schema.json",
);

function readJson(filePath: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Knowledge corpus review packet blocked: ${label} is not readable JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function main() {
  const packet = readJson(packetPath, "review packet");
  const cohortRegistry = readJson(cohortRegistryPath, "cohort registry");
  const schema = readJson(schemaPath, "review-packet schema");

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validateSchema = ajv.compile(schema);
  if (!validateSchema(packet)) {
    throw new Error(
      `Knowledge corpus review packet blocked: schema validation failed:\n${JSON.stringify(
        validateSchema.errors,
        null,
        2,
      )}`,
    );
  }

  const cohort = (
    cohortRegistry as { cohorts?: Array<{ id?: string; paths?: string[] }> }
  ).cohorts?.find((candidate) => candidate.id === "PV1-SYMPTOM-EVIDENCE-GUIDES");
  if (!cohort?.paths) {
    throw new Error(
      "Knowledge corpus review packet blocked: symptom cohort is absent from registry",
    );
  }
  const wanted = new Set(cohort.paths);
  const resolvedGuides = VERDANT_SEO_GUIDES.filter((guide) =>
    wanted.has(`/guides/${guide.slug}`),
  ).map((guide) => projectResolvedGuide(guide));

  const result = validateCorpusReviewPacket({ packet, cohortRegistry, resolvedGuides });
  console.log(JSON.stringify(result, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
