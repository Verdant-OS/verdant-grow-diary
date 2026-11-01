/**
 * Pinned user-facing copy for the public /welcome and /features pages.
 *
 * /welcome is the marketing landing and the sign-out exit
 * (authRedirectRules.PUBLIC_MARKETING_LANDING,
 * authSessionExitRules.SAFE_SIGN_OUT_REDIRECT); /features is the capability
 * index. Both are public acquisition routes, so their copy stays data here and
 * the pages stay presenters — tests assert exact strings against these values.
 *
 * Every claim below is a product fact already stated elsewhere in the repo:
 * the One-Tent Loop order, the source labels, the cautious AI Doctor contract,
 * the approval-required Action Queue, the no-device-control rule, and the
 * credit metering in AGENTS.md §7.
 */

export interface WelcomeStep {
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly linkLabel: string;
}

export interface WelcomeLoopItem {
  readonly name: string;
  readonly body: string;
}

export interface FeatureLink {
  readonly href: string;
  readonly label: string;
}

export interface FeatureGroup {
  readonly id: string;
  readonly heading: string;
  readonly summary: string;
  readonly points: ReadonlyArray<string>;
  readonly links: ReadonlyArray<FeatureLink>;
}

export const WELCOME_COPY = {
  path: "/welcome",
  title: "Start Here: Your First Grow Log | Verdant Grow Diary",
  description:
    "Set up one grow, one tent, and one plant, then capture your first Quick Log. Try the free VPD chart, glossary, and guides without an account.",
  kicker: "Verdant Grow Diary",
  h1: "Start here",
  lede: "Verdant keeps plant memory, sensor truth, and the decisions that follow them. You decide what to do — Verdant never runs your equipment.",
  stepsHeading: "Three steps to a working grow diary",
  steps: [
    {
      title: "Create a grow",
      body: "Name it after the run you are actually running, so the diary reads like your notes and not a database form.",
      href: "/auth?mode=signup",
      linkLabel: "Create an account",
    },
    {
      title: "Add a tent and a plant",
      body: "Every log, photo, and reading attaches to a tent and a plant. That is what makes a past decision findable later.",
      href: "/auth?mode=signup",
      linkLabel: "Set up your first tent",
    },
    {
      title: "Capture a Quick Log",
      body: "One entry: what you changed, what you saw, and when. It saves on this device first, so nothing is lost while you decide.",
      href: "/quick-log",
      linkLabel: "Open Quick Log",
    },
  ] as ReadonlyArray<WelcomeStep>,
  loopHeading: "The loop Verdant is built around",
  loopIntro:
    "Everything in the app sits on this order. Nothing newer replaces it: a clean, safe, tested loop comes before anything else.",
  loop: [
    {
      name: "Grow",
      body: "One run of plants, named after how you actually think about it.",
    },
    {
      name: "Tent",
      body: "The space the readings and photos belong to.",
    },
    {
      name: "Plant",
      body: "The individual plant a log, photo, or strain note attaches to.",
    },
    {
      name: "Quick Log",
      body: "A fast written record of an action or an observation.",
    },
    {
      name: "Timeline",
      body: "The run in order, so a past decision is findable when you need it.",
    },
    {
      name: "Sensor Snapshot",
      body: "Environment context at a moment, carrying its source label.",
    },
    {
      name: "AI Doctor",
      body: "A cautious review of what the evidence says, and what it does not.",
    },
    {
      name: "Alert",
      body: "A signal that something changed worth your attention.",
    },
    {
      name: "Action Queue",
      body: "A suggested step, held until you approve it.",
    },
  ] as ReadonlyArray<WelcomeLoopItem>,
  freeToolsHeading: "Try the free tools first — no account needed",
  freeToolsIntro:
    "These pages run without signing in, so you can check whether Verdant's thinking fits your grow before you commit to it.",
  freeTools: [
    {
      href: "/vpd-chart",
      label: "VPD chart by growth stage",
      body: "Vapor-pressure deficit ranges by stage, in °F or °C.",
    },
    {
      href: "/tools/vpd-calculator",
      label: "VPD calculator",
      body: "Enter temperature and humidity, get air VPD against a conservative stage-aware range.",
    },
    {
      href: "/pheno-comparison",
      label: "Pheno comparison preview",
      body: "A read-only look at how side-by-side phenotype comparison is laid out.",
    },
    {
      href: "/glossary",
      label: "Grower glossary",
      body: "Breeding, cultivation, and environment terms in plain language.",
    },
    {
      href: "/guides",
      label: "Grower guides",
      body: "Stage care checklists, feed-chart logging, and blueprint targets.",
    },
    {
      href: "/hardware-integrations",
      label: "Sensor and hardware integrations",
      body: "What Verdant reads from your gear, read-only.",
    },
  ],
  limitsHeading: "What Verdant does not do",
  limitsIntro:
    "The rules below are deliberate. They are the reason the diary stays trustworthy.",
  limits: [
    "Verdant does not control lights, fans, irrigation, humidifiers, or any other equipment.",
    "AI Doctor suggests; the grower decides. Action Queue items wait for your approval.",
    "Every reading carries a source label — live, manual, csv, demo, stale, or invalid — and unknown or bad telemetry is never shown as healthy.",
    "AI reviews run on credits: 3 per grow on the free plan, 100 per calendar month on paid plans, capped.",
  ],
  ctaHeading: "Ready when you are",
  ctas: [
    { href: "/auth?mode=signup", label: "Create an account" },
    { href: "/auth", label: "Sign in" },
    { href: "/pricing", label: "See plans and pricing" },
  ] as ReadonlyArray<FeatureLink>,
  tagline: "Plant memory. Sensor truth. Better decisions.",
} as const;

export const FEATURES_COPY = {
  path: "/features",
  title: "Features: Grow Diary, Sensor Truth, AI Doctor | Verdant Grow Diary",
  description:
    "What Verdant does: a plant diary with photos, source-labeled sensor readings, alerts, a cautious AI Doctor, and an approval-required action queue.",
  kicker: "Verdant features",
  h1: "Everything Verdant does, in one place",
  lede: "Verdant is a standalone grow operating system: plant logs, photos, sensor readings, alerts, cautious AI, and grower-approved actions. Here is what that means page by page.",
  groups: [
    {
      id: "memory",
      heading: "Plant memory",
      summary:
        "The diary is the product. Everything else in Verdant is built on top of a written record you can trust later.",
      points: [
        "Grows, tents, and plants keep every entry attached to the right place and the right plant.",
        "Quick Log captures an action or an observation in one short entry, and saves on this device first.",
        "The timeline puts the run in order, so a decision from three weeks ago is findable when you need it.",
        "Photos belong to the entry they were taken for, instead of floating in an unlabelled album.",
      ],
      links: [
        { href: "/quick-log", label: "Try Quick Log" },
        { href: "/glossary", label: "Look up a term" },
      ],
    },
    {
      id: "sensors",
      heading: "Sensor truth",
      summary:
        "A reading is only useful if you know where it came from and how old it is. Verdant keeps that visible at every step.",
      points: [
        "Every reading carries its source — live, manual, csv, demo, stale, or invalid — plus its captured time.",
        "Unit swaps, humidity or soil moisture stuck at 0 or 100, and unrealistic pH get flagged instead of trusted.",
        "Sensor integrations and CSV imports are read-only. Your gear stays yours; Verdant does not write to it.",
        "Stale or invalid telemetry is never presented as current or healthy.",
      ],
      links: [
        { href: "/sensors/csv-preview", label: "Preview CSV import" },
        { href: "/hardware-integrations", label: "See supported hardware" },
      ],
    },
    {
      id: "decisions",
      heading: "Decisions, not automation",
      summary:
        "Verdant is built to make your next call safer, not to make it for you.",
      points: [
        "AI Doctor returns the same fields every time: summary, likely issue, confidence, evidence, missing information, what not to do, and a follow-up window.",
        "It does not claim certainty from one photo or one reading. Thin context produces low confidence and a named gap.",
        "Alerts tell you something changed; the Action Queue holds a suggested step until you approve it.",
        "There is no device control. No light, fan, pump, or humidifier is ever switched by Verdant.",
      ],
      links: [
        { href: "/how-ai-doctor-works", label: "How AI Doctor works" },
        { href: "/ai-doctor-readiness-check", label: "Check your context" },
      ],
    },
    {
      id: "tools",
      heading: "Free tools you can use right now",
      summary:
        "These run without an account, so you can use them on tonight's reading and decide about the rest later.",
      points: [
        "The VPD chart shows vapor-pressure deficit ranges by growth stage in °F or °C.",
        "The VPD calculator takes temperature and humidity, applies an optional leaf-temperature offset, and compares the result with a conservative stage-aware range.",
        "The pheno comparison preview shows how side-by-side phenotype notes are laid out.",
        "The glossary, guides, and cultivar library are open reference material.",
      ],
      links: [
        { href: "/vpd-chart", label: "VPD chart" },
        { href: "/tools/vpd-calculator", label: "VPD calculator" },
        { href: "/pheno-comparison", label: "Pheno comparison" },
        { href: "/guides", label: "Grower guides" },
        { href: "/cultivars", label: "Cultivar library" },
      ],
    },
    {
      id: "builders",
      heading: "Connect Verdant to your own setup",
      summary:
        "If you already run a script, an agent, or a home-automation hub, Verdant exposes the same read-only surface to it.",
      points: [
        "The MCP API documents the tools, parameters, and safety limits for grows, diary entries, and sensor context.",
        "It reads what your account can already see — it does not widen access or run equipment.",
      ],
      links: [{ href: "/docs/mcp-api", label: "Read the MCP API reference" }],
    },
    {
      id: "plans",
      heading: "Plans and AI credits",
      summary:
        "AI reviews are metered so the cost stays predictable, and the plan you are on is shown plainly.",
      points: [
        "Free includes 3 AI credits per grow; paid plans include 100 per calendar month, capped.",
        "Your account page shows the plan you are on and the credits you have left.",
        "Checkout runs in test mode until the owner turns on live payments — no card is charged from a test purchase.",
      ],
      links: [{ href: "/pricing", label: "See plans and pricing" }],
    },
  ] as ReadonlyArray<FeatureGroup>,
  ctaHeading: "Keep exploring",
  ctas: [
    { href: "/auth?mode=signup", label: "Create an account" },
    { href: "/welcome", label: "Start-here guide" },
    { href: "/pricing", label: "Plans and pricing" },
  ] as ReadonlyArray<FeatureLink>,
} as const;
