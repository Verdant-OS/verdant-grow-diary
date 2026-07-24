/**
 * Pure helper: split `text` into segments and mark case-insensitive
 * substring matches of `query`. Presentation-only.
 */
import { Fragment, type ReactNode } from "react";

export interface HighlightMatchOptions {
  /** Optional className for matched <mark> segments. */
  markClassName?: string;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightMatch(
  text: string | null | undefined,
  query: string,
  options: HighlightMatchOptions = {},
): ReactNode {
  if (!text) return null;
  const trimmed = query.trim();
  if (trimmed.length === 0) return text;

  const pattern = new RegExp(`(${escapeRegExp(trimmed)})`, "ig");
  const parts = text.split(pattern);
  if (parts.length === 1) return text;

  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return (
        <mark
          key={index}
          className={
            options.markClassName ??
            "rounded-sm bg-primary/25 px-0.5 text-foreground"
          }
        >
          {part}
        </mark>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
