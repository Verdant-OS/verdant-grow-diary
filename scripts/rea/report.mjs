import { redact } from "./common.mjs";

const unknownText = (value) => (typeof value === "string" ? value : JSON.stringify(value));
const md = (value) =>
  String(value)
    .replace(/[\r\n]/g, " ")
    .replaceAll("|", "\\|")
    .replace(/[<>]/g, "");

export function buildBundleMap(source, evidence, pageEvidence) {
  const data = evidence?.normalized_result ?? {};
  const inventory = data.route_inventory;
  const candidates = Array.isArray(inventory?.routes) ? inventory.routes : null;
  const paths = new Set(candidates?.map((route) => route.path));
  const nodes = data.observations?.chunks?.nodes;
  const sourcePaths = new Set(source.routes ?? []);
  return redact({
    source_route_count: source.routes?.length ?? "NOT_MEASURED",
    source_manifest_sha256: source.route_manifest_sha256 ?? "NOT_MEASURED",
    observed_route_candidate_count: candidates?.length ?? "NOT_MEASURED",
    route_candidates: candidates ?? [],
    source_routes: (source.routes ?? []).map((path) => ({
      path,
      status: paths.has(path) ? "OBSERVED_CANDIDATE" : "NOT_MEASURED",
      reason: paths.has(path)
        ? "Exact path occurs among static candidates; reachability unverified."
        : "Not observed in this capture; lazy loading, feature flags or unsupported syntax may explain it.",
    })),
    unmatched_route_candidates: source.routes
      ? (candidates ?? []).filter((route) => !sourcePaths.has(route.path))
      : [],
    source_module_mapping: {
      status: "NOT_MEASURED",
      source_module_count: source.modules.length,
      reason:
        "Captured chunk assets do not establish source-module identities; source maps are disabled.",
    },
    chunks: {
      status: Array.isArray(nodes) ? "OBSERVED" : "NOT_MEASURED",
      items: nodes ?? [],
      edges: data.observations?.chunks?.edges ?? [],
    },
    scripts_observed: data.capture?.scripts_observed ?? "NOT_MEASURED",
    scripts_submitted_for_analysis: data.capture?.scripts_analyzed ?? "NOT_MEASURED",
    scripts_parsed: data.completeness?.parsed_scripts ?? "NOT_MEASURED",
    script_parse_failures: data.completeness?.parse_failures ?? "NOT_MEASURED",
    analysis_completeness:
      data.completeness?.status === "complete" ? "COMPLETE_FOR_CAPTURED_SCRIPTS" : "NOT_MEASURED",
    application_route_coverage: "NOT_MEASURED",
    unknowns: [
      ...(source.reason ? [source.reason] : []),
      ...(data.unknowns ?? []),
      ...(pageEvidence?.normalized_result?.completeness
        ? [{ page_capture: pageEvidence.normalized_result.completeness }]
        : []),
      ...(inventory?.unknowns ?? []),
      ...(inventory?.sources ?? [])
        .filter((item) => item.status !== "complete")
        .map((item) => ({
          source: item.url ?? item.path ?? item.id,
          status: item.status,
          reason: item.reason,
        })),
      ...(data.completeness?.status !== "complete"
        ? [{ analysis: data.completeness ?? "missing" }]
        : []),
    ].map(unknownText),
    limitations: [
      ...new Set([
        ...(pageEvidence?.normalized_result?.limitations ?? []),
        ...(pageEvidence?.limitations ?? []),
        ...(data.limitations ?? []),
        ...(inventory?.limitations ?? []),
      ]),
    ],
  });
}

export function renderReport(meta, result) {
  const lines = [
    "# REA live bundle map",
    "",
    `Target URL: ${md(meta.target_url)}`,
    `Reference commit SHA: ${meta.reference_commit}`,
    `REA version: ${md(meta.rea_version)}`,
    `Capture time (CT): ${md(meta.captured_at_ct)}`,
    `Capture time (UTC): ${meta.captured_at_utc}`,
    "",
    "## Measured inventory",
    "",
    `- Source routes at reference commit: ${result.source_route_count}`,
    `- Static route candidates observed: ${result.observed_route_candidate_count}`,
    `- Captured JavaScript chunks: ${result.chunks.status === "OBSERVED" ? result.chunks.items.length : "NOT_MEASURED"}`,
    `- Scripts observed: ${result.scripts_observed}`,
    `- Scripts submitted to analysis: ${result.scripts_submitted_for_analysis}`,
    `- Scripts parsed: ${result.scripts_parsed}`,
    `- Script parse failures: ${result.script_parse_failures}`,
    `- Analysis completeness: ${result.analysis_completeness}`,
    "- NOT_MEASURED: complete application route coverage, route reachability, deployed commit binding, and source-module mapping.",
    "",
    "This capture covers a signed-out landing-page load. The reference SHA is a comparison input, not production provenance.",
    "A candidate absent from the source list needs review; it does not establish an accidental deployment.",
    "",
    "## Static route candidates",
    "",
    "| Path | Classification | Confidence | Source comparison |",
    "| --- | --- | --- | --- |",
    ...result.route_candidates.map(
      (route) =>
        `| ${md(route.path)} | ${md(route.classification ?? "NOT_MEASURED")} | ${md(route.confidence ?? "NOT_MEASURED")} | ${
          result.source_route_count === "NOT_MEASURED"
            ? "NOT_MEASURED"
            : result.unmatched_route_candidates.some((other) => other.path === route.path)
              ? "REVIEW: absent from source list"
              : "Exact source path match"
        } |`,
    ),
    "",
    "## Source route coverage",
    "",
    "| Source path | Capture result |",
    "| --- | --- |",
    ...result.source_routes.map((route) => `| ${md(route.path)} | ${route.status} |`),
    "",
    "NOT_MEASURED means the capture does not establish presence or absence for that source route.",
    "",
    "## Captured JavaScript chunks",
    "",
    "| Asset | SHA-256 | Bytes |",
    "| --- | --- | --- |",
    ...result.chunks.items.map(
      (chunk) =>
        `| ${md(chunk.url ?? "inline script")} | ${md(chunk.artifact_sha256 ?? "NOT_MEASURED")} | ${chunk.bytes ?? "NOT_MEASURED"} |`,
    ),
    "",
    `NOT_MEASURED: source-module comparison (${result.source_module_mapping.source_module_count} reference source modules). ${result.source_module_mapping.reason}`,
    "",
    "## Unknowns and limits",
    "",
    ...result.unknowns.map((item) => `- NOT_MEASURED: ${md(item)}`),
    ...result.limitations.map((item) => `- ${md(item)}`),
    "",
    "Verified: successful passive page inspection and bundle analysis; the route candidates and chunk metadata listed above; source inventory read from the reference commit; canonical REA evidence export.",
  ];
  return lines.join("\n") + "\n";
}
