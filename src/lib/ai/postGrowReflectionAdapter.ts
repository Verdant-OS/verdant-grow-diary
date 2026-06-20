import {
  POST_GROW_REFLECTION_PROMPT_VERSION,
  buildPostGrowReflectionPrompt,
} from "./postGrowReflectionPrompt";
import type { GrowContext, ReflectionOutput } from "./postGrowReflectionTypes";
import {
  validatePostGrowReflectionOutput,
  type PostGrowReflectionValidationIssue,
  type PostGrowReflectionValidationOptions,
} from "./postGrowReflectionOutputValidator";

export const POST_GROW_REFLECTION_ADAPTER_VERSION = "post-grow-reflection-adapter-v1";

export type PostGrowReflectionCandidateSource = "dry_run_fixture" | "external_candidate";

export interface PostGrowReflectionAdapterRequest {
  adapterVersion: typeof POST_GROW_REFLECTION_ADAPTER_VERSION;
  promptVersion: typeof POST_GROW_REFLECTION_PROMPT_VERSION;
  growId: string;
  growName: string;
  prompt: string;
  validationOptions: Required<PostGrowReflectionValidationOptions>;
  metadata: {
    sensorCoveragePct: number;
    knownGapCount: number;
    eventCount: number;
    sourceTags: string[];
  };
}

export interface PostGrowReflectionAdapterCandidate {
  source: PostGrowReflectionCandidateSource;
  rawOutput: unknown;
}

export type PostGrowReflectionAdapterResult =
  | {
      ok: true;
      status: "validated";
      request: PostGrowReflectionAdapterRequest;
      output: ReflectionOutput;
      issues: PostGrowReflectionValidationIssue[];
    }
  | {
      ok: false;
      status: "validation_failed";
      request: PostGrowReflectionAdapterRequest;
      output: null;
      issues: PostGrowReflectionValidationIssue[];
      failureReason: string;
    };

export interface BuildPostGrowReflectionAdapterRequestOptions {
  minEvidenceReferences?: number;
}

function derivedValidationOptions(
  context: GrowContext,
  options: BuildPostGrowReflectionAdapterRequestOptions = {},
): Required<PostGrowReflectionValidationOptions> {
  return {
    sensorCoveragePct: context.sensor_coverage_pct,
    knownGapCount: context.known_gaps.length,
    minEvidenceReferences: options.minEvidenceReferences ?? 2,
  };
}

export function buildPostGrowReflectionAdapterRequest(
  context: GrowContext,
  options: BuildPostGrowReflectionAdapterRequestOptions = {},
): PostGrowReflectionAdapterRequest {
  const validationOptions = derivedValidationOptions(context, options);
  return {
    adapterVersion: POST_GROW_REFLECTION_ADAPTER_VERSION,
    promptVersion: POST_GROW_REFLECTION_PROMPT_VERSION,
    growId: context.grow_id,
    growName: context.name,
    prompt: buildPostGrowReflectionPrompt(context),
    validationOptions,
    metadata: {
      sensorCoveragePct: context.sensor_coverage_pct,
      knownGapCount: context.known_gaps.length,
      eventCount: context.events.length,
      sourceTags: [...context.source_tags].sort((a, b) => a.localeCompare(b)),
    },
  };
}

export function adaptPostGrowReflectionCandidate(input: {
  context: GrowContext;
  candidate: PostGrowReflectionAdapterCandidate;
  minEvidenceReferences?: number;
}): PostGrowReflectionAdapterResult {
  const request = buildPostGrowReflectionAdapterRequest(input.context, {
    minEvidenceReferences: input.minEvidenceReferences,
  });
  const validation = validatePostGrowReflectionOutput(input.candidate.rawOutput, request.validationOptions);

  if (!validation.ok) {
    return {
      ok: false,
      status: "validation_failed",
      request,
      output: null,
      issues: validation.issues,
      failureReason: validation.issues.map((item) => item.code).join(", ") || "validation_failed",
    };
  }

  return {
    ok: true,
    status: "validated",
    request,
    output: validation.value,
    issues: validation.issues,
  };
}
