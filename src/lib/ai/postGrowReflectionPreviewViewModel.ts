import {
  runPostGrowReflectionDryRunHarness,
  type PostGrowReflectionDryRunScenarioResult,
  type PostGrowReflectionDryRunSummary,
} from "./postGrowReflectionDryRunHarness";
import {
  adaptPostGrowReflectionCandidate,
  type PostGrowReflectionAdapterResult,
} from "./postGrowReflectionAdapter";
import {
  buildPostGrowReflectionDryRunScenarios,
  type PostGrowReflectionDryRunScenario,
} from "./postGrowReflectionDryRunHarness";
import type { ReflectionConfidence, ReflectionOutput } from "./postGrowReflectionTypes";

export const POST_GROW_REFLECTION_PREVIEW_VIEW_MODEL_VERSION =
  "post-grow-reflection-preview-view-model-v1";

export const POST_GROW_REFLECTION_PREVIEW_LABELS = {
  operatorPreview: "Operator preview",
  dryRunFixture: "Dry-run fixture",
  validatedOutput: "Validated output",
  notSaved: "Not saved",
  noLiveAiCall: "No live AI call",
} as const;

export type PostGrowReflectionPreviewLabelKey = keyof typeof POST_GROW_REFLECTION_PREVIEW_LABELS;

export interface PostGrowReflectionPreviewSectionRow {
  key:
    | "executive_reflection"
    | "key_wins"
    | "repeat_next_run"
    | "adjust_or_avoid"
    | "post_harvest_specific_insights"
    | "pheno_strain_notes"
    | "low_risk_experiments"
    | "gaps";
  label: string;
  kind: "paragraph" | "list";
  paragraph?: string;
  items?: string[];
}

export interface PostGrowReflectionPreviewValidationOptions {
  sensorCoveragePct: number;
  knownGapCount: number;
  minEvidenceReferences: number;
  label: string;
}

export interface PostGrowReflectionPreviewLabel {
  key: PostGrowReflectionPreviewLabelKey;
  text: string;
}

export interface PostGrowReflectionPreviewPresentModel {
  status: "present";
  viewModelVersion: typeof POST_GROW_REFLECTION_PREVIEW_VIEW_MODEL_VERSION;
  title: string;
  subtitle: string;
  scenarioId: string;
  scenarioLabel: string;
  growId: string;
  confidence: ReflectionConfidence;
  confidenceLabel: string;
  labels: PostGrowReflectionPreviewLabel[];
  sections: PostGrowReflectionPreviewSectionRow[];
  validationOptions: PostGrowReflectionPreviewValidationOptions;
  emptyMessage: null;
}

export interface PostGrowReflectionPreviewEmptyModel {
  status: "empty";
  viewModelVersion: typeof POST_GROW_REFLECTION_PREVIEW_VIEW_MODEL_VERSION;
  title: string;
  subtitle: string;
  labels: PostGrowReflectionPreviewLabel[];
  emptyMessage: string;
}

export type PostGrowReflectionPreviewViewModel =
  | PostGrowReflectionPreviewPresentModel
  | PostGrowReflectionPreviewEmptyModel;

const EMPTY_MESSAGE =
  "No validated reflection preview is available. Review rejected scenarios before continuing.";

function presetLabels(): PostGrowReflectionPreviewLabel[] {
  return (Object.keys(POST_GROW_REFLECTION_PREVIEW_LABELS) as PostGrowReflectionPreviewLabelKey[]).map(
    (key) => ({ key, text: POST_GROW_REFLECTION_PREVIEW_LABELS[key] }),
  );
}

function buildSections(output: ReflectionOutput): PostGrowReflectionPreviewSectionRow[] {
  return [
    {
      key: "executive_reflection",
      label: "Executive reflection",
      kind: "paragraph",
      paragraph: output.executive_reflection,
    },
    { key: "key_wins", label: "Key wins", kind: "list", items: [...output.key_wins] },
    { key: "repeat_next_run", label: "Repeat next run", kind: "list", items: [...output.repeat_next_run] },
    { key: "adjust_or_avoid", label: "Adjust or avoid", kind: "list", items: [...output.adjust_or_avoid] },
    {
      key: "post_harvest_specific_insights",
      label: "Post-harvest specific insights",
      kind: "list",
      items: [...output.post_harvest_specific_insights],
    },
    {
      key: "pheno_strain_notes",
      label: "Pheno / strain notes",
      kind: "list",
      items: [...output.pheno_strain_notes],
    },
    {
      key: "low_risk_experiments",
      label: "Low-risk experiments",
      kind: "list",
      items: [...output.low_risk_experiments],
    },
    { key: "gaps", label: "Gaps", kind: "list", items: [...output.gaps] },
  ];
}

function findFirstValidatedScenarioResult(
  summary: PostGrowReflectionDryRunSummary,
): PostGrowReflectionDryRunScenarioResult | null {
  return summary.scenarios.find((scenario) => scenario.actualStatus === "validated") ?? null;
}

function findScenarioById(
  scenarios: PostGrowReflectionDryRunScenario[],
  id: string,
): PostGrowReflectionDryRunScenario | null {
  return scenarios.find((scenario) => scenario.id === id) ?? null;
}

export interface BuildPostGrowReflectionPreviewViewModelOptions {
  summary?: PostGrowReflectionDryRunSummary;
  scenarios?: PostGrowReflectionDryRunScenario[];
}

export function buildPostGrowReflectionPreviewViewModel(
  options: BuildPostGrowReflectionPreviewViewModelOptions = {},
): PostGrowReflectionPreviewViewModel {
  const scenarios = options.scenarios ?? buildPostGrowReflectionDryRunScenarios();
  const summary = options.summary ?? runPostGrowReflectionDryRunHarness(scenarios);
  const labels = presetLabels();

  const baseTitle = "Post-Grow Reflection Preview";
  const baseSubtitle =
    "Operator preview of a validated dry-run reflection. Fixture-only output, not saved, and no live AI call.";

  const firstValidated = findFirstValidatedScenarioResult(summary);
  if (!firstValidated) {
    return {
      status: "empty",
      viewModelVersion: POST_GROW_REFLECTION_PREVIEW_VIEW_MODEL_VERSION,
      title: baseTitle,
      subtitle: baseSubtitle,
      labels,
      emptyMessage: EMPTY_MESSAGE,
    };
  }

  const scenario = findScenarioById(scenarios, firstValidated.id);
  if (!scenario) {
    return {
      status: "empty",
      viewModelVersion: POST_GROW_REFLECTION_PREVIEW_VIEW_MODEL_VERSION,
      title: baseTitle,
      subtitle: baseSubtitle,
      labels,
      emptyMessage: EMPTY_MESSAGE,
    };
  }

  const adapterResult: PostGrowReflectionAdapterResult = adaptPostGrowReflectionCandidate({
    context: scenario.context,
    candidate: scenario.candidate,
  });

  if (adapterResult.status !== "validated") {
    return {
      status: "empty",
      viewModelVersion: POST_GROW_REFLECTION_PREVIEW_VIEW_MODEL_VERSION,
      title: baseTitle,
      subtitle: baseSubtitle,
      labels,
      emptyMessage: EMPTY_MESSAGE,
    };
  }

  const output = adapterResult.output;
  const opts = adapterResult.request.validationOptions;

  return {
    status: "present",
    viewModelVersion: POST_GROW_REFLECTION_PREVIEW_VIEW_MODEL_VERSION,
    title: baseTitle,
    subtitle: baseSubtitle,
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    growId: scenario.context.grow_id,
    confidence: output.confidence,
    confidenceLabel: `Confidence: ${output.confidence}`,
    labels,
    sections: buildSections(output),
    validationOptions: {
      sensorCoveragePct: opts.sensorCoveragePct,
      knownGapCount: opts.knownGapCount,
      minEvidenceReferences: opts.minEvidenceReferences,
      label: `sensorCoveragePct=${opts.sensorCoveragePct}; knownGapCount=${opts.knownGapCount}; minEvidenceReferences=${opts.minEvidenceReferences}`,
    },
    emptyMessage: null,
  };
}
