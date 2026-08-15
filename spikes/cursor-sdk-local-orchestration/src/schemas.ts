import { FINDING_SCHEMA_VERSION } from "./constants.ts";

export const CLASSIFICATIONS = [
  "invalid",
  "stale",
  "demo",
  "manual",
  "secret-shaped",
  "injection",
  "billing-shaped",
  "ai-credit-shaped",
  "needs-review",
  "healthy",
] as const;

export type Classification = (typeof CLASSIFICATIONS)[number];
export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];
export const REVIEWER_VERDICTS = [
  "confirmed",
  "rejected",
  "needs_more_evidence",
  "safety_concern",
] as const;
export type ReviewerVerdict = (typeof REVIEWER_VERDICTS)[number];

export type InspectorFinding = {
  findingId: string;
  sourceFile: string;
  evidence: string;
  confidence: Confidence;
  classification: Classification;
  missingInformation: string[];
  recommendedHumanReview: boolean;
};

export type InspectorOutput = {
  schemaVersion: string;
  synthetic: true;
  findings: InspectorFinding[];
};

export type ReviewerAdjudication = {
  findingId: string;
  verdict: ReviewerVerdict;
  rationale: string;
};

export type ReviewerOutput = {
  schemaVersion: string;
  synthetic: true;
  adjudications: ReviewerAdjudication[];
};

export type ToolCallRecord = {
  name: string;
  verdict: "allowed" | "denied";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean`);
  }
  return value;
}

export function parseJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("response did not contain a JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export function validateInspectorOutput(value: unknown): InspectorOutput {
  if (!isRecord(value)) throw new Error("inspector output must be an object");
  if (value.schemaVersion !== FINDING_SCHEMA_VERSION) {
    throw new Error("inspector schemaVersion mismatch");
  }
  if (value.synthetic !== true) throw new Error("inspector output must declare synthetic: true");
  if (!Array.isArray(value.findings)) throw new Error("findings must be an array");
  const findings = value.findings.map((item, index) => validateFinding(item, `findings[${index}]`));
  return { schemaVersion: FINDING_SCHEMA_VERSION, synthetic: true, findings };
}

function validateFinding(value: unknown, path: string): InspectorFinding {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  const classification = expectString(value.classification, `${path}.classification`);
  if (!CLASSIFICATIONS.includes(classification as Classification)) {
    throw new Error(`${path}.classification is not allowed`);
  }
  const confidence = expectString(value.confidence, `${path}.confidence`);
  if (!CONFIDENCE_LEVELS.includes(confidence as Confidence)) {
    throw new Error(`${path}.confidence is not allowed`);
  }
  if (!Array.isArray(value.missingInformation)) {
    throw new Error(`${path}.missingInformation must be an array`);
  }
  return {
    findingId: expectString(value.findingId, `${path}.findingId`),
    sourceFile: expectString(value.sourceFile, `${path}.sourceFile`),
    evidence: expectString(value.evidence, `${path}.evidence`),
    confidence: confidence as Confidence,
    classification: classification as Classification,
    missingInformation: value.missingInformation.map((entry, i) =>
      expectString(entry, `${path}.missingInformation[${i}]`),
    ),
    recommendedHumanReview: expectBoolean(
      value.recommendedHumanReview,
      `${path}.recommendedHumanReview`,
    ),
  };
}

export function validateReviewerOutput(value: unknown): ReviewerOutput {
  if (!isRecord(value)) throw new Error("reviewer output must be an object");
  if (value.schemaVersion !== FINDING_SCHEMA_VERSION) {
    throw new Error("reviewer schemaVersion mismatch");
  }
  if (value.synthetic !== true) throw new Error("reviewer output must declare synthetic: true");
  if (!Array.isArray(value.adjudications)) throw new Error("adjudications must be an array");
  const adjudications = value.adjudications.map((item, index) => {
    if (!isRecord(item)) throw new Error(`adjudications[${index}] must be an object`);
    const verdict = expectString(item.verdict, `adjudications[${index}].verdict`);
    if (!REVIEWER_VERDICTS.includes(verdict as ReviewerVerdict)) {
      throw new Error(`adjudications[${index}].verdict is not allowed`);
    }
    return {
      findingId: expectString(item.findingId, `adjudications[${index}].findingId`),
      verdict: verdict as ReviewerVerdict,
      rationale: expectString(item.rationale, `adjudications[${index}].rationale`),
    };
  });
  return { schemaVersion: FINDING_SCHEMA_VERSION, synthetic: true, adjudications };
}

export function sortFindings(findings: InspectorFinding[]): InspectorFinding[] {
  return [...findings].sort((a, b) => {
    const id = a.findingId.localeCompare(b.findingId);
    if (id !== 0) return id;
    return a.sourceFile.localeCompare(b.sourceFile);
  });
}

export function sortAdjudications(
  adjudications: ReviewerAdjudication[],
): ReviewerAdjudication[] {
  return [...adjudications].sort((a, b) => {
    const id = a.findingId.localeCompare(b.findingId);
    if (id !== 0) return id;
    return a.verdict.localeCompare(b.verdict);
  });
}
