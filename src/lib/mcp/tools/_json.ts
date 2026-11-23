import type { JsonValueInput } from "@lovable.dev/mcp-js";

/**
 * Type-only bridge for mcp-js 3.x, which types `structuredContent` as `JsonValueInput`.
 * The read models passed here return plain JSON (no Dates, functions or class instances),
 * so this cast changes no runtime value.
 */
export function asStructuredJson(value: unknown): JsonValueInput {
  return value as JsonValueInput;
}
