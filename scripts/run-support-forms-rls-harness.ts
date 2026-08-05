#!/usr/bin/env -S bun run
/**
 * Runtime RLS harness for Verdant's public Contact and Feedback forms.
 *
 * The browser-equivalent clients use the publishable/anon key. The service
 * role is confined to synthetic-user setup, verification, and teardown.
 *
 * This harness is intentionally local-only because it creates Auth users and
 * public support submissions:
 *
 *   bun run scripts/run-support-forms-rls-harness.ts --confirm-local-security-lane
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY
 *     (SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY are accepted aliases)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LOCAL_LANE_FLAG = "--confirm-local-security-lane";

if (!process.argv.includes(LOCAL_LANE_FLAG)) {
  console.log(
    `[support-forms] SKIP — pass ${LOCAL_LANE_FLAG} to run the disposable local RLS harness.`,
  );
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

for (const [name, value] of [
  ["SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ["SUPABASE_ANON_KEY", anonKey],
] as const) {
  if (!value) {
    console.error(`[support-forms] missing ${name}`);
    process.exit(2);
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

let targetHostname: string;
try {
  targetHostname = new URL(supabaseUrl!).hostname;
} catch {
  console.error("[support-forms] database API URL is invalid");
  process.exit(2);
}

if (!isLoopbackHost(targetHostname)) {
  console.error("[support-forms] local security lane requires a loopback database");
  process.exit(2);
}

const admin = createClient(supabaseUrl!, serviceKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anonymous = createClient(supabaseUrl!, anonKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const FEEDBACK_PUBLIC_INSERT_COLUMNS = [
  "overall_rating",
  "ai_doctor_rating",
  "sensors_rating",
  "quicklog_rating",
  "trust_rating",
  "whats_working",
  "whats_friction",
  "one_improvement",
  "grow_context",
  "contact_email",
  "follow_up_ok",
  "user_agent",
] as const;

export const CONTACT_PUBLIC_INSERT_COLUMNS = [
  "name",
  "email",
  "category",
  "message",
  "grow_context",
  "user_agent",
] as const;

const FEEDBACK_SERVER_ONLY_COLUMNS = [
  "id",
  "user_id",
  "created_at",
  "reviewed_at",
  "reviewed_by",
  "admin_notes",
] as const;

const CONTACT_SERVER_ONLY_COLUMNS = [
  "id",
  "user_id",
  "attachment_path",
  "created_at",
  "reviewed_at",
  "reviewed_by",
  "admin_notes",
] as const;

const CONTACT_CATEGORIES = [
  "technical_support",
  "bug_report",
  "feature_idea",
  "billing_account",
  "hardware_integration",
  "other",
] as const;

const RATING_ONLY_OVERALL_RATING = 2;

type SupportTable = "customer_feedback" | "contact_messages";
type TestUser = {
  id: string;
  email: string;
  password: string;
};
type AllowedFixtures = {
  feedbackAnonId: string;
  feedbackAuthId: string;
  feedbackAuthRatingOnlyId: string;
  contactAnonId: string;
  contactAuthId: string;
  authenticatedUserId: string;
  feedbackOriginalWorking: string;
  feedbackAuthOriginalImprovement: string;
  contactOriginalMessage: string;
  contactAuthOriginalMessage: string;
};

const runId = crypto.randomUUID();
const marker = `support-rls-${runId}`;
const createdUserIds: string[] = [];
let passed = 0;
let failed = 0;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const AUTHORIZATION_DENIAL_CODES = new Set(["42501"]);
const PAYLOAD_DENIAL_CODES = new Set(["22001", "23502", "23514", "42501"]);
const POSTGREST_DENIAL_MESSAGE =
  /(?:forbidden|not authorized|permission denied|privilege|row[- ]level security)/i;

function redactSensitiveText(value: string): string {
  return value.replace(EMAIL_PATTERN, "[email]").replace(UUID_PATTERN, "[id]");
}

function safeError(error: unknown): string | undefined {
  if (!error) return undefined;
  if (error instanceof Error) return redactSensitiveText(error.message).slice(0, 300);
  if (typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown };
    const code = typeof record.code === "string" ? record.code : "db_error";
    const message = typeof record.message === "string" ? record.message : "request failed";
    return redactSensitiveText(`${code}: ${message}`).slice(0, 300);
  }
  return redactSensitiveText(String(error)).slice(0, 300);
}

function isExpectedDatabaseDenial(error: unknown, acceptedCodes: ReadonlySet<string>): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code.toUpperCase() : "";
  const message = typeof record.message === "string" ? record.message : "";
  return (
    acceptedCodes.has(code) || (code.startsWith("PGRST") && POSTGREST_DENIAL_MESSAGE.test(message))
  );
}

function isSameInstant(actual: unknown, expected: string): boolean {
  if (typeof actual !== "string") return false;
  const actualTime = Date.parse(actual);
  const expectedTime = Date.parse(expected);
  return Number.isFinite(actualTime) && actualTime === expectedTime;
}

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function compactLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

function fillToLength(prefix: string, length: number, fill = "x"): string {
  if (prefix.length > length) {
    throw new Error("fixture prefix exceeds requested boundary");
  }
  return prefix + fill.repeat(length - prefix.length);
}

function emailAtLength(length: number, label: string): string {
  const suffix = "@verdant.test";
  const prefix = `${compactLabel(label)}-${runId}-`;
  if (prefix.length + suffix.length > length) {
    throw new Error("fixture email prefix exceeds requested boundary");
  }
  return `${prefix}${"a".repeat(length - prefix.length - suffix.length)}${suffix}`;
}

function caseEmail(label: string): string {
  return `${compactLabel(label)}-${runId}@verdant.test`;
}

function feedbackPayload(
  label: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const caseMarker = `${marker}:${compactLabel(label)}`;
  return {
    overall_rating: 3,
    ai_doctor_rating: null,
    sensors_rating: null,
    quicklog_rating: null,
    trust_rating: null,
    whats_working: `${caseMarker}:working`,
    whats_friction: `${caseMarker}:friction`,
    one_improvement: `${caseMarker}:improvement`,
    grow_context: `${caseMarker}:context`,
    contact_email: caseEmail(label),
    follow_up_ok: false,
    user_agent: `${caseMarker}:agent`,
    ...overrides,
  };
}

function contactPayload(
  label: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const caseMarker = `${marker}:${compactLabel(label)}`;
  return {
    name: `Harness ${compactLabel(label)}`,
    email: caseEmail(label),
    category: "technical_support",
    message: `${caseMarker}:message`,
    grow_context: `${caseMarker}:context`,
    user_agent: `${caseMarker}:agent`,
    ...overrides,
  };
}

async function createUser(label: string): Promise<TestUser> {
  const email = `support-forms-${compactLabel(label)}-${runId}@verdant.test`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`create synthetic user failed: ${safeError(error) ?? "missing user"}`);
  }
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function signedInClient(user: TestUser): Promise<SupabaseClient> {
  const client = createClient(supabaseUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) {
    throw new Error(`sign in synthetic user failed: ${safeError(error)}`);
  }
  return client;
}

async function expectInsertAllowed(
  name: string,
  client: SupabaseClient,
  table: SupportTable,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.from(table).insert(payload);
  check(name, !error, safeError(error));
}

async function expectInsertRejected(
  name: string,
  client: SupabaseClient,
  table: SupportTable,
  payload: Record<string, unknown>,
  acceptedCodes: ReadonlySet<string> = PAYLOAD_DENIAL_CODES,
): Promise<void> {
  const { error } = await client.from(table).insert(payload);
  check(
    name,
    isExpectedDatabaseDenial(error, acceptedCodes),
    error ? `unexpected database rejection: ${safeError(error)}` : "insert unexpectedly succeeded",
  );
}

function requireRow<T>(rows: T[] | null, predicate: (row: T) => boolean, label: string): T {
  const row = rows?.find(predicate);
  if (!row) throw new Error(`required ${label} fixture is missing`);
  return row;
}

async function assertAllowedInserts(
  authenticated: SupabaseClient,
  authenticatedUserId: string,
): Promise<AllowedFixtures> {
  console.log("→ allowed support-form inserts");

  const feedbackAnonEmail = emailAtLength(320, "feedback-anon-max");
  const feedbackAuthEmail = caseEmail("feedback-auth-min");
  const feedbackOriginalWorking = fillToLength(`${marker}:feedback-max:`, 4000, "w");
  const feedbackAuthOriginalImprovement = `${marker}:feedback-auth-min`;

  await expectInsertAllowed(
    "feedback anon max accepted",
    anonymous,
    "customer_feedback",
    feedbackPayload("feedback-anon-max", {
      overall_rating: 1,
      ai_doctor_rating: 5,
      sensors_rating: 1,
      quicklog_rating: 5,
      trust_rating: 1,
      whats_working: feedbackOriginalWorking,
      whats_friction: fillToLength(`${marker}:friction-max:`, 4000, "f"),
      one_improvement: fillToLength(`${marker}:improvement-max:`, 4000, "i"),
      grow_context: fillToLength(`${marker}:context-max:`, 500, "g"),
      contact_email: feedbackAnonEmail,
      follow_up_ok: true,
      user_agent: fillToLength(`${marker}:agent-max:`, 500, "u"),
    }),
  );
  await expectInsertAllowed(
    "feedback authenticated minimum accepted",
    authenticated,
    "customer_feedback",
    feedbackPayload("feedback-auth-min", {
      overall_rating: 5,
      ai_doctor_rating: null,
      sensors_rating: null,
      quicklog_rating: null,
      trust_rating: null,
      whats_working: null,
      whats_friction: null,
      one_improvement: feedbackAuthOriginalImprovement,
      grow_context: null,
      contact_email: feedbackAuthEmail,
      follow_up_ok: false,
      user_agent: null,
    }),
  );
  const ratingOnlyPayload: Record<string, unknown> = {
    overall_rating: RATING_ONLY_OVERALL_RATING,
    ai_doctor_rating: null,
    sensors_rating: null,
    quicklog_rating: null,
    trust_rating: null,
    whats_working: null,
    whats_friction: null,
    one_improvement: null,
    grow_context: null,
    contact_email: null,
    follow_up_ok: false,
    user_agent: null,
  };
  await expectInsertAllowed(
    "feedback authenticated rating-only accepted",
    authenticated,
    "customer_feedback",
    ratingOnlyPayload,
  );

  const contactAnonEmail = emailAtLength(320, "contact-anon-max");
  const contactAuthEmail = caseEmail("contact-auth-min");
  const contactOriginalMessage = fillToLength(`${marker}:contact-max:`, 8000, "m");
  const contactAuthOriginalMessage = `${marker}:contact-auth-min`;

  await expectInsertAllowed(
    "contact anon max accepted",
    anonymous,
    "contact_messages",
    contactPayload("contact-anon-max", {
      name: fillToLength("Harness max ", 120, "n"),
      email: contactAnonEmail,
      category: "other",
      message: contactOriginalMessage,
      grow_context: fillToLength(`${marker}:contact-context-max:`, 500, "c"),
      user_agent: fillToLength(`${marker}:contact-agent-max:`, 500, "a"),
    }),
  );
  await expectInsertAllowed(
    "contact authenticated minimum accepted",
    authenticated,
    "contact_messages",
    contactPayload("contact-auth-min", {
      name: "A",
      email: contactAuthEmail,
      category: "technical_support",
      message: contactAuthOriginalMessage,
      grow_context: null,
      user_agent: null,
    }),
  );

  for (const category of CONTACT_CATEGORIES) {
    await expectInsertAllowed(
      `contact category ${category} accepted`,
      authenticated,
      "contact_messages",
      contactPayload(`category-${category}`, { category }),
    );
  }

  const { data: feedbackRows, error: feedbackError } = await admin
    .from("customer_feedback")
    .select(
      "id,user_id,created_at,contact_email,whats_working,one_improvement,reviewed_at,reviewed_by,admin_notes",
    )
    .in("contact_email", [feedbackAnonEmail, feedbackAuthEmail]);
  if (feedbackError) {
    throw new Error(`verify allowed feedback failed: ${safeError(feedbackError)}`);
  }

  const feedbackAnon = requireRow(
    feedbackRows,
    (row) => row.contact_email === feedbackAnonEmail,
    "anonymous feedback",
  );
  const feedbackAuth = requireRow(
    feedbackRows,
    (row) => row.contact_email === feedbackAuthEmail,
    "authenticated feedback",
  );
  check("anonymous feedback gets a null server-owned user_id", feedbackAnon.user_id === null);
  check(
    "authenticated feedback gets the caller's server-owned user_id",
    feedbackAuth.user_id === authenticatedUserId,
  );
  check(
    "feedback generated and review fields are server-controlled",
    typeof feedbackAnon.id === "string" &&
      typeof feedbackAnon.created_at === "string" &&
      feedbackAnon.reviewed_at === null &&
      feedbackAnon.reviewed_by === null &&
      feedbackAnon.admin_notes === null &&
      feedbackAuth.reviewed_at === null &&
      feedbackAuth.reviewed_by === null &&
      feedbackAuth.admin_notes === null,
  );

  const { data: ratingOnlyFeedback, error: ratingOnlyFeedbackError } = await admin
    .from("customer_feedback")
    .select(
      "id,user_id,created_at,overall_rating,ai_doctor_rating,sensors_rating,quicklog_rating,trust_rating,whats_working,whats_friction,one_improvement,grow_context,contact_email,follow_up_ok,user_agent,reviewed_at,reviewed_by,admin_notes",
    )
    .eq("user_id", authenticatedUserId)
    .eq("overall_rating", RATING_ONLY_OVERALL_RATING)
    .eq("follow_up_ok", false)
    .is("ai_doctor_rating", null)
    .is("sensors_rating", null)
    .is("quicklog_rating", null)
    .is("trust_rating", null)
    .is("whats_working", null)
    .is("whats_friction", null)
    .is("one_improvement", null)
    .is("grow_context", null)
    .is("contact_email", null)
    .is("user_agent", null)
    .single();
  if (ratingOnlyFeedbackError || !ratingOnlyFeedback) {
    throw new Error(
      `verify authenticated rating-only feedback failed: ${
        safeError(ratingOnlyFeedbackError) ?? "missing row"
      }`,
    );
  }
  check(
    "service verification confirms authenticated rating-only feedback",
    typeof ratingOnlyFeedback.id === "string" &&
      typeof ratingOnlyFeedback.created_at === "string" &&
      ratingOnlyFeedback.user_id === authenticatedUserId &&
      ratingOnlyFeedback.overall_rating === RATING_ONLY_OVERALL_RATING &&
      ratingOnlyFeedback.ai_doctor_rating === null &&
      ratingOnlyFeedback.sensors_rating === null &&
      ratingOnlyFeedback.quicklog_rating === null &&
      ratingOnlyFeedback.trust_rating === null &&
      ratingOnlyFeedback.whats_working === null &&
      ratingOnlyFeedback.whats_friction === null &&
      ratingOnlyFeedback.one_improvement === null &&
      ratingOnlyFeedback.grow_context === null &&
      ratingOnlyFeedback.contact_email === null &&
      ratingOnlyFeedback.follow_up_ok === false &&
      ratingOnlyFeedback.user_agent === null &&
      ratingOnlyFeedback.reviewed_at === null &&
      ratingOnlyFeedback.reviewed_by === null &&
      ratingOnlyFeedback.admin_notes === null,
  );

  const { data: contactRows, error: contactError } = await admin
    .from("contact_messages")
    .select(
      "id,user_id,created_at,email,message,attachment_path,reviewed_at,reviewed_by,admin_notes",
    )
    .in("email", [contactAnonEmail, contactAuthEmail]);
  if (contactError) {
    throw new Error(`verify allowed contact failed: ${safeError(contactError)}`);
  }

  const contactAnon = requireRow(
    contactRows,
    (row) => row.email === contactAnonEmail,
    "anonymous contact",
  );
  const contactAuth = requireRow(
    contactRows,
    (row) => row.email === contactAuthEmail,
    "authenticated contact",
  );
  check("anonymous contact gets a null server-owned user_id", contactAnon.user_id === null);
  check(
    "authenticated contact gets the caller's server-owned user_id",
    contactAuth.user_id === authenticatedUserId,
  );
  check(
    "contact generated, attachment, and review fields are server-controlled",
    typeof contactAnon.id === "string" &&
      typeof contactAnon.created_at === "string" &&
      contactAnon.attachment_path === null &&
      contactAnon.reviewed_at === null &&
      contactAnon.reviewed_by === null &&
      contactAnon.admin_notes === null &&
      contactAuth.attachment_path === null &&
      contactAuth.reviewed_at === null &&
      contactAuth.reviewed_by === null &&
      contactAuth.admin_notes === null,
  );

  return {
    feedbackAnonId: feedbackAnon.id,
    feedbackAuthId: feedbackAuth.id,
    feedbackAuthRatingOnlyId: ratingOnlyFeedback.id,
    contactAnonId: contactAnon.id,
    contactAuthId: contactAuth.id,
    authenticatedUserId,
    feedbackOriginalWorking,
    feedbackAuthOriginalImprovement,
    contactOriginalMessage,
    contactAuthOriginalMessage,
  };
}

function serverOnlyValue(column: string, otherUserId: string): unknown {
  switch (column) {
    case "id":
      return crypto.randomUUID();
    case "user_id":
    case "reviewed_by":
      return otherUserId;
    case "created_at":
      return "2000-01-01T00:00:00.000Z";
    case "reviewed_at":
      return new Date().toISOString();
    case "admin_notes":
      return `${marker}:forged-admin-note`;
    case "attachment_path":
      return `${marker}/forged-attachment`;
    default:
      throw new Error("unknown server-only column fixture");
  }
}

async function assertServerOwnedColumnsRejected(
  authenticated: SupabaseClient,
  authenticatedUserId: string,
  otherUserId: string,
): Promise<void> {
  console.log("→ server-owned column rejection");

  for (const [roleLabel, client] of [
    ["anon", anonymous],
    ["authenticated", authenticated],
  ] as const) {
    for (const column of FEEDBACK_SERVER_ONLY_COLUMNS) {
      await expectInsertRejected(
        `feedback ${roleLabel} cannot assign server column ${column}`,
        client,
        "customer_feedback",
        feedbackPayload(`feedback-${roleLabel}-server-${column}`, {
          [column]: serverOnlyValue(column, otherUserId),
        }),
        AUTHORIZATION_DENIAL_CODES,
      );
    }
    for (const column of CONTACT_SERVER_ONLY_COLUMNS) {
      await expectInsertRejected(
        `contact ${roleLabel} cannot assign server column ${column}`,
        client,
        "contact_messages",
        contactPayload(`contact-${roleLabel}-server-${column}`, {
          [column]: serverOnlyValue(column, otherUserId),
        }),
        AUTHORIZATION_DENIAL_CODES,
      );
    }
  }

  await expectInsertRejected(
    "authenticated feedback cannot explicitly assign even its own user_id",
    authenticated,
    "customer_feedback",
    feedbackPayload("feedback-auth-own-user-id", { user_id: authenticatedUserId }),
    AUTHORIZATION_DENIAL_CODES,
  );
  await expectInsertRejected(
    "authenticated contact cannot explicitly assign even its own user_id",
    authenticated,
    "contact_messages",
    contactPayload("contact-auth-own-user-id", { user_id: authenticatedUserId }),
    AUTHORIZATION_DENIAL_CODES,
  );
}

async function assertPayloadBoundaries(authenticated: SupabaseClient): Promise<void> {
  console.log("→ bounded public payload rejection");

  const feedbackCases: Array<[string, Record<string, unknown>]> = [
    ["feedback overall rating below minimum rejected", { overall_rating: 0 }],
    ["feedback overall rating above maximum rejected", { overall_rating: 6 }],
    ...(["ai_doctor_rating", "sensors_rating", "quicklog_rating", "trust_rating"] as const).flatMap(
      (column) =>
        [
          [`feedback ${column} below minimum rejected`, { [column]: 0 }],
          [`feedback ${column} above maximum rejected`, { [column]: 6 }],
        ] as Array<[string, Record<string, unknown>]>,
    ),
    [
      "feedback whats_working max + 1 rejected",
      { whats_working: fillToLength(`${marker}:working-over:`, 4001, "w") },
    ],
    [
      "feedback whats_friction max + 1 rejected",
      { whats_friction: fillToLength(`${marker}:friction-over:`, 4001, "f") },
    ],
    [
      "feedback one_improvement max + 1 rejected",
      { one_improvement: fillToLength(`${marker}:improvement-over:`, 4001, "i") },
    ],
    ["feedback empty optional text rejected", { whats_working: "" }],
    ["feedback whitespace-only optional text rejected", { whats_friction: "   " }],
    [
      "feedback grow context max + 1 rejected",
      { grow_context: fillToLength(`${marker}:context-over:`, 501, "g") },
    ],
    ["feedback whitespace-only grow context rejected", { grow_context: "   " }],
    ["feedback malformed email rejected", { contact_email: `${runId}.invalid` }],
    ["feedback email max + 1 rejected", { contact_email: emailAtLength(321, "feedback-over") }],
    ["feedback padded email rejected", { contact_email: ` ${caseEmail("feedback-padded")} ` }],
    [
      "feedback user agent max + 1 rejected",
      { user_agent: fillToLength(`${marker}:agent-over:`, 501, "u") },
    ],
  ];

  for (const [roleLabel, client] of [
    ["anon", anonymous],
    ["authenticated", authenticated],
  ] as const) {
    for (const [name, overrides] of feedbackCases) {
      await expectInsertRejected(
        `${name} (${roleLabel})`,
        client,
        "customer_feedback",
        feedbackPayload(`${roleLabel}-${name}`, overrides),
      );
    }
  }

  const contactCases: Array<[string, Record<string, unknown>]> = [
    ["contact name max + 1 rejected", { name: "n".repeat(121) }],
    ["contact whitespace-only name rejected", { name: "   " }],
    ["contact padded name rejected", { name: " Harness " }],
    ["contact malformed email rejected", { email: `${runId}.invalid` }],
    ["contact email max + 1 rejected", { email: emailAtLength(321, "contact-over") }],
    ["contact padded email rejected", { email: ` ${caseEmail("contact-padded")} ` }],
    ["contact unknown category rejected", { category: "attacker_controlled" }],
    [
      "contact message max + 1 rejected",
      { message: fillToLength(`${marker}:message-over:`, 8001, "m") },
    ],
    ["contact whitespace-only message rejected", { message: "   " }],
    ["contact padded message rejected", { message: " padded message " }],
    [
      "contact grow context max + 1 rejected",
      { grow_context: fillToLength(`${marker}:contact-context-over:`, 501, "g") },
    ],
    ["contact whitespace-only grow context rejected", { grow_context: "   " }],
    [
      "contact user agent max + 1 rejected",
      { user_agent: fillToLength(`${marker}:contact-agent-over:`, 501, "u") },
    ],
  ];

  for (const [roleLabel, client] of [
    ["anon", anonymous],
    ["authenticated", authenticated],
  ] as const) {
    for (const [name, overrides] of contactCases) {
      await expectInsertRejected(
        `${name} (${roleLabel})`,
        client,
        "contact_messages",
        contactPayload(`${roleLabel}-${name}`, overrides),
      );
    }
  }
}

async function expectDeniedOrZero(
  name: string,
  operation: PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<void> {
  const { data, error } = await operation;
  const explicitDenial = isExpectedDatabaseDenial(error, AUTHORIZATION_DENIAL_CODES);
  const zeroVisibleRows = !error && Array.isArray(data) && data.length === 0;
  check(
    name,
    explicitDenial || zeroVisibleRows,
    error
      ? `unexpected database error: ${safeError(error)}`
      : `rows=${Array.isArray(data) ? data.length : "null"}`,
  );
}

async function assertIsolationPostconditions(
  fixtures: AllowedFixtures,
  authenticatedUserId: string,
): Promise<void> {
  const [{ data: feedbackRows, error: feedbackError }, { data: contactRows, error: contactError }] =
    await Promise.all([
      admin
        .from("customer_feedback")
        .select(
          "id,user_id,overall_rating,ai_doctor_rating,sensors_rating,quicklog_rating,trust_rating,whats_working,whats_friction,one_improvement,grow_context,contact_email,follow_up_ok,user_agent,reviewed_at,reviewed_by,admin_notes",
        )
        .in("id", [
          fixtures.feedbackAnonId,
          fixtures.feedbackAuthId,
          fixtures.feedbackAuthRatingOnlyId,
        ]),
      admin
        .from("contact_messages")
        .select("id,user_id,message,attachment_path,reviewed_at,reviewed_by,admin_notes")
        .in("id", [fixtures.contactAnonId, fixtures.contactAuthId]),
    ]);

  const feedbackAnon = feedbackRows?.find((row) => row.id === fixtures.feedbackAnonId);
  const feedbackAuth = feedbackRows?.find((row) => row.id === fixtures.feedbackAuthId);
  const feedbackAuthRatingOnly = feedbackRows?.find(
    (row) => row.id === fixtures.feedbackAuthRatingOnlyId,
  );
  const contactAnon = contactRows?.find((row) => row.id === fixtures.contactAnonId);
  const contactAuth = contactRows?.find((row) => row.id === fixtures.contactAuthId);

  check(
    "service verification confirms isolated support rows remain unchanged",
    !feedbackError &&
      !contactError &&
      feedbackRows?.length === 3 &&
      contactRows?.length === 2 &&
      feedbackAnon?.user_id === null &&
      feedbackAnon?.whats_working === fixtures.feedbackOriginalWorking &&
      feedbackAnon?.reviewed_at === null &&
      feedbackAnon?.reviewed_by === null &&
      feedbackAnon?.admin_notes === null &&
      feedbackAuth?.user_id === authenticatedUserId &&
      feedbackAuth?.one_improvement === fixtures.feedbackAuthOriginalImprovement &&
      feedbackAuth?.reviewed_at === null &&
      feedbackAuth?.reviewed_by === null &&
      feedbackAuth?.admin_notes === null &&
      feedbackAuthRatingOnly?.user_id === authenticatedUserId &&
      feedbackAuthRatingOnly?.overall_rating === RATING_ONLY_OVERALL_RATING &&
      feedbackAuthRatingOnly?.ai_doctor_rating === null &&
      feedbackAuthRatingOnly?.sensors_rating === null &&
      feedbackAuthRatingOnly?.quicklog_rating === null &&
      feedbackAuthRatingOnly?.trust_rating === null &&
      feedbackAuthRatingOnly?.whats_working === null &&
      feedbackAuthRatingOnly?.whats_friction === null &&
      feedbackAuthRatingOnly?.one_improvement === null &&
      feedbackAuthRatingOnly?.grow_context === null &&
      feedbackAuthRatingOnly?.contact_email === null &&
      feedbackAuthRatingOnly?.follow_up_ok === false &&
      feedbackAuthRatingOnly?.user_agent === null &&
      feedbackAuthRatingOnly?.reviewed_at === null &&
      feedbackAuthRatingOnly?.reviewed_by === null &&
      feedbackAuthRatingOnly?.admin_notes === null &&
      contactAnon?.user_id === null &&
      contactAnon?.message === fixtures.contactOriginalMessage &&
      contactAnon?.attachment_path === null &&
      contactAnon?.reviewed_at === null &&
      contactAnon?.reviewed_by === null &&
      contactAnon?.admin_notes === null &&
      contactAuth?.user_id === authenticatedUserId &&
      contactAuth?.message === fixtures.contactAuthOriginalMessage &&
      contactAuth?.attachment_path === null &&
      contactAuth?.reviewed_at === null &&
      contactAuth?.reviewed_by === null &&
      contactAuth?.admin_notes === null,
    safeError(feedbackError ?? contactError),
  );
}

async function assertReadMutationIsolation(
  authenticated: SupabaseClient,
  stranger: SupabaseClient,
  authenticatedUserId: string,
  fixtures: AllowedFixtures,
): Promise<void> {
  console.log("→ public read and mutation isolation");

  const feedbackIsolationCases = [
    {
      actor: "anon",
      relation: "anonymous",
      client: anonymous,
      feedbackId: fixtures.feedbackAnonId,
    },
    {
      actor: "authenticated submitter",
      relation: "own authenticated",
      client: authenticated,
      feedbackId: fixtures.feedbackAuthId,
    },
    {
      actor: "authenticated submitter",
      relation: "own authenticated rating-only",
      client: authenticated,
      feedbackId: fixtures.feedbackAuthRatingOnlyId,
    },
    {
      actor: "authenticated stranger",
      relation: "another user's authenticated",
      client: stranger,
      feedbackId: fixtures.feedbackAuthId,
    },
    {
      actor: "authenticated stranger",
      relation: "another user's authenticated rating-only",
      client: stranger,
      feedbackId: fixtures.feedbackAuthRatingOnlyId,
    },
  ] as const;

  const contactIsolationCases = [
    {
      actor: "anon",
      relation: "anonymous",
      client: anonymous,
      contactId: fixtures.contactAnonId,
    },
    {
      actor: "authenticated submitter",
      relation: "own authenticated",
      client: authenticated,
      contactId: fixtures.contactAuthId,
    },
    {
      actor: "authenticated stranger",
      relation: "another user's authenticated",
      client: stranger,
      contactId: fixtures.contactAuthId,
    },
  ] as const;

  for (const { actor, relation, client, feedbackId } of feedbackIsolationCases) {
    await expectDeniedOrZero(
      `${actor} cannot read ${relation} feedback`,
      client.from("customer_feedback").select("id").eq("id", feedbackId),
    );
    await expectDeniedOrZero(
      `${actor} cannot update ${relation} feedback review state`,
      client
        .from("customer_feedback")
        .update({
          reviewed_at: new Date().toISOString(),
          admin_notes: `${marker}:unauthorized-${compactLabel(actor)}-feedback-review`,
        })
        .eq("id", feedbackId)
        .select("id"),
    );
    await expectDeniedOrZero(
      `${actor} cannot delete ${relation} feedback`,
      client.from("customer_feedback").delete().eq("id", feedbackId).select("id"),
    );
  }

  for (const { actor, relation, client, contactId } of contactIsolationCases) {
    await expectDeniedOrZero(
      `${actor} cannot read ${relation} contact message`,
      client.from("contact_messages").select("id").eq("id", contactId),
    );
    await expectDeniedOrZero(
      `${actor} cannot update ${relation} contact review state`,
      client
        .from("contact_messages")
        .update({
          reviewed_at: new Date().toISOString(),
          admin_notes: `${marker}:unauthorized-${compactLabel(actor)}-contact-review`,
        })
        .eq("id", contactId)
        .select("id"),
    );
    await expectDeniedOrZero(
      `${actor} cannot delete ${relation} contact message`,
      client.from("contact_messages").delete().eq("id", contactId).select("id"),
    );
  }

  await assertIsolationPostconditions(fixtures, authenticatedUserId);
}

function operatorReviewNote(form: "feedback" | "contact", origin: string): string {
  return `${marker}:operator-${form}-${compactLabel(origin)}-note`;
}

async function assertOperatorReviewedPostconditions(
  fixtures: AllowedFixtures,
  operatorUserId: string,
  reviewedAt: string,
): Promise<void> {
  const [{ data: feedbackRows, error: feedbackError }, { data: contactRows, error: contactError }] =
    await Promise.all([
      admin
        .from("customer_feedback")
        .select(
          "id,user_id,overall_rating,ai_doctor_rating,sensors_rating,quicklog_rating,trust_rating,whats_working,whats_friction,one_improvement,grow_context,contact_email,follow_up_ok,user_agent,reviewed_at,reviewed_by,admin_notes",
        )
        .in("id", [
          fixtures.feedbackAnonId,
          fixtures.feedbackAuthId,
          fixtures.feedbackAuthRatingOnlyId,
        ]),
      admin
        .from("contact_messages")
        .select("id,user_id,message,attachment_path,reviewed_at,reviewed_by,admin_notes")
        .in("id", [fixtures.contactAnonId, fixtures.contactAuthId]),
    ]);

  const feedbackAnon = feedbackRows?.find((row) => row.id === fixtures.feedbackAnonId);
  const feedbackAuth = feedbackRows?.find((row) => row.id === fixtures.feedbackAuthId);
  const feedbackAuthRatingOnly = feedbackRows?.find(
    (row) => row.id === fixtures.feedbackAuthRatingOnlyId,
  );
  const contactAnon = contactRows?.find((row) => row.id === fixtures.contactAnonId);
  const contactAuth = contactRows?.find((row) => row.id === fixtures.contactAuthId);

  check(
    "service verification confirms anonymous and authenticated feedback reviews",
    !feedbackError &&
      feedbackRows?.length === 3 &&
      feedbackAnon?.user_id === null &&
      feedbackAnon?.whats_working === fixtures.feedbackOriginalWorking &&
      isSameInstant(feedbackAnon?.reviewed_at, reviewedAt) &&
      feedbackAnon?.reviewed_by === operatorUserId &&
      feedbackAnon?.admin_notes === operatorReviewNote("feedback", "anonymous") &&
      feedbackAuth?.user_id === fixtures.authenticatedUserId &&
      feedbackAuth?.one_improvement === fixtures.feedbackAuthOriginalImprovement &&
      isSameInstant(feedbackAuth?.reviewed_at, reviewedAt) &&
      feedbackAuth?.reviewed_by === operatorUserId &&
      feedbackAuth?.admin_notes === operatorReviewNote("feedback", "authenticated") &&
      feedbackAuthRatingOnly?.user_id === fixtures.authenticatedUserId &&
      feedbackAuthRatingOnly?.overall_rating === RATING_ONLY_OVERALL_RATING &&
      feedbackAuthRatingOnly?.ai_doctor_rating === null &&
      feedbackAuthRatingOnly?.sensors_rating === null &&
      feedbackAuthRatingOnly?.quicklog_rating === null &&
      feedbackAuthRatingOnly?.trust_rating === null &&
      feedbackAuthRatingOnly?.whats_working === null &&
      feedbackAuthRatingOnly?.whats_friction === null &&
      feedbackAuthRatingOnly?.one_improvement === null &&
      feedbackAuthRatingOnly?.grow_context === null &&
      feedbackAuthRatingOnly?.contact_email === null &&
      feedbackAuthRatingOnly?.follow_up_ok === false &&
      feedbackAuthRatingOnly?.user_agent === null &&
      isSameInstant(feedbackAuthRatingOnly?.reviewed_at, reviewedAt) &&
      feedbackAuthRatingOnly?.reviewed_by === operatorUserId &&
      feedbackAuthRatingOnly?.admin_notes ===
        operatorReviewNote("feedback", "authenticated rating-only"),
    safeError(feedbackError),
  );
  check(
    "service verification confirms anonymous and authenticated contact reviews",
    !contactError &&
      contactRows?.length === 2 &&
      contactAnon?.user_id === null &&
      contactAnon?.message === fixtures.contactOriginalMessage &&
      contactAnon?.attachment_path === null &&
      isSameInstant(contactAnon?.reviewed_at, reviewedAt) &&
      contactAnon?.reviewed_by === operatorUserId &&
      contactAnon?.admin_notes === operatorReviewNote("contact", "anonymous") &&
      contactAuth?.user_id === fixtures.authenticatedUserId &&
      contactAuth?.message === fixtures.contactAuthOriginalMessage &&
      contactAuth?.attachment_path === null &&
      isSameInstant(contactAuth?.reviewed_at, reviewedAt) &&
      contactAuth?.reviewed_by === operatorUserId &&
      contactAuth?.admin_notes === operatorReviewNote("contact", "authenticated"),
    safeError(contactError),
  );
}

async function assertOperatorMarkNewPostconditions(fixtures: AllowedFixtures): Promise<void> {
  const [{ data: feedbackRows, error: feedbackError }, { data: contactRows, error: contactError }] =
    await Promise.all([
      admin
        .from("customer_feedback")
        .select(
          "id,user_id,overall_rating,ai_doctor_rating,sensors_rating,quicklog_rating,trust_rating,whats_working,whats_friction,one_improvement,grow_context,contact_email,follow_up_ok,user_agent,reviewed_at,reviewed_by,admin_notes",
        )
        .in("id", [
          fixtures.feedbackAnonId,
          fixtures.feedbackAuthId,
          fixtures.feedbackAuthRatingOnlyId,
        ]),
      admin
        .from("contact_messages")
        .select("id,user_id,message,attachment_path,reviewed_at,reviewed_by,admin_notes")
        .in("id", [fixtures.contactAnonId, fixtures.contactAuthId]),
    ]);

  const feedbackAnon = feedbackRows?.find((row) => row.id === fixtures.feedbackAnonId);
  const feedbackAuth = feedbackRows?.find((row) => row.id === fixtures.feedbackAuthId);
  const feedbackAuthRatingOnly = feedbackRows?.find(
    (row) => row.id === fixtures.feedbackAuthRatingOnlyId,
  );
  const contactAnon = contactRows?.find((row) => row.id === fixtures.contactAnonId);
  const contactAuth = contactRows?.find((row) => row.id === fixtures.contactAuthId);

  check(
    "service verification confirms anonymous and authenticated feedback mark-new states",
    !feedbackError &&
      feedbackRows?.length === 3 &&
      feedbackAnon?.user_id === null &&
      feedbackAnon?.whats_working === fixtures.feedbackOriginalWorking &&
      feedbackAnon?.reviewed_at === null &&
      feedbackAnon?.reviewed_by === null &&
      feedbackAnon?.admin_notes === operatorReviewNote("feedback", "anonymous") &&
      feedbackAuth?.user_id === fixtures.authenticatedUserId &&
      feedbackAuth?.one_improvement === fixtures.feedbackAuthOriginalImprovement &&
      feedbackAuth?.reviewed_at === null &&
      feedbackAuth?.reviewed_by === null &&
      feedbackAuth?.admin_notes === operatorReviewNote("feedback", "authenticated") &&
      feedbackAuthRatingOnly?.user_id === fixtures.authenticatedUserId &&
      feedbackAuthRatingOnly?.overall_rating === RATING_ONLY_OVERALL_RATING &&
      feedbackAuthRatingOnly?.ai_doctor_rating === null &&
      feedbackAuthRatingOnly?.sensors_rating === null &&
      feedbackAuthRatingOnly?.quicklog_rating === null &&
      feedbackAuthRatingOnly?.trust_rating === null &&
      feedbackAuthRatingOnly?.whats_working === null &&
      feedbackAuthRatingOnly?.whats_friction === null &&
      feedbackAuthRatingOnly?.one_improvement === null &&
      feedbackAuthRatingOnly?.grow_context === null &&
      feedbackAuthRatingOnly?.contact_email === null &&
      feedbackAuthRatingOnly?.follow_up_ok === false &&
      feedbackAuthRatingOnly?.user_agent === null &&
      feedbackAuthRatingOnly?.reviewed_at === null &&
      feedbackAuthRatingOnly?.reviewed_by === null &&
      feedbackAuthRatingOnly?.admin_notes ===
        operatorReviewNote("feedback", "authenticated rating-only"),
    safeError(feedbackError),
  );
  check(
    "service verification confirms anonymous and authenticated contact mark-new states",
    !contactError &&
      contactRows?.length === 2 &&
      contactAnon?.user_id === null &&
      contactAnon?.message === fixtures.contactOriginalMessage &&
      contactAnon?.attachment_path === null &&
      contactAnon?.reviewed_at === null &&
      contactAnon?.reviewed_by === null &&
      contactAnon?.admin_notes === operatorReviewNote("contact", "anonymous") &&
      contactAuth?.user_id === fixtures.authenticatedUserId &&
      contactAuth?.message === fixtures.contactAuthOriginalMessage &&
      contactAuth?.attachment_path === null &&
      contactAuth?.reviewed_at === null &&
      contactAuth?.reviewed_by === null &&
      contactAuth?.admin_notes === operatorReviewNote("contact", "authenticated"),
    safeError(contactError),
  );
}

async function assertOperatorWorkflow(
  operator: SupabaseClient,
  operatorUserId: string,
  fixtures: AllowedFixtures,
): Promise<void> {
  console.log("→ operator read and narrow review workflow");

  const operatorFeedbackCases = [
    { origin: "anonymous", id: fixtures.feedbackAnonId },
    { origin: "authenticated", id: fixtures.feedbackAuthId },
    { origin: "authenticated rating-only", id: fixtures.feedbackAuthRatingOnlyId },
  ] as const;
  const operatorContactCases = [
    { origin: "anonymous", id: fixtures.contactAnonId },
    { origin: "authenticated", id: fixtures.contactAuthId },
  ] as const;

  const { data: feedbackRead, error: feedbackReadError } = await operator
    .from("customer_feedback")
    .select("id")
    .in(
      "id",
      operatorFeedbackCases.map(({ id }) => id),
    );
  check(
    "operator can read anonymous and authenticated feedback",
    !feedbackReadError && feedbackRead?.length === operatorFeedbackCases.length,
    safeError(feedbackReadError),
  );

  const { data: contactRead, error: contactReadError } = await operator
    .from("contact_messages")
    .select("id")
    .in(
      "id",
      operatorContactCases.map(({ id }) => id),
    );
  check(
    "operator can read anonymous and authenticated contact messages",
    !contactReadError && contactRead?.length === operatorContactCases.length,
    safeError(contactReadError),
  );

  const reviewedAt = new Date().toISOString();
  for (const { origin, id } of operatorFeedbackCases) {
    const feedbackNote = operatorReviewNote("feedback", origin);
    const { data, error } = await operator
      .from("customer_feedback")
      .update({
        reviewed_at: reviewedAt,
        reviewed_by: operatorUserId,
        admin_notes: feedbackNote,
      })
      .eq("id", id)
      .select("id,reviewed_at,reviewed_by,admin_notes");
    check(
      `operator can review ${origin} feedback`,
      !error &&
        data?.length === 1 &&
        data[0]?.reviewed_by === operatorUserId &&
        data[0]?.admin_notes === feedbackNote &&
        isSameInstant(data[0]?.reviewed_at, reviewedAt),
      safeError(error),
    );
  }

  for (const { origin, id } of operatorContactCases) {
    const contactNote = operatorReviewNote("contact", origin);
    const { data, error } = await operator
      .from("contact_messages")
      .update({
        reviewed_at: reviewedAt,
        reviewed_by: operatorUserId,
        admin_notes: contactNote,
      })
      .eq("id", id)
      .select("id,reviewed_at,reviewed_by,admin_notes");
    check(
      `operator can review ${origin} contact message`,
      !error &&
        data?.length === 1 &&
        data[0]?.reviewed_by === operatorUserId &&
        data[0]?.admin_notes === contactNote &&
        isSameInstant(data[0]?.reviewed_at, reviewedAt),
      safeError(error),
    );
  }

  for (const { origin, id } of operatorFeedbackCases) {
    await expectDeniedOrZero(
      `operator cannot alter ${origin} original feedback content`,
      operator
        .from("customer_feedback")
        .update({ whats_working: `${marker}:forged-${compactLabel(origin)}-feedback-content` })
        .eq("id", id)
        .select("id"),
    );
    await expectDeniedOrZero(
      `operator cannot delete ${origin} feedback`,
      operator.from("customer_feedback").delete().eq("id", id).select("id"),
    );
  }
  for (const { origin, id } of operatorContactCases) {
    await expectDeniedOrZero(
      `operator cannot alter ${origin} original contact content`,
      operator
        .from("contact_messages")
        .update({ message: `${marker}:forged-${compactLabel(origin)}-contact-content` })
        .eq("id", id)
        .select("id"),
    );
    await expectDeniedOrZero(
      `operator cannot delete ${origin} contact message`,
      operator.from("contact_messages").delete().eq("id", id).select("id"),
    );
  }

  await assertOperatorReviewedPostconditions(fixtures, operatorUserId, reviewedAt);

  for (const { origin, id } of operatorFeedbackCases) {
    const { data, error } = await operator
      .from("customer_feedback")
      .update({ reviewed_at: null, reviewed_by: null })
      .eq("id", id)
      .select("id,reviewed_at,reviewed_by");
    check(
      `operator can return ${origin} feedback to new`,
      !error &&
        data?.length === 1 &&
        data[0]?.reviewed_at === null &&
        data[0]?.reviewed_by === null,
      safeError(error),
    );
  }

  for (const { origin, id } of operatorContactCases) {
    const { data, error } = await operator
      .from("contact_messages")
      .update({ reviewed_at: null, reviewed_by: null })
      .eq("id", id)
      .select("id,reviewed_at,reviewed_by");
    check(
      `operator can return ${origin} contact message to new`,
      !error &&
        data?.length === 1 &&
        data[0]?.reviewed_at === null &&
        data[0]?.reviewed_by === null,
      safeError(error),
    );
  }

  await assertOperatorMarkNewPostconditions(fixtures);
}

async function main(): Promise<void> {
  console.log("→ creating disposable authenticated and operator clients");
  const submitter = await createUser("submitter");
  const stranger = await createUser("stranger");
  const operator = await createUser("operator");

  const { error: roleError } = await admin
    .from("user_roles")
    .insert({ user_id: operator.id, role: "operator" });
  if (roleError) {
    throw new Error(`grant synthetic operator failed: ${safeError(roleError)}`);
  }

  const submitterClient = await signedInClient(submitter);
  const strangerClient = await signedInClient(stranger);
  const operatorClient = await signedInClient(operator);

  const fixtures = await assertAllowedInserts(submitterClient, submitter.id);
  await assertServerOwnedColumnsRejected(submitterClient, submitter.id, stranger.id);
  await assertPayloadBoundaries(submitterClient);
  await assertReadMutationIsolation(submitterClient, strangerClient, submitter.id, fixtures);
  await assertOperatorWorkflow(operatorClient, operator.id, fixtures);
}

async function cleanupStep(
  label: string,
  operation: () => Promise<{ error: unknown }>,
  cleanupErrors: string[],
): Promise<void> {
  try {
    const { error } = await operation();
    if (error) cleanupErrors.push(`${label}: ${safeError(error)}`);
  } catch (error) {
    cleanupErrors.push(`${label}: ${safeError(error)}`);
  }
}

async function teardown(): Promise<string[]> {
  const cleanupErrors: string[] = [];

  // delete support rows
  await cleanupStep(
    "delete support rows: feedback marker",
    async () => {
      const { error } = await admin
        .from("customer_feedback")
        .delete()
        .like("one_improvement", `${marker}%`);
      return { error };
    },
    cleanupErrors,
  );
  await cleanupStep(
    "delete support rows: feedback email",
    async () => {
      const { error } = await admin
        .from("customer_feedback")
        .delete()
        .like("contact_email", `%${runId}%`);
      return { error };
    },
    cleanupErrors,
  );
  await cleanupStep(
    "delete support rows: contact marker",
    async () => {
      const { error } = await admin.from("contact_messages").delete().like("message", `${marker}%`);
      return { error };
    },
    cleanupErrors,
  );
  await cleanupStep(
    "delete support rows: contact email",
    async () => {
      const { error } = await admin.from("contact_messages").delete().like("email", `%${runId}%`);
      return { error };
    },
    cleanupErrors,
  );
  if (createdUserIds.length > 0) {
    await cleanupStep(
      "delete support rows: feedback users",
      async () => {
        const { error } = await admin
          .from("customer_feedback")
          .delete()
          .in("user_id", createdUserIds);
        return { error };
      },
      cleanupErrors,
    );
    await cleanupStep(
      "delete support rows: contact users",
      async () => {
        const { error } = await admin
          .from("contact_messages")
          .delete()
          .in("user_id", createdUserIds);
        return { error };
      },
      cleanupErrors,
    );
  }

  // delete user_roles
  if (createdUserIds.length > 0) {
    await cleanupStep(
      "delete user_roles",
      async () => {
        const { error } = await admin.from("user_roles").delete().in("user_id", createdUserIds);
        return { error };
      },
      cleanupErrors,
    );
  }

  // delete profiles
  if (createdUserIds.length > 0) {
    await cleanupStep(
      "delete profiles",
      async () => {
        const { error } = await admin.from("profiles").delete().in("user_id", createdUserIds);
        return { error };
      },
      cleanupErrors,
    );
  }

  // delete auth user
  for (const userId of createdUserIds) {
    await cleanupStep(
      "delete auth user",
      async () => {
        const { error } = await admin.auth.admin.deleteUser(userId);
        return { error };
      },
      cleanupErrors,
    );
  }

  return cleanupErrors;
}

async function appendZeroCountProblem(
  label: string,
  query: PromiseLike<{ count: number | null; error: unknown }>,
  problems: string[],
): Promise<void> {
  try {
    const { count, error } = await query;
    if (error) {
      problems.push(`${label}: ${safeError(error)}`);
    } else if (count === null) {
      problems.push(`${label}: null count`);
    } else if (count > 0) {
      problems.push(`${label}: leftover=${count}`);
    }
  } catch (error) {
    problems.push(`${label}: ${safeError(error)}`);
  }
}

async function verifyTeardown(): Promise<string[]> {
  const problems: string[] = [];

  await appendZeroCountProblem(
    "feedback marker cleanup verification",
    admin
      .from("customer_feedback")
      .select("id", { count: "exact", head: true })
      .like("one_improvement", `${marker}%`),
    problems,
  );
  await appendZeroCountProblem(
    "feedback email cleanup verification",
    admin
      .from("customer_feedback")
      .select("id", { count: "exact", head: true })
      .like("contact_email", `%${runId}%`),
    problems,
  );
  await appendZeroCountProblem(
    "contact marker cleanup verification",
    admin
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .like("message", `${marker}%`),
    problems,
  );
  await appendZeroCountProblem(
    "contact email cleanup verification",
    admin
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .like("email", `%${runId}%`),
    problems,
  );

  if (createdUserIds.length > 0) {
    await appendZeroCountProblem(
      "feedback user cleanup verification",
      admin
        .from("customer_feedback")
        .select("id", { count: "exact", head: true })
        .in("user_id", createdUserIds),
      problems,
    );
    await appendZeroCountProblem(
      "contact user cleanup verification",
      admin
        .from("contact_messages")
        .select("id", { count: "exact", head: true })
        .in("user_id", createdUserIds),
      problems,
    );
    await appendZeroCountProblem(
      "user_roles cleanup verification",
      admin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .in("user_id", createdUserIds),
      problems,
    );
    await appendZeroCountProblem(
      "profiles cleanup verification",
      admin
        .from("profiles")
        .select("user_id", { count: "exact", head: true })
        .in("user_id", createdUserIds),
      problems,
    );
  }

  for (const [index, userId] of createdUserIds.entries()) {
    try {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (data?.user) {
        problems.push(`auth user ${index + 1} still exists`);
      } else if (error && error.status !== 404 && !/not[\s_-]*found/i.test(error.message ?? "")) {
        problems.push(`auth user ${index + 1} cleanup verification: ${safeError(error)}`);
      }
    } catch (error) {
      problems.push(`auth user ${index + 1} cleanup verification: ${safeError(error)}`);
    }
  }

  return problems;
}

await main()
  .catch((error) => {
    failed += 1;
    console.error(`[support-forms] harness error: ${safeError(error)}`);
  })
  .finally(async () => {
    const teardownProblems: string[] = [];
    try {
      teardownProblems.push(...(await teardown()));
    } catch (error) {
      teardownProblems.push(`teardown execution: ${safeError(error)}`);
    }
    try {
      teardownProblems.push(...(await verifyTeardown()));
    } catch (error) {
      teardownProblems.push(`teardown verification execution: ${safeError(error)}`);
    }

    if (teardownProblems.length > 0) {
      failed += 1;
      console.error(`[support-forms] teardown failed: ${teardownProblems.join("; ")}`);
    }

    console.log(`\nsupport forms RLS harness: ${passed} passed, ${failed} failed`);
    process.exitCode = failed === 0 ? 0 : 1;
  });
