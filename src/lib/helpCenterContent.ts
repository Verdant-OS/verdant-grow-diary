/**
 * Public help-center registry for /help and the section hubs.
 * Later streams add topic pages here. A hub lists only pages that exist.
 */

export interface HelpTopicLink {
  readonly label: string;
  readonly href: string;
}

export type HelpRun =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly href: string };

export interface HelpBlock {
  readonly tag: "h1" | "h2" | "p";
  readonly runs: readonly HelpRun[];
}

export interface HelpSection {
  readonly slug: string;
  readonly title: string;
  readonly path: string;
  readonly covers: string;
  readonly homeOneLiner: string;
  readonly titleTag: string;
  readonly topics: readonly HelpTopicLink[];
}

const HOME_PATH = "/help";
const HOME_TITLE = "Help | Verdant Grow Diary";
const HOME_DESCRIPTION =
  "Short answers about logging, sensors, AI Doctor, plans, and your account. Contact support from this page.";

const HOME_BLOCKS: readonly HelpBlock[] = [
  { tag: "h1", runs: [{ kind: "text", text: "Help" }] },
  {
    tag: "p",
    runs: [
      { kind: "text", text: "Need a person? Email " },
      {
        kind: "link",
        text: "support@verdantgrowdiary.com",
        href: "mailto:support@verdantgrowdiary.com",
      },
      { kind: "text", text: " or use the " },
      { kind: "link", text: "contact form", href: "/contact" },
      { kind: "text", text: ". Typical reply time is 1–2 business days." },
    ],
  },
  {
    tag: "p",
    runs: [
      {
        kind: "text",
        text: "These pages answer one question at a time. For growing know-how (symptoms, nutrients, lighting), use the ",
      },
      { kind: "link", text: "grower guides", href: "/guides" },
      { kind: "text", text: "." },
    ],
  },
  { tag: "h2", runs: [{ kind: "text", text: "All sections" }] },
  { tag: "h2", runs: [{ kind: "text", text: "Sources" }] },
  { tag: "p", runs: [{ kind: "link", text: "Contact", href: "/contact" }] },
];

const SECTIONS: readonly HelpSection[] = [
  section(
    "getting-started",
    "Getting started",
    "What Verdant is, trying it, and the first grow.",
    "what Verdant is, trying it, and the first grow.",
  ),
  section(
    "grows-tents-plants",
    "Grows, tents and plants",
    "The records every log hangs on.",
    "the records every log hangs on.",
  ),
  section(
    "quick-log-timeline",
    "Quick Log and Timeline",
    "Logging the moment and reading it back.",
    "logging the moment and reading it back.",
  ),
  section(
    "sensors-csv",
    "Sensors and CSV import",
    "Getting readings in and knowing what they mean.",
    "getting readings in and knowing what they mean.",
  ),
  section(
    "ai-doctor",
    "AI Doctor",
    "Cautious, evidence-linked suggestions, not certain diagnoses.",
    "cautious, evidence-linked suggestions, not diagnoses.",
  ),
  section(
    "alerts-action-queue",
    "Alerts and Action Queue",
    "Verdant suggests; you decide and act.",
    "Verdant suggests; you decide and act.",
  ),
  section(
    "plans-billing",
    "Plans and billing",
    "Free, Pro, Craft, credits, and refunds.",
    "Free, Pro, Craft, credits, and refunds.",
  ),
  section(
    "account-privacy",
    "Account, data and privacy",
    "Your data, your account, getting help.",
    "your data, your account, getting help.",
  ),
  section(
    "developers",
    "Developers",
    "Read-only assistant access to your own grow records.",
    "read-only MCP API access to your own data.",
    [{ label: "MCP tools reference", href: "/docs/mcp-api" }],
  ),
];

const DIAGNOSIS_ALLOWLIST = [
  "cautious, evidence-linked suggestions, not diagnoses.",
  "Cautious, evidence-linked suggestions, not certain diagnoses.",
] as const;

const FORBIDDEN_PHRASES = [
  "internal source",
  "needs public confirmation",
  "slack.com",
  "app.notion.com",
  "Post-V0",
  "issue 2160",
  "without the grower's explicit approval",
  "without your explicit approval",
  "will control",
  "sends a command",
  "automates your equipment",
] as const;

function section(
  slug: string,
  title: string,
  covers: string,
  homeOneLiner: string,
  topics: readonly HelpTopicLink[] = [],
): HelpSection {
  return {
    slug,
    title,
    path: `${HOME_PATH}/${slug}`,
    covers,
    homeOneLiner,
    titleTag: `${title} | Help | Verdant Grow Diary`,
    topics,
  };
}

export class HelpCenterContent {
  static homePath(): string {
    return HOME_PATH;
  }

  static homeTitle(): string {
    return HOME_TITLE;
  }

  static homeDescription(): string {
    return HOME_DESCRIPTION;
  }

  static homeBlocks(): readonly HelpBlock[] {
    return HOME_BLOCKS;
  }

  static homeFallbackHtml(): string {
    const items = SECTIONS.map(
      (entry) =>
        `<li><a href="${escapeHelpHtml(entry.path)}">${escapeHelpHtml(entry.title)}</a>: ${escapeHelpHtml(entry.homeOneLiner)}</li>`,
    ).join("");
    const before = HOME_BLOCKS.slice(0, 4).map(renderHelpBlock).join("");
    const after = HOME_BLOCKS.slice(4).map(renderHelpBlock).join("");
    return `${before}<ul>${items}</ul>${after}`;
  }

  static sections(): readonly HelpSection[] {
    return SECTIONS;
  }

  static paths(): readonly string[] {
    return [HOME_PATH, ...SECTIONS.map((entry) => entry.path)];
  }

  static coversClause(covers: string): string {
    return `Covers ${covers}`;
  }

  static sectionBySlug(slug: string | undefined): HelpSection | null {
    if (!slug) return null;
    return SECTIONS.find((entry) => entry.slug === slug) ?? null;
  }

  /** Visible copy plus titles and meta. Used by the public-copy guard. */
  static publicCopyCorpus(): string {
    const parts: string[] = [HOME_TITLE, HOME_DESCRIPTION];
    for (const block of HOME_BLOCKS) {
      parts.push(block.runs.map((run) => run.text).join(""));
    }
    for (const entry of SECTIONS) {
      parts.push(entry.title, entry.covers, entry.homeOneLiner, entry.titleTag, entry.path);
      for (const topic of entry.topics) parts.push(topic.label, topic.href);
    }
    return parts.join("\n");
  }

  static forbiddenCopyHits(text: string): readonly string[] {
    const hits: string[] = [];
    const lower = text.toLowerCase();
    for (const phrase of FORBIDDEN_PHRASES) {
      if (lower.includes(phrase.toLowerCase())) hits.push(phrase);
    }
    if (/\bconfirms\b/i.test(text)) hits.push("confirms");
    let diagnosisRemainder = text;
    for (const allowed of DIAGNOSIS_ALLOWLIST) {
      diagnosisRemainder = diagnosisRemainder.split(allowed).join("");
    }
    if (/\bdiagnoses\b/i.test(diagnosisRemainder)) hits.push("diagnoses");
    return hits;
  }
}

function escapeHelpHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderHelpRun(run: HelpRun): string {
  if (run.kind === "text") return escapeHelpHtml(run.text);
  return `<a href="${escapeHelpHtml(run.href)}">${escapeHelpHtml(run.text)}</a>`;
}

function renderHelpBlock(block: HelpBlock): string {
  return `<${block.tag}>${block.runs.map(renderHelpRun).join("")}</${block.tag}>`;
}
