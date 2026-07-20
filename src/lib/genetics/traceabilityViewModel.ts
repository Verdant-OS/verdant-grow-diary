/**
 * Trace resolver presenter view-model.
 *
 * PURE: no React, no Supabase, no I/O. Never throws — all input is treated as
 * untrusted `unknown` (the RPC jsonb envelope) and a malformed shape yields an
 * empty, safe view. Turns the server graph into an ordered, honest tree: honest
 * node labels, a per-node evidence posture that never renders clean from gaps,
 * gap flags, and an aggregated "what we can't back up" list.
 */
import type { EvidenceState } from "./traceabilityTypes";
import { traceNodeKindLabel } from "./traceabilityTypes";
import { evidenceStateLabel } from "./screeningEvidenceRules";

export interface TraceNodeEvidenceView {
  readonly state: EvidenceState;
  readonly stateLabel: string;
  readonly targets: ReadonlyArray<{ readonly target: string; readonly result: string; readonly collectedDate: string | null }>;
  readonly openQuarantine: boolean;
}

export interface TraceGapFlag {
  readonly code: string;
  readonly message: string;
}

export interface TraceNodeView {
  readonly key: string;
  readonly kind: string;
  readonly kindLabel: string;
  readonly id: string;
  readonly depth: number;
  readonly label: string;
  readonly fromKey: string | null;
  readonly edgeType: string | null;
  readonly edgeLabel: string | null;
  readonly evidence: TraceNodeEvidenceView | null;
  readonly gaps: readonly TraceGapFlag[];
}

export interface TraceEdgeView {
  readonly from: string;
  readonly to: string;
  readonly edgeType: string;
  readonly edgeLabel: string;
}

export interface TraceView {
  readonly shouldRender: boolean;
  readonly ok: boolean;
  readonly reason: string | null;
  readonly subjectKind: string | null;
  readonly subjectId: string | null;
  readonly direction: string;
  readonly truncated: boolean;
  readonly nodeCount: number;
  readonly nodes: readonly TraceNodeView[];
  readonly edges: readonly TraceEdgeView[];
  readonly flags: readonly TraceGapFlag[];
}

const EMPTY_VIEW: TraceView = {
  shouldRender: false,
  ok: false,
  reason: null,
  subjectKind: null,
  subjectId: null,
  direction: "both",
  truncated: false,
  nodeCount: 0,
  nodes: [],
  edges: [],
  flags: [],
};

const EDGE_LABELS: Record<string, string> = {
  propagated_from_accession: "Propagated from accession",
  mother: "Mother plant",
  produced_by_batch: "Produced by batch",
  keeper_source: "Kept from plant",
  clone_of_keeper: "Clone of keeper",
  clone_parent: "Clone of clone",
  clone_plant: "Realized as plant",
  cross_female_parent: "Female parent",
  cross_male_parent: "Male parent",
};

const GAP_MESSAGES: Record<string, string> = {
  unknown_origin: "Origin not recorded (no mother plant or source accession).",
  unassigned_origin: "This plant has not been assigned to a propagation batch.",
  no_accession_link: "This keeper is not linked to a genetics accession.",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v : null;
}

function edgeLabel(edgeType: string | null): string | null {
  if (!edgeType) return null;
  return EDGE_LABELS[edgeType] ?? edgeType.replace(/_/g, " ");
}

function mapGaps(raw: unknown): TraceGapFlag[] {
  if (!Array.isArray(raw)) return [];
  const out: TraceGapFlag[] = [];
  for (const code of raw) {
    if (typeof code !== "string") continue;
    out.push({ code, message: GAP_MESSAGES[code] ?? "Missing lineage context." });
  }
  return out;
}

function mapEvidence(raw: unknown): TraceNodeEvidenceView | null {
  if (!isRecord(raw)) return null;
  const state = str(raw.state) as EvidenceState | null;
  if (!state) return null;
  const targetsRaw = Array.isArray(raw.targets) ? raw.targets : [];
  const targets = targetsRaw.filter(isRecord).map((t) => ({
    target: str(t.target) ?? "",
    result: str(t.result) ?? "",
    collectedDate: str(t.collected_date),
  }));
  return {
    state,
    stateLabel: evidenceStateLabel(state),
    targets,
    openQuarantine: raw.open_quarantine === true,
  };
}

/**
 * Build the presenter view from a `genetics_trace_resolve` jsonb envelope
 * (passed straight through as `unknown`).
 */
export function buildTraceView(envelope: unknown): TraceView {
  try {
    if (!isRecord(envelope)) return EMPTY_VIEW;
    if (envelope.ok !== true) {
      return { ...EMPTY_VIEW, ok: false, reason: str(envelope.reason) };
    }

    const subject = isRecord(envelope.subject) ? envelope.subject : {};
    const rawNodes = Array.isArray(envelope.nodes) ? envelope.nodes : [];
    const rawEdges = Array.isArray(envelope.edges) ? envelope.edges : [];

    const nodes: TraceNodeView[] = rawNodes.filter(isRecord).map((n) => {
      const kind = str(n.kind) ?? "node";
      const et = str(n.edge_type);
      return {
        key: str(n.key) ?? `${kind}:${str(n.id) ?? ""}`,
        kind,
        kindLabel: traceNodeKindLabel(kind),
        id: str(n.id) ?? "",
        depth: typeof n.depth === "number" ? n.depth : 0,
        label: str(n.label) ?? `${traceNodeKindLabel(kind)} (unnamed)`,
        fromKey: str(n.from),
        edgeType: et,
        edgeLabel: edgeLabel(et),
        evidence: mapEvidence(n.evidence),
        gaps: mapGaps(n.gaps),
      };
    });

    const edges: TraceEdgeView[] = rawEdges.filter(isRecord).map((e) => {
      const et = str(e.edge_type) ?? "related";
      return {
        from: str(e.from) ?? "",
        to: str(e.to) ?? "",
        edgeType: et,
        edgeLabel: edgeLabel(et) ?? et,
      };
    });

    // Aggregate the honest "what we can't back up" list, de-duplicated by key+code.
    const seen = new Set<string>();
    const flags: TraceGapFlag[] = [];
    for (const node of nodes) {
      for (const gap of node.gaps) {
        const dedupe = `${node.key}:${gap.code}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        flags.push({ code: gap.code, message: `${node.label}: ${gap.message}` });
      }
    }

    return {
      shouldRender: nodes.length > 0,
      ok: true,
      reason: null,
      subjectKind: str(subject.kind),
      subjectId: str(subject.id),
      direction: str(envelope.direction) ?? "both",
      truncated: envelope.truncated === true,
      nodeCount: typeof envelope.node_count === "number" ? envelope.node_count : nodes.length,
      nodes,
      edges,
      flags,
    };
  } catch {
    return EMPTY_VIEW;
  }
}
