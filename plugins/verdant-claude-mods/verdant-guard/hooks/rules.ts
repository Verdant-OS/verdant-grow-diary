// Pure rules for verdant-guard: no engine, no I/O, deterministic.
// Each check returns a refusal reason, or null when the call may run.
// Source of every rule: AGENTS.md / CLAUDE.md on the verdant-grow-diary deploy branch.

export const PROTECTED_BRANCHES = ["verdant-grow-diary", "main"] as const;

// The production Supabase project ref (CURRENT_STATE.md, standing directive 2026-08-25).
export const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";

const HEREDOC_START = /(?<!<)<<(?!<)-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/;
const SHELL_READS_STDIN = /(^|[\s|;&(])(bash|sh|zsh|dash)(\s+-[a-z]+)*\s*(<<|$)/;

/**
 * Drops heredoc bodies: they are data (a file being written, a script for python or node),
 * not shell commands. A body fed to a shell (`bash <<EOF`) is kept, since the shell runs it.
 */
export function stripHeredocs(command: string): string {
  const out: string[] = [];
  let end: string | null = null;
  let keep = false;
  for (const line of command.split("\n")) {
    if (end !== null) {
      if (line.trim() === end) end = null;
      else if (keep) out.push(line);
      continue;
    }
    out.push(line);
    const m = HEREDOC_START.exec(line);
    if (m && m[2]) {
      end = m[2];
      keep = SHELL_READS_STDIN.test(line.slice(0, m.index).trimEnd() + " <<");
    }
  }
  return out.join("\n");
}

/**
 * Splits a shell command into simple-command segments and tokens. Quote-aware: `&&`, `||`,
 * `;`, `|` and newlines split only outside quotes, so `grep "a|git push --force"` stays one
 * command. Quotes are removed from tokens; a backslash escapes the next character outside
 * single quotes. It does not expand `$(…)`, backticks or `bash -c` strings (see README).
 */
/** Index of the `)` closing the `(` at `open`, respecting nested parens and quotes; -1 if none. */
function matchingParen(text: string, open: number): number {
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (quote !== null) {
      if (c === "\\" && quote === '"') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "\\") i += 1;
    else if (c === "'" || c === '"') quote = c;
    else if (c === "(") depth += 1;
    else if (c === ")" && --depth === 0) return i;
  }
  return -1;
}

export function segments(command: string): string[][] {
  const text = stripHeredocs(command);
  const out: string[][] = [];
  let tokens: string[] = [];
  let token = "";
  let inToken = false;
  let quote: "'" | '"' | null = null;
  const endToken = () => {
    if (inToken) tokens.push(token);
    token = "";
    inToken = false;
  };
  const endSegment = () => {
    endToken();
    if (tokens.length > 0) out.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (quote !== null) {
      if (quote === '"' && c === "$" && text[i + 1] === "(") {
        // A command substitution still runs inside double quotes: check its body as commands.
        const end = matchingParen(text, i + 1);
        if (end > i + 1) {
          out.push(...segments(text.slice(i + 2, end)));
          token += text.slice(i, end + 1);
          i = end;
          continue;
        }
      }
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < text.length) token += text[++i];
      else token += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      inToken = true;
    } else if (c === "\\" && i + 1 < text.length) {
      // A backslash-newline is a line continuation, not a character.
      if (text[i + 1] !== "\n") {
        token += text[i + 1];
        inToken = true;
      }
      i += 1;
    } else if (c === "\n" || c === ";" || c === "|" || c === "(" || c === ")") {
      if (c === "|" && text[i + 1] === "|") i += 1;
      endSegment();
    } else if (c === "&" && text[i - 1] !== ">" && text[i + 1] !== ">") {
      // `&&` and a lone background `&` both end a command; `2>&1` and `&>` are redirections.
      if (text[i + 1] === "&") i += 1;
      endSegment();
    } else if (/\s/.test(c)) {
      endToken();
    } else {
      token += c;
      inToken = true;
    }
  }
  endSegment();
  // An unclosed quote would hide everything after it, so fall back to the conservative
  // split that treats every operator as a separator.
  if (quote !== null) return [...out, ...naiveSegments(text)];
  return out;
}

function naiveSegments(text: string): string[][] {
  return text
    .split(/&&|\|\||;|\||\n|\(|\)|(?<![>])&(?![>])/)
    .map((s) =>
      s
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => t.replace(/^['"]|['"]$/g, "")),
    )
    .filter((t) => t.length > 0);
}

/** Drops leading `VAR=value` assignments and `sudo`/`env`/`exec` wrappers. */
function stripPrefix(tokens: string[]): string[] {
  let i = 0;
  for (const t of tokens) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(t) && !["sudo", "env", "exec", "time"].includes(t)) break;
    i += 1;
  }
  return tokens.slice(i);
}

/** For `git -C dir push ...` returns ["push", ...]. */
function gitArgs(tokens: string[]): string[] | null {
  if (tokens[0] !== "git") return null;
  let i = 1;
  for (let t = tokens[i]; t !== undefined && t.startsWith("-"); t = tokens[i]) {
    // -C <dir> and -c <k=v> consume a value
    i += t === "-C" || t === "-c" ? 2 : 1;
  }
  return tokens.slice(i);
}

const FORCE_FLAGS = /^(--force|-f|--force-with-lease(=.*)?|--force-if-includes)$/;

function checkGit(args: string[]): string | null {
  const [sub, ...rest] = args;
  if (sub === "push") {
    if (rest.some((t) => FORCE_FLAGS.test(t) || (/^\+/.test(t) && !t.startsWith("+-")))) {
      return "Force-push is forbidden (AGENTS.md › Git and merges: never force-push or rewrite history). Update the branch by merging from base.";
    }
    if (rest.includes("--no-verify")) {
      return "`--no-verify` skips the repo's pre-commit/pre-push safety gates. Run the hooks and fix what they report.";
    }
    const positional = rest.filter((t) => !t.startsWith("-"));
    for (const ref of positional.slice(1)) {
      const target = ref.includes(":") ? ref.split(":").pop()! : ref;
      const branch = target.replace(/^refs\/heads\//, "");
      if ((PROTECTED_BRANCHES as readonly string[]).includes(branch)) {
        return `Pushing to \`${branch}\` is forbidden (AGENTS.md: never push directly to verdant-grow-diary or main). Push your own task branch and open a draft PR.`;
      }
    }
    return null;
  }
  if (sub === "rebase" && !rest.some((t) => t === "--abort" || t === "--quit")) {
    return "`git rebase` rewrites history (AGENTS.md: update branches by merging from base). Use `git merge origin/<base>`.";
  }
  if (
    sub === "pull" &&
    rest.some((t) => t === "--rebase" || t === "-r" || t.startsWith("--rebase="))
  ) {
    return "`git pull --rebase` rewrites history. Use `git pull --no-rebase` or `git merge`.";
  }
  if (sub === "commit" && rest.some((t) => t === "--no-verify" || t === "-n")) {
    return "`git commit --no-verify` skips lint-staged, the full-project tsc and the docs-safety asserts. Commit without it and fix what fails.";
  }
  if (sub === "filter-branch" || sub === "filter-repo") {
    return "History rewriting is forbidden (AGENTS.md › Git and merges).";
  }
  return null;
}

const LOCK_MSG =
  "Dependency and lockfile changes are off-limits without Matthew's approval (AGENTS.md › Off-limits). Bun is canonical; never add/change deps with npm/yarn/pnpm.";

function checkPackageManager(tokens: string[]): string | null {
  const [pm, sub, ...rest] = tokens;
  const positional = rest.filter((t) => !t.startsWith("-"));
  if (pm === "npm") {
    if (["add", "uninstall", "remove", "rm", "un", "update", "up", "upgrade"].includes(sub ?? ""))
      return LOCK_MSG;
    // A bare install (no package named) is the run skill's public-registry bootstrap; naming a package is a dependency change.
    if ((sub === "install" || sub === "i") && positional.length > 0) return LOCK_MSG;
    return null;
  }
  if (pm === "yarn" || pm === "pnpm") {
    if (["add", "remove", "install", "i", "up", "upgrade", "update"].includes(sub ?? ""))
      return LOCK_MSG;
    return null;
  }
  if (pm === "bun") {
    if (["add", "a", "remove", "rm", "update"].includes(sub ?? "")) return LOCK_MSG;
    if (sub === "install" || sub === "i") {
      if (positional.length > 0) return LOCK_MSG;
      return "Don't run `bun install` here: bun.lock pins ~137 tarballs on a Lovable registry that 403s outside its sandbox. If node_modules exists, use it; otherwise follow the verified bootstrap in .claude/skills/run-verdant-grow-diary/SKILL.md.";
    }
  }
  return null;
}

const PW_VALUE_FLAGS = new Set([
  "--project",
  "--grep",
  "-g",
  "--grep-invert",
  "--reporter",
  "--workers",
  "-j",
  "--config",
  "-c",
  "--retries",
  "--timeout",
  "--output",
  "--shard",
  "--repeat-each",
  "--max-failures",
  "--trace",
]);

/** Drops a package-runner prefix: `bunx`, `npx`, `bun x`, `pnpm dlx|exec`, `yarn dlx|exec`. */
function stripRunner(tokens: string[]): string[] {
  const [a, b] = tokens;
  let rest: string[];
  if (a === "bunx" || a === "npx") rest = tokens.slice(1);
  else if (a === "bun" && b === "x") rest = tokens.slice(2);
  else if ((a === "pnpm" || a === "yarn") && (b === "dlx" || b === "exec")) rest = tokens.slice(2);
  else return tokens;
  // Skip the runner's own flags (`-y`, `--yes`, `--bun`, `--silent`, …). `-p`/`--package`
  // take a value; `-c`/`--call` take the command itself, which is what gets checked.
  for (let i = 0; i < rest.length; i += 1) {
    const t = rest[i] ?? "";
    if (!t.startsWith("-")) return rest.slice(i);
    if ((t === "-c" || t === "--call") && rest[i + 1] !== undefined) {
      return rest[i + 1]!.split(/\s+/).filter(Boolean);
    }
    if (t.startsWith("--call=")) return t.slice("--call=".length).split(/\s+/).filter(Boolean);
    if (t === "-p" || t === "--package") i += 1;
  }
  return [];
}

function checkPlaywright(tokens: string[]): string | null {
  const t = stripRunner(tokens);
  if (t[0] !== "playwright" || t[1] !== "test") return null;
  const args = t.slice(2);
  let project: string | null = null;
  let specs = 0;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? "";
    if (a.startsWith("--project=")) project = a.slice("--project=".length);
    else if (a === "--project") project = args[i + 1] ?? null;
    if (PW_VALUE_FLAGS.has(a)) {
      i += 1;
      continue;
    }
    if (!a.startsWith("-")) specs += 1;
  }
  if (project && project.includes("mocked") && specs === 0) {
    return `\`--project=${project}\` without a spec filter can reach real Supabase (that project installs no global route mocks). Pass an explicit spec path.`;
  }
  return null;
}

const PROD_MSG =
  "Production database changes, deploys, promotion and rollback are Matthew's decisions (AGENTS.md › Release and Environment Rules). Prepare a release packet or escalation instead.";

function checkProductionOps(rawTokens: string[], whole: string): string | null {
  const tokens = stripRunner(rawTokens);
  const [cmd, a, b] = tokens;
  if (cmd === "supabase") {
    if (a === "db" && (b === "push" || (b === "reset" && tokens.includes("--linked"))))
      return PROD_MSG;
    if (a === "migration" && (b === "up" || b === "repair")) return PROD_MSG;
    if (a === "functions" && b === "deploy") return PROD_MSG;
    if (a === "secrets" && (b === "set" || b === "unset")) return PROD_MSG;
  }
  if (cmd === "vercel") {
    if (tokens.includes("--prod") || ["promote", "rollback", "alias"].includes(a ?? ""))
      return PROD_MSG;
  }
  if (cmd === "gh" && a === "pr" && (b === "merge" || b === "ready")) {
    return "Merging and marking PRs ready belong to Chemdawg after 35/35 required checks plus an independent exact-head PASS (AGENTS.md). Drafts remain draft.";
  }
  if (
    (cmd === "psql" || cmd === "pg_dump" || cmd === "pg_restore") &&
    whole.includes(PRODUCTION_PROJECT_REF)
  ) {
    return PROD_MSG;
  }
  return null;
}

/** The whole Bash rule set. */
export function checkBash(command: string): string | null {
  for (const raw of segments(command)) {
    const tokens = stripPrefix(raw);
    if (tokens.length === 0) continue;
    const git = gitArgs(tokens);
    const reason =
      (git ? checkGit(git) : null) ??
      checkPackageManager(tokens) ??
      checkPlaywright(tokens) ??
      checkProductionOps(tokens, command);
    if (reason) return reason;
  }
  return null;
}

/** Normalises a path to its repo-relative form by anchoring on known roots. */
export function repoRelative(filePath: string, repoRoot?: string | null): string {
  const p = filePath.replace(/\\/g, "/");
  // With the repository root known, strip it exactly: the heuristic below would anchor on the
  // first `/src/` or `/docs/` anywhere, which is wrong for a checkout under ~/src/ or ~/docs/.
  const root = repoRoot ? repoRoot.replace(/\\/g, "/").replace(/\/+$/, "") : "";
  if (root && p.startsWith(`${root}/`)) return p.slice(root.length + 1);
  for (const root of ["src/", "supabase/", "scripts/", "docs/", "e2e/", "config/", ".github/"]) {
    const i = p.indexOf(`/${root}`);
    if (i >= 0) return p.slice(i + 1);
    if (p.startsWith(root)) return p;
  }
  return p.replace(/^.*\//, "");
}

const GENERATED = [
  /^src\/routeTree\.gen\.ts$/,
  /^src\/integrations\/supabase\/types\.ts$/,
  /^supabase\/functions\/mcp\/index\.ts$/,
  /^supabase\/functions\/_shared\/lib\//,
];

const LOCKFILES = new Set([
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

export const MIGRATION_PATH = /^supabase\/migrations\/[^/]+\.sql$/;

/**
 * Static file-edit rules. Published-migration immutability needs a git lookup,
 * so it is decided in register.ts with `isPublished`.
 */
export function checkFileEdit(filePath: string, repoRoot?: string | null): string | null {
  const rel = repoRelative(filePath, repoRoot);
  if (GENERATED.some((re) => re.test(rel))) {
    return `\`${rel}\` is generated — never hand-edit it (CLAUDE.md › Conventions). Regenerate it with the repo's tooling.`;
  }
  if (LOCKFILES.has(rel)) return LOCK_MSG;
  return null;
}

export const PUBLISHED_MIGRATION_MSG = (rel: string) =>
  `\`${rel}\` is a published migration and is permanent history (AGENTS.md › Migration Immutability). Ship a new additive migration, or check config/local-supabase-replay-compatibility.json.`;

/**
 * MCP tools that publish, merge, promote or write production, keyed by service and tool name.
 * The server segment of `mcp__<server>__<tool>` varies by how a connector is installed
 * (`Supabase`, `supabase`, `claude_ai_Supabase`), so it is matched by service, not exactly.
 */
const MCP_DENY: Record<string, string> = {
  github__merge_pull_request: "merge",
  github__enable_pr_auto_merge: "merge",
  supabase__apply_migration: "prod",
  supabase__execute_sql: "prod",
  supabase__deploy_edge_function: "prod",
  supabase__merge_branch: "prod",
  supabase__reset_branch: "prod",
  supabase__delete_branch: "prod",
  supabase__pause_project: "prod",
  supabase__restore_project: "prod",
  vercel__request_promote: "prod",
  vercel__request_rollback: "prod",
  vercel__create_deployment: "prod",
  vercel__start_rolling_release: "prod",
  vercel__complete_rolling_release: "prod",
  vercel__approve_rolling_release_stage: "prod",
  lovable__deploy_project: "prod",
};

const MCP_SERVICES = ["github", "supabase", "vercel", "lovable"] as const;

/** `mcp__claude_ai_Supabase__execute_sql` → `supabase__execute_sql`; null for other servers. */
function mcpServiceTool(tool: string): string | null {
  const m = /^mcp__(.+?)__([^_].*)$/.exec(tool);
  if (!m || !m[1] || !m[2]) return null;
  const server = m[1].toLowerCase();
  // The service must be a whole `_`- or `-`-separated part of the server name, so
  // `claude-ai-supabase` and `supabase_prod` match while `notsupabase` does not.
  const parts = server.split(/[_-]/);
  const service = MCP_SERVICES.find((s) => parts.includes(s));
  return service ? `${service}__${m[2]}` : null;
}

export function checkMcp(tool: string, input: Record<string, unknown>): string | null {
  const key = mcpServiceTool(tool);
  const kind = key ? MCP_DENY[key] : undefined;
  if (kind === "merge") {
    return "Merging belongs to Chemdawg after 35/35 required checks plus an independent exact-head PASS (AGENTS.md).";
  }
  if (kind === "prod") return PROD_MSG;
  if (key === "github__update_pull_request" && input.draft === false) {
    return "Drafts remain draft (AGENTS.md › Git and merges). Readiness is decided by the merge owner.";
  }
  return null;
}

/** CLAUDE.md › Check-in cadence: the prompt cache lives 60 min; arm at <= 55. */
export const CHECK_IN_MAX_MINUTES = 55;

export function checkInWarning(tool: string, input: Record<string, unknown>): string | null {
  if (!/send_later$/.test(tool)) return null;
  const minutes = typeof input.delay_minutes === "number" ? input.delay_minutes : null;
  if (minutes !== null && minutes > CHECK_IN_MAX_MINUTES && minutes <= 75) {
    return `verdant-guard: this check-in is armed at ${minutes} min. CLAUDE.md asks for <= ${CHECK_IN_MAX_MINUTES} min so the wake lands inside the 60-minute prompt cache; a 56–75 min gap is usually an accidental near-miss.`;
  }
  return null;
}
