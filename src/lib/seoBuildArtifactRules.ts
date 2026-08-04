/**
 * seoBuildArtifactRules — pure summarisation of SEO build-output presence.
 *
 * Deterministic, null-safe, no I/O. The server function collects raw presence
 * facts; this module decides what they mean. An unreadable build output is
 * reported as BLOCKED, never as a pass.
 */

export type SeoArtifactStatus = "PASS" | "FAIL" | "BLOCKED";

export interface SeoArtifactExpectation {
  /** Path relative to the build output directory. */
  readonly file: string;
  /** What produced it, for operator context. */
  readonly producer: string;
}

export interface SeoArtifactCheck extends SeoArtifactExpectation {
  readonly present: boolean;
  /** Byte size when present and known. */
  readonly bytes: number | null;
}

export interface SeoBuildArtifactReport {
  readonly status: SeoArtifactStatus;
  /** Absolute build output directory that was inspected. */
  readonly distDir: string;
  readonly distDirExists: boolean;
  /** Reason the report is BLOCKED, otherwise null. */
  readonly blockedReason: string | null;
  readonly manifest: SeoArtifactCheck | null;
  readonly documents: ReadonlyArray<SeoArtifactCheck>;
  readonly presentCount: number;
  readonly missingCount: number;
  readonly checkedAt: string;
}

function stableByFile<T extends { file: string }>(items: ReadonlyArray<T>): T[] {
  return [...items].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

export interface SummariseInput {
  readonly distDir: string;
  readonly distDirExists: boolean;
  readonly blockedReason?: string | null;
  readonly manifest?: SeoArtifactCheck | null;
  readonly documents?: ReadonlyArray<SeoArtifactCheck>;
  readonly checkedAt: string;
}

export function summariseSeoBuildArtifacts(input: SummariseInput): SeoBuildArtifactReport {
  const documents = stableByFile(input.documents ?? []);
  const manifest = input.manifest ?? null;
  const all = manifest ? [manifest, ...documents] : documents;
  const presentCount = all.filter((entry) => entry.present).length;
  const missingCount = all.length - presentCount;

  const blockedReason =
    input.blockedReason ??
    (!input.distDirExists
      ? `Build output directory not readable at ${input.distDir}. This surface reports on a completed build; it is expected to be BLOCKED in dev and on hosts that do not ship dist/.`
      : null);

  const status: SeoArtifactStatus = blockedReason
    ? "BLOCKED"
    : missingCount > 0 || all.length === 0
      ? "FAIL"
      : "PASS";

  return {
    status,
    distDir: input.distDir,
    distDirExists: input.distDirExists,
    blockedReason,
    manifest,
    documents,
    presentCount,
    missingCount,
    checkedAt: input.checkedAt,
  };
}
