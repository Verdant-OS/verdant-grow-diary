/**
 * Public help-center registry for /help, the section hubs and topic pages.
 * A hub lists only pages that exist. Topic pages share the /help/:section
 * route with the hubs; their copy lives in src/constants/helpCenterArticleCopy.ts.
 */
import { HELP_CENTER_ARTICLES } from "@/constants/helpCenterArticleCopy";

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

export interface HelpStepsBlock {
  readonly tag: "ol";
  readonly items: readonly (readonly HelpRun[])[];
}

export type HelpArticleBlock = HelpBlock | HelpStepsBlock;

/** Topic-page copy as written in the constants file. */
export interface HelpArticleCopy {
  readonly slug: string;
  /** The hub that lists this page. */
  readonly sectionSlug: string;
  readonly title: string;
  readonly description: string;
  readonly blocks: readonly HelpArticleBlock[];
}

export interface HelpArticle extends HelpArticleCopy {
  readonly path: string;
  readonly titleTag: string;
  readonly sectionTitle: string;
  readonly sectionPath: string;
}

export type HelpPage =
  | { readonly kind: "section"; readonly section: HelpSection }
  | { readonly kind: "article"; readonly article: HelpArticle };

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
    topics: [
      ...HELP_CENTER_ARTICLES.filter((article) => article.sectionSlug === slug).map((article) => ({
        label: article.title,
        href: `${HOME_PATH}/${article.slug}`,
      })),
      ...topics,
    ],
  };
}

const ARTICLES: readonly HelpArticle[] = HELP_CENTER_ARTICLES.map((copy) => {
  const hub = SECTIONS.find((entry) => entry.slug === copy.sectionSlug);
  if (!hub) throw new Error(`help article ${copy.slug} names unknown hub ${copy.sectionSlug}`);
  if (SECTIONS.some((entry) => entry.slug === copy.slug)) {
    throw new Error(`help article slug ${copy.slug} collides with a hub`);
  }
  return {
    ...copy,
    path: `${HOME_PATH}/${copy.slug}`,
    titleTag: `${copy.title} | Help | Verdant Grow Diary`,
    sectionTitle: hub.title,
    sectionPath: hub.path,
  };
});

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

  static articles(): readonly HelpArticle[] {
    return ARTICLES;
  }

  static paths(): readonly string[] {
    return [HOME_PATH, ...SECTIONS.map((entry) => entry.path), ...ARTICLES.map((a) => a.path)];
  }

  static coversClause(covers: string): string {
    return `Covers ${covers}`;
  }

  static sectionBySlug(slug: string | undefined): HelpSection | null {
    if (!slug) return null;
    return SECTIONS.find((entry) => entry.slug === slug) ?? null;
  }

  static articleBySlug(slug: string | undefined): HelpArticle | null {
    if (!slug) return null;
    return ARTICLES.find((entry) => entry.slug === slug) ?? null;
  }

  /** A hub or a topic page for one /help/:section slug. */
  static pageBySlug(slug: string | undefined): HelpPage | null {
    const hub = HelpCenterContent.sectionBySlug(slug);
    if (hub) return { kind: "section", section: hub };
    const article = HelpCenterContent.articleBySlug(slug);
    return article ? { kind: "article", article } : null;
  }

  static articleFallbackHtml(article: HelpArticle): string {
    return article.blocks.map(renderHelpArticleBlock).join("");
  }

  /** Visible copy plus titles and meta of the topic pages only. */
  static articleCopyCorpus(): string {
    const parts: string[] = [];
    for (const article of ARTICLES) {
      parts.push(article.title, article.titleTag, article.description, article.path);
      for (const block of article.blocks) parts.push(blockText(block));
    }
    return parts.join("\n");
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
    parts.push(HelpCenterContent.articleCopyCorpus());
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

function renderHelpArticleBlock(block: HelpArticleBlock): string {
  if (block.tag !== "ol") return renderHelpBlock(block);
  const items = block.items.map((runs) => `<li>${runs.map(renderHelpRun).join("")}</li>`);
  return `<ol>${items.join("")}</ol>`;
}

function blockText(block: HelpArticleBlock): string {
  if (block.tag !== "ol") return block.runs.map((run) => run.text).join("");
  return block.items.map((runs) => runs.map((run) => run.text).join("")).join("\n");
}
