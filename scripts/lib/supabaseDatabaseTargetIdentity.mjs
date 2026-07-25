/**
 * Pinned Supabase database identities for Verdant's remote schema gates.
 *
 * A secret name is not proof of where its connection string points. Every
 * remote database check must parse the URL and prove that the project ref
 * encoded by the supported Supabase connection form matches the selected
 * environment before psql is allowed to run.
 */
export const SUPABASE_DATABASE_TARGETS = Object.freeze({
  sandbox: Object.freeze({
    projectRef: "bzatgtgjvuojpoxcknaa",
    githubEnvironment: "verdant-sandbox",
  }),
  production: Object.freeze({
    projectRef: "knkwiiywfkbqznbxwqfh",
    githubEnvironment: "verdant-production",
  }),
});

const PROJECT_REF = /^[a-z0-9]{20}$/;
const DIRECT_OR_DEDICATED_HOST = /^db\.([a-z0-9]{20})\.supabase\.co$/;
const SHARED_SUPAVISOR_HOST = /^aws-\d+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/;
const SHARED_SUPAVISOR_USER = /^postgres\.([a-z0-9]{20})$/;
const ALLOWED_SSL_MODES = new Set([
  "disable",
  "allow",
  "prefer",
  "require",
  "verify-ca",
  "verify-full",
]);

export class SupabaseDatabaseTargetIdentityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SupabaseDatabaseTargetIdentityError";
    this.code = code;
  }
}

function identityError(code, message) {
  throw new SupabaseDatabaseTargetIdentityError(code, message);
}

function decodeUsername(encodedUsername) {
  try {
    return decodeURIComponent(encodedUsername);
  } catch {
    identityError("malformed_username", "Database URL username is not valid URL encoding.");
  }
}

function validateConnectionOptions(url) {
  if (!url.search) return;

  const keys = [...url.searchParams.keys()];
  if (
    keys.length !== 1 ||
    keys[0] !== "sslmode" ||
    url.searchParams.getAll("sslmode").length !== 1
  ) {
    identityError(
      "unsupported_connection_options",
      "Database URL may only include one sslmode connection option.",
    );
  }

  const sslmode = url.searchParams.get("sslmode");
  if (!ALLOWED_SSL_MODES.has(sslmode)) {
    identityError("unsupported_sslmode", "Database URL contains an unsupported sslmode value.");
  }
}

/**
 * Parse one of Supabase's documented Postgres connection forms:
 *
 * - Direct: db.<project-ref>.supabase.co:5432, user postgres
 * - Dedicated PgBouncer: db.<project-ref>.supabase.co:6543, user postgres
 * - Shared Supavisor session/transaction:
 *   aws-<n>-<region>.pooler.supabase.com:5432|6543,
 *   user postgres.<project-ref>
 *
 * The returned object contains no password or raw URL.
 */
export function parseSupabaseDatabaseUrl(databaseUrl) {
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
    identityError("missing_database_url", "Database URL is required.");
  }
  if (databaseUrl.trim() !== databaseUrl || /[\u0000-\u001f\u007f]/.test(databaseUrl)) {
    identityError(
      "unsafe_database_url",
      "Database URL contains leading, trailing, or control whitespace.",
    );
  }

  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    identityError("malformed_database_url", "Database URL is not a valid absolute URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    identityError(
      "unsupported_protocol",
      "Database URL must use the postgres or postgresql protocol.",
    );
  }
  if (url.hash) {
    identityError("url_fragment_not_allowed", "Database URL fragments are not allowed.");
  }
  if (!url.username || !url.password) {
    identityError(
      "missing_credentials",
      "Database URL must include both a username and a password.",
    );
  }
  if (url.pathname !== "/postgres") {
    identityError("unexpected_database_name", "Database URL must target the postgres database.");
  }

  validateConnectionOptions(url);

  const username = decodeUsername(url.username);
  const hostname = url.hostname;
  const port = url.port;
  const directMatch = DIRECT_OR_DEDICATED_HOST.exec(hostname);

  if (directMatch) {
    if (username !== "postgres") {
      identityError(
        "unexpected_direct_username",
        "Direct and dedicated Supabase URLs must use the postgres username.",
      );
    }
    if (port !== "5432" && port !== "6543") {
      identityError(
        "unexpected_direct_port",
        "Direct and dedicated Supabase URLs must use port 5432 or 6543.",
      );
    }

    return Object.freeze({
      projectRef: directMatch[1],
      connectionMode: port === "5432" ? "direct" : "dedicated-pooler",
      hostname,
      port: Number(port),
    });
  }

  if (SHARED_SUPAVISOR_HOST.test(hostname)) {
    const userMatch = SHARED_SUPAVISOR_USER.exec(username);
    if (!userMatch) {
      identityError(
        "missing_supavisor_project_ref",
        "Shared Supavisor URLs must encode the project ref in the username.",
      );
    }
    if (port !== "5432" && port !== "6543") {
      identityError(
        "unexpected_supavisor_port",
        "Shared Supavisor URLs must use port 5432 or 6543.",
      );
    }

    return Object.freeze({
      projectRef: userMatch[1],
      connectionMode: port === "5432" ? "shared-supavisor-session" : "shared-supavisor-transaction",
      hostname,
      port: Number(port),
    });
  }

  identityError(
    "unsupported_supabase_host",
    "Database URL does not use a supported Supabase database host.",
  );
}

export function databaseTargetForEnvironment(targetEnv) {
  if (
    typeof targetEnv !== "string" ||
    !Object.prototype.hasOwnProperty.call(SUPABASE_DATABASE_TARGETS, targetEnv)
  ) {
    identityError(
      "unknown_target_environment",
      "TARGET_ENV must be exactly sandbox or production.",
    );
  }
  return SUPABASE_DATABASE_TARGETS[targetEnv];
}

/**
 * Prove that a supported Supabase URL points at the project pinned for the
 * selected environment. Never returns the raw URL or credentials.
 */
export function assertSupabaseDatabaseTargetIdentity({ targetEnv, databaseUrl }) {
  const target = databaseTargetForEnvironment(targetEnv);
  const parsed = parseSupabaseDatabaseUrl(databaseUrl);

  if (!PROJECT_REF.test(parsed.projectRef)) {
    identityError(
      "malformed_project_ref",
      "Database URL does not contain a valid Supabase project ref.",
    );
  }
  if (parsed.projectRef !== target.projectRef) {
    identityError(
      "project_ref_mismatch",
      `Database URL project ref does not match the pinned ${targetEnv} project.`,
    );
  }

  return Object.freeze({
    targetEnv,
    projectRef: target.projectRef,
    githubEnvironment: target.githubEnvironment,
    connectionMode: parsed.connectionMode,
    hostname: parsed.hostname,
    port: parsed.port,
  });
}
