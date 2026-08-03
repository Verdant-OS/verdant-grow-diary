/**
 * Merge conflict resolution strategies for three-ref PR proof (base / head / merge).
 *
 * Used when GitHub `refs/pull/<n>/merge` is unavailable or when a local merge
 * must be constructed for ownership experiments (Codex/Grok causality protocol).
 *
 * Strategies are deterministic path-policy rules — they do not invent product logic.
 *
 * @typedef {'ours' | 'theirs' | 'union' | 'regenerate' | 'manual' | 'base_lockfile' | 'head_contract'} StrategyId
 *
 * @typedef {{
 *   id: StrategyId,
 *   description: string,
 *   when: string,
 *   gitCheckout: 'ours' | 'theirs' | null,
 *   auto: boolean,
 * }} Strategy
 */

/** @type {Record<StrategyId, Strategy>} */
export const STRATEGIES = {
  ours: {
    id: "ours",
    description: "Keep base (ours) version of the conflicted file",
    when: "Base must remain authoritative (generated drift, base-only policy files)",
    gitCheckout: "ours",
    auto: true,
  },
  theirs: {
    id: "theirs",
    description: "Keep head (theirs) version of the conflicted file",
    when: "PR intentionally changes the file; base side is stale",
    gitCheckout: "theirs",
    auto: true,
  },
  head_contract: {
    id: "head_contract",
    description: "Head wins for SSR/auth/test-harness contract paths",
    when: "PR #694-style hardening: storage/init/error paths must not lose to base",
    gitCheckout: "theirs",
    auto: true,
  },
  base_lockfile: {
    id: "base_lockfile",
    description: "Base lockfile wins; head must re-install later if needed",
    when: "Lockfile conflicts — avoid silent dual-resolution; prefer base + explicit re-resolve job",
    gitCheckout: "ours",
    auto: true,
  },
  union: {
    id: "union",
    description: "Union merge (both sides) — only for append-only lists",
    when: "True append-only allowlists with no semantic delete",
    gitCheckout: null,
    auto: false,
  },
  regenerate: {
    id: "regenerate",
    description: "Discard both sides; regenerate from tools",
    when: "routeTree.gen.ts, build stamps, SEO artifacts",
    gitCheckout: null,
    auto: false,
  },
  manual: {
    id: "manual",
    description: "Human / agent semantic resolution required",
    when: "Overlapping product logic, types, or non-trivial dual edits",
    gitCheckout: null,
    auto: false,
  },
};

/**
 * First matching rule wins. Patterns are matched against repo-relative paths.
 * @type {{ pattern: RegExp, strategy: StrategyId, reason: string }[]}
 */
export const PATH_RULES = [
  // Lockfiles / package manager
  {
    pattern: /^(bun\.lock|bun\.lockb|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/,
    strategy: "base_lockfile",
    reason: "lockfile conflicts must not auto-take head",
  },
  // Generated / stamped
  {
    pattern: /(^|\/)routeTree\.gen\.ts$/,
    strategy: "regenerate",
    reason: "TanStack route tree is generated",
  },
  {
    pattern: /^src\/generated\//,
    strategy: "regenerate",
    reason: "generated sources",
  },
  {
    pattern: /^public\/version\.json$/,
    strategy: "regenerate",
    reason: "build stamp",
  },
  {
    pattern: /^\.output\//,
    strategy: "ours",
    reason: "build output should not be merged",
  },
  // SSR / auth contract (PR #694 and peers) — head wins
  {
    pattern:
      /^src\/integrations\/supabase\/(client|client\.server)\.ts$|^src\/lib\/supabase(AuthRuntime|InitializationError)\.ts$|^src\/lib\/ssrErrorResponse\.ts$|^src\/lib\/error-page\.ts$|^src\/server\.ts$/,
    strategy: "head_contract",
    reason: "locked SSR/auth contract paths prefer PR head",
  },
  {
    pattern:
      /^src\/test\/(setup\.ts|helpers\/reactRouterCompat\.vitest\.tsx|supabase-client-ssr|auth-hardening|router-harness)/,
    strategy: "head_contract",
    reason: "PR test harness / SSR tests prefer head",
  },
  {
    pattern: /^scripts\/resolve-ssr-server-bundle\.mjs$|^vitest\.config\.ts$/,
    strategy: "head_contract",
    reason: "PR build/test resolver prefers head",
  },
  // Docs / markdown — usually head for PR docs, base for governance if dual-edited → manual
  {
    pattern: /^(AGENTS|CLAUDE|GEMINI)\.md$|^\.grok\/rules\//,
    strategy: "manual",
    reason: "governance files need sentinel-aware merge",
  },
  // Default product source
  {
    pattern: /\.(ts|tsx|js|jsx|mjs|cjs)$/,
    strategy: "manual",
    reason: "default: semantic resolution required for source",
  },
  {
    pattern: /\.(json|yml|yaml)$/,
    strategy: "manual",
    reason: "config conflicts need review",
  },
  {
    pattern: /\.md$/,
    strategy: "theirs",
    reason: "docs: prefer head narrative on feature PRs",
  },
];

/**
 * @param {string} relPath
 * @returns {{ strategy: Strategy, reason: string, ruleIndex: number }}
 */
export function selectStrategy(relPath) {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  for (let i = 0; i < PATH_RULES.length; i++) {
    const rule = PATH_RULES[i];
    if (rule.pattern.test(normalized)) {
      return {
        strategy: STRATEGIES[rule.strategy],
        reason: rule.reason,
        ruleIndex: i,
      };
    }
  }
  return {
    strategy: STRATEGIES.manual,
    reason: "no path rule matched",
    ruleIndex: -1,
  };
}

/**
 * @param {string[]} conflictedPaths
 * @returns {{
 *   plan: { path: string, strategyId: StrategyId, reason: string, auto: boolean, gitCheckout: string|null }[],
 *   auto: string[],
 *   manual: string[],
 *   regenerate: string[],
 * }}
 */
export function buildResolutionPlan(conflictedPaths) {
  /** @type {ReturnType<typeof buildResolutionPlan>['plan']} */
  const plan = [];
  const auto = [];
  const manual = [];
  const regenerate = [];

  for (const p of conflictedPaths) {
    const { strategy, reason } = selectStrategy(p);
    plan.push({
      path: p,
      strategyId: strategy.id,
      reason,
      auto: strategy.auto,
      gitCheckout: strategy.gitCheckout,
    });
    if (strategy.id === "regenerate") regenerate.push(p);
    else if (strategy.auto) auto.push(p);
    else manual.push(p);
  }

  return { plan, auto, manual, regenerate };
}

/**
 * Apply auto strategies via git checkout --ours/--theirs.
 * @param {{
 *   cwd: string,
 *   plan: ReturnType<typeof buildResolutionPlan>['plan'],
 *   run: (cmd: string, args: string[]) => { status: number, stdout: string, stderr: string },
 *   dryRun?: boolean,
 * }} opts
 */
export function applyAutoResolutions({ cwd, plan, run, dryRun = false }) {
  const applied = [];
  const skipped = [];

  for (const item of plan) {
    if (!item.auto || !item.gitCheckout) {
      skipped.push(item);
      continue;
    }
    if (dryRun) {
      applied.push({ ...item, dryRun: true });
      continue;
    }
    // During conflict: ours = first parent (base), theirs = second (head) when merging head into base
    const which = item.gitCheckout === "ours" ? "--ours" : "--theirs";
    const result = run("git", ["checkout", which, "--", item.path], cwd);
    if (result.status !== 0) {
      skipped.push({ ...item, error: result.stderr || result.stdout });
      continue;
    }
    const add = run("git", ["add", "--", item.path], cwd);
    if (add.status !== 0) {
      skipped.push({ ...item, error: add.stderr || add.stdout });
      continue;
    }
    applied.push(item);
  }

  return { applied, skipped };
}

/**
 * Classify merge construction outcome for ownership proof.
 * @param {{
 *   clean: boolean,
 *   conflicted: string[],
 *   plan: ReturnType<typeof buildResolutionPlan>,
 *   remainingConflicts: string[],
 * }} input
 */
export function classifyMergeOutcome(input) {
  if (input.clean && input.conflicted.length === 0) {
    return {
      kind: "clean_merge",
      merge_interaction_risk: "low",
      note: "No conflicts; merge tree matches automatic merge",
    };
  }
  if (input.remainingConflicts.length === 0 && input.conflicted.length > 0) {
    return {
      kind: "auto_resolved",
      merge_interaction_risk: "medium",
      note: "Conflicts existed but all auto strategies applied; re-run tests on resolved tree",
    };
  }
  return {
    kind: "manual_required",
    merge_interaction_risk: "high",
    note: "Unresolved conflicts remain — MERGE ref is unproven until manual resolution",
    remaining: input.remainingConflicts,
  };
}
