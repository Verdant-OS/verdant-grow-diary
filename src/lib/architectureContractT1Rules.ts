/**
 * architectureContractT1Rules — parse and validate snippet-bearing cites in
 * docs/architecture-contract.md (proposed gate T1).
 *
 * Pure. No I/O except via explicit read helpers. Deterministic.
 */
import { readFileSync } from "node:fs";

export type ArchitectureContractCitation = {
  file: string;
  lineNumbers: number[];
  snippet: string;
};

export type ArchitectureContractCitationFailure = ArchitectureContractCitation & {
  reason: string;
};

const REPO_FILE_PATTERN =
  /^(?:src|supabase|scripts|config)\/.+\.(?:ts|tsx|sql|mjs|js|toml|json)$|^(?:vite|vitest|tsconfig|bunfig)\./;

const FULL_PATH_CODE_SNIPPET_CITE =
  /`((?:\.\.\/)?(?:src|supabase|scripts|config|vite|vitest|tsconfig|bunfig)[^`]+\.(?:ts|tsx|sql|mjs|js|toml|json))(?::([0-9,-]+))`\s*\(`([^`]+)`\)/g;

const RELATIVE_CODE_SNIPPET_CITE = /`(:[0-9,-]+)`\s*\(`([^`]+)`\)/g;

const PATH_ONLY_CITE =
  /`((?:\.\.\/)?(?:src|supabase|scripts|config|vite|vitest|tsconfig|bunfig)[^`]+\.(?:ts|tsx|sql|mjs|js|toml|json))`/g;

type CiteToken =
  | { index: number; kind: "full"; file: string; lineSpec: string; snippet: string }
  | { index: number; kind: "relative"; lineSpec: string; snippet: string }
  | { index: number; kind: "path"; file: string };

function collectArchitectureContractCiteTokens(markdown: string): CiteToken[] {
  const tokens: CiteToken[] = [];

  for (const match of markdown.matchAll(FULL_PATH_CODE_SNIPPET_CITE)) {
    if (match.index === undefined) continue;
    tokens.push({
      index: match.index,
      kind: "full",
      file: match[1],
      lineSpec: match[2],
      snippet: match[3],
    });
  }

  for (const match of markdown.matchAll(RELATIVE_CODE_SNIPPET_CITE)) {
    if (match.index === undefined) continue;
    tokens.push({
      index: match.index,
      kind: "relative",
      lineSpec: match[1].slice(1),
      snippet: match[2],
    });
  }

  for (const match of markdown.matchAll(PATH_ONLY_CITE)) {
    if (match.index === undefined) continue;
    tokens.push({ index: match.index, kind: "path", file: match[1] });
  }

  return tokens.sort((a, b) => a.index - b.index);
}

/** GDP-ARCH-CITE-001 regression pins — Soft #1088 comment drift on sensorSourceRules.ts. */
export const GDP_ARCH_CITE_001_SENSOR_SOURCE_RULES_PINS = [
  { file: "src/lib/sensor/sensorSourceRules.ts", lineNumbers: [16], snippet: "SENSOR_SOURCES" },
  {
    file: "src/lib/sensor/sensorSourceRules.ts",
    lineNumbers: [82],
    snippet: 'ALIAS[v] ?? "invalid"',
  },
  { file: "src/lib/sensor/sensorSourceRules.ts", lineNumbers: [88], snippet: '=== "live"' },
  {
    file: "src/lib/sensor/sensorSourceRules.ts",
    lineNumbers: [24, 25, 26, 27, 28],
    snippet: 'pi_bridge: "live"',
  },
  {
    file: "src/lib/sensor/sensorSourceRules.ts",
    lineNumbers: [48, 49, 50, 51, 52, 53],
    snippet: "TRUST_LIVE_ALIASES",
  },
] as const satisfies ReadonlyArray<ArchitectureContractCitation>;

/** Strip decorative backticks from contract parentheticals. */
export function normalizeArchitectureContractSnippet(raw: string): string {
  return raw.replace(/`/g, "").trim();
}

/** Expand `:16`, `:21-23`, or `14,47-61` into 1-based line numbers. */
export function expandArchitectureContractLineSpec(spec: string): number[] {
  const lines: number[] = [];
  for (const part of spec.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const [startRaw, endRaw] = trimmed.split("-");
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
        throw new Error(`Invalid line range: ${spec}`);
      }
      for (let line = start; line <= end; line += 1) lines.push(line);
    } else {
      const line = Number(trimmed);
      if (!Number.isFinite(line)) throw new Error(`Invalid line number: ${spec}`);
      lines.push(line);
    }
  }
  return lines;
}

function resolveRepoPath(rawPath: string, lastFullPath: string | null): string | null {
  if (rawPath.startsWith(".../")) {
    if (!lastFullPath) return null;
    const dir = lastFullPath.includes("/")
      ? lastFullPath.slice(0, lastFullPath.lastIndexOf("/") + 1)
      : "";
    return `${dir}${rawPath.slice(4)}`;
  }
  return rawPath;
}

function isRepoRelativePath(path: string): boolean {
  return REPO_FILE_PATTERN.test(path);
}

function trackFullPath(rawPath: string, lastFullPath: string | null): string | null {
  const resolved = resolveRepoPath(rawPath, lastFullPath);
  if (resolved && isRepoRelativePath(resolved)) return resolved;
  return lastFullPath;
}

/**
 * Parse code-snippet-bearing repository cites from the architecture contract.
 * Only `` (`code`) `` parentheticals are enforced — descriptive prose snippets
 * are intentionally deferred until the contract authors them as literal text.
 */
export function parseArchitectureContractSnippetCitations(
  markdown: string,
): ArchitectureContractCitation[] {
  const citations: ArchitectureContractCitation[] = [];
  let lastFullPath: string | null = null;

  for (const token of collectArchitectureContractCiteTokens(markdown)) {
    if (token.kind === "path") {
      lastFullPath = trackFullPath(token.file, lastFullPath);
      continue;
    }

    if (token.kind === "full") {
      const resolved = trackFullPath(token.file, lastFullPath);
      if (!resolved) continue;
      lastFullPath = resolved;
      citations.push({
        file: resolved,
        lineNumbers: expandArchitectureContractLineSpec(token.lineSpec),
        snippet: normalizeArchitectureContractSnippet(token.snippet),
      });
      continue;
    }

    if (lastFullPath) {
      citations.push({
        file: lastFullPath,
        lineNumbers: expandArchitectureContractLineSpec(token.lineSpec),
        snippet: normalizeArchitectureContractSnippet(token.snippet),
      });
    }
  }

  return citations;
}

/** Validate explicit architecture-contract citation pins against repoRoot. */
export function validateArchitectureContractCitationPins(
  pins: ReadonlyArray<ArchitectureContractCitation>,
  repoRoot: string,
): ArchitectureContractCitationFailure[] {
  const failures: ArchitectureContractCitationFailure[] = [];
  const fileCache = new Map<string, string[] | null>();

  for (const citation of pins) {
    if (!fileCache.has(citation.file)) {
      fileCache.set(citation.file, readRepoFileLines(repoRoot, citation.file));
    }
    const lines = fileCache.get(citation.file);
    if (!lines) {
      failures.push({ ...citation, reason: `missing file ${citation.file}` });
      continue;
    }
    if (!snippetOccursOnLines(lines, citation.lineNumbers, citation.snippet)) {
      failures.push({
        ...citation,
        reason: `snippet ${JSON.stringify(citation.snippet)} not found on ${citation.file}:${citation.lineNumbers.join(",")}`,
      });
    }
  }

  return failures;
}

function readRepoFileLines(rootDir: string, relativePath: string): string[] | null {
  try {
    return readFileSync(`${rootDir}/${relativePath}`, "utf8").split(/\r?\n/);
  } catch {
    return null;
  }
}

function snippetOccursOnLines(
  fileLines: string[],
  lineNumbers: number[],
  snippet: string,
): boolean {
  const selected = lineNumbers
    .map((lineNumber) => fileLines[lineNumber - 1])
    .filter((line): line is string => line !== undefined);
  if (selected.length === 0) return false;
  return selected.join("\n").includes(snippet);
}

/** Validate snippet-bearing cites against files at repoRoot. */
export function validateArchitectureContractSnippetCitations(
  markdown: string,
  repoRoot: string,
): ArchitectureContractCitationFailure[] {
  const failures: ArchitectureContractCitationFailure[] = [];
  const fileCache = new Map<string, string[] | null>();

  for (const citation of parseArchitectureContractSnippetCitations(markdown)) {
    if (!fileCache.has(citation.file)) {
      fileCache.set(citation.file, readRepoFileLines(repoRoot, citation.file));
    }
    const lines = fileCache.get(citation.file);
    if (!lines) {
      failures.push({ ...citation, reason: `missing file ${citation.file}` });
      continue;
    }
    if (!snippetOccursOnLines(lines, citation.lineNumbers, citation.snippet)) {
      failures.push({
        ...citation,
        reason: `snippet ${JSON.stringify(citation.snippet)} not found on ${citation.file}:${citation.lineNumbers.join(",")}`,
      });
    }
  }

  return failures;
}
