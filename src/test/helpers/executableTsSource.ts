/**
 * executableTsSource — a TypeScript source with every comment removed and its
 * string and template literals intact.
 *
 * A source-scan test that reads raw text stays green when the call it looks
 * for survives only in a comment, e.g. `// was: return calmFailure(...)`
 * (AGENTS.md, "Contract tests must assert against resolved values"; Codex
 * review on #1683). Scanning this instead makes a commented-out call count as
 * absent. Regex stripping would also cut `//` inside strings such as URLs; the
 * TypeScript printer does not.
 */
import ts from "typescript";

export function executableTsSource(text: string): string {
  const file = ts.createSourceFile(
    "source.ts",
    text,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  return ts.createPrinter({ removeComments: true }).printFile(file);
}
