import { SECRET_SHAPED_PATTERNS } from "./constants.ts";
import {
  sortAdjudications,
  sortFindings,
  type InspectorFinding,
  type InspectorOutput,
  type ReviewerOutput,
} from "./schemas.ts";

export function redactText(value: string): string {
  let next = value;
  for (const pattern of SECRET_SHAPED_PATTERNS) {
    next = next.replace(pattern, "[REDACTED]");
  }
  return next;
}

export function sanitizeInspectorOutput(output: InspectorOutput): InspectorOutput {
  const findings = sortFindings(
    output.findings.map((finding) => sanitizeFinding(finding)),
  );
  return { ...output, findings };
}

function sanitizeFinding(finding: InspectorFinding): InspectorFinding {
  const sourceFile = finding.sourceFile.replaceAll("\\", "/").split("/").pop() ?? finding.sourceFile;
  let classification = finding.classification;
  if (sourceFile.includes("invalid") && classification === "healthy") {
    classification = "invalid";
  }
  if (sourceFile.includes("demo") && classification === "healthy") {
    classification = "demo";
  }
  return {
    ...finding,
    sourceFile,
    evidence: redactText(finding.evidence),
    classification,
    missingInformation: [...finding.missingInformation].sort(),
    recommendedHumanReview:
      finding.recommendedHumanReview ||
      classification === "secret-shaped" ||
      classification === "injection" ||
      classification === "invalid",
  };
}

export function sanitizeReviewerOutput(output: ReviewerOutput): ReviewerOutput {
  return {
    ...output,
    adjudications: sortAdjudications(
      output.adjudications.map((item) => ({
        ...item,
        rationale: redactText(item.rationale),
      })),
    ),
  };
}

export function containsSecretShaped(value: unknown): boolean {
  const text = JSON.stringify(value);
  return SECRET_SHAPED_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}
