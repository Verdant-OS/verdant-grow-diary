import type { GuideAnchor } from "../constants/verdantSeoContent";

/** Copy with no usable anchor: rendered as plain text and carries no link target. */
export interface GuideAnchorPlain {
  readonly kind: "plain";
  readonly text: string;
}

export interface GuideAnchorLinked {
  readonly kind: "linked";
  readonly text: string;
  readonly before: string;
  readonly label: string;
  readonly href: string;
  readonly after: string;
}

/** A plain split never has a link target, so no empty link can be rendered. */
export type GuideAnchorSplit = GuideAnchorPlain | GuideAnchorLinked;

/**
 * Split copy around one approved anchor. The label must appear in the text.
 * A missing or unmatched anchor leaves the paragraph as plain text.
 */
export function splitAroundAnchor(text: string, anchor: GuideAnchor | undefined): GuideAnchorSplit {
  if (!anchor || !isPublicGuideHref(anchor.href)) {
    return { kind: "plain", text };
  }
  const index = text.indexOf(anchor.label);
  if (index < 0) {
    return { kind: "plain", text };
  }
  return {
    kind: "linked",
    text,
    before: text.slice(0, index),
    label: anchor.label,
    href: anchor.href,
    after: text.slice(index + anchor.label.length),
  };
}

/** In-app paths and Verdant signup links only. */
export function isPublicGuideHref(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//") && !/[\s\\]/.test(value)) {
    return true;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "verdantgrowdiary.com" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}
