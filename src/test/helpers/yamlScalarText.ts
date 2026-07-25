function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function leadingSpaces(value: string): number {
  return value.length - value.trimStart().length;
}

/**
 * Read a simple scalar from a GitHub Actions YAML fragment without coupling
 * guardrail tests to inline-vs-block formatting.
 *
 * This intentionally supports only the scalar forms used by workflow steps:
 * inline values, folded blocks (`>-`), and literal blocks (`|`). It stops a
 * block as soon as YAML indentation returns to the key's level, so comments or
 * sibling keys cannot be mistaken for scalar content.
 */
export function readWorkflowYamlScalar(source: string, key: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const keyPattern = new RegExp(`^(\\s*)${escapeRegExp(key)}:\\s*(.*?)\\s*$`);
  const keyIndex = lines.findIndex((line) => keyPattern.test(line));

  if (keyIndex < 0) {
    throw new Error(`Missing YAML scalar key: ${key}`);
  }

  const match = keyPattern.exec(lines[keyIndex]);
  if (!match) {
    throw new Error(`Unable to parse YAML scalar key: ${key}`);
  }

  const keyIndent = match[1].length;
  const markerOrValue = match[2].trim();
  if (!/^[>|][+-]?$/.test(markerOrValue)) {
    return markerOrValue;
  }

  const blockLines: string[] = [];
  let sawContent = false;

  for (let index = keyIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.trim().length === 0) {
      if (sawContent) blockLines.push("");
      continue;
    }

    if (leadingSpaces(line) <= keyIndent) break;
    sawContent = true;
    blockLines.push(line);
  }

  if (!sawContent) {
    throw new Error(`YAML block scalar has no indented content: ${key}`);
  }

  const contentIndent = Math.min(
    ...blockLines.filter((line) => line.trim().length > 0).map(leadingSpaces),
  );
  const content = blockLines.map((line) =>
    line.trim().length > 0 ? line.slice(contentIndent) : "",
  );

  if (markerOrValue.startsWith(">")) {
    return content
      .map((line) => line.trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return content.join("\n").replace(/\n+$/, "");
}
