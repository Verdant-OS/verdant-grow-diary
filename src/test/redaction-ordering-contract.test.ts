/**
 * Shared redaction ORDERING contract.
 *
 * Three separate PRs fixed the same defect in three different sanitizers:
 * #1185 (`ecowittLocalForwardingStatus`), #1184 (`ecowittValidationEvidenceRules`),
 * and #1187 (`postGrowReportRules`). Each module had a rule that would have
 * removed the whole credential assignment, and each ran that rule too late —
 * an earlier rule destroyed the part the later rule matched on, and the VALUE
 * survived into a user-visible surface.
 *
 * Two mechanisms, both observed live:
 *
 *   1. FRAGMENTING — a bare-word label rule (`/PASSKEY/gi`) rewrites the label
 *      wherever it appears, INCLUDING inside a variable NAME. Run first,
 *      `MY_PASSKEY_VAR="s"` becomes `MY_[REDACTED]_VAR="s"`; the assignment
 *      rule no longer matches and the value is left behind.
 *   2. CONSUMING — a header rule (`/Bearer\s+\S+/`) swallows a whole following
 *      token, NAME included. Run first, `Bearer MY_VAR="s"` becomes
 *      `[REDACTED]="s"`. This one needs NO credential label in the NAME at all.
 *
 * Per-module unit tests could not catch this class, because each module was
 * only ever tested against the BARE assignment, which every module redacted
 * correctly. The defect only appears once the assignment is DECORATED.
 *
 * THE INVARIANT PINNED HERE — decoration must never reduce redaction:
 *
 *     if redact(X) does not contain the secret,
 *     then redact(PREFIX + X) must not contain the secret either.
 *
 * This is deliberately NOT a coverage test. Whether a given module redacts a
 * given shape at all is that module's own decision, and the modules genuinely
 * differ (see COVERAGE_BASELINE below). Each case CALIBRATES against the
 * module's own undecorated behaviour first: a shape the module does not
 * redact bare is out of that module's scope, and its decorated forms are not
 * asserted. What is forbidden is a module that handles a shape bare and then
 * leaks it decorated — that is always an ordering bug, never a design choice.
 *
 * Per AGENTS.md ("contract tests must assert against resolved values, not
 * source text") this is behavioural throughout: it imports the real entry
 * points and calls them. It never reads or pattern-matches a source file, so
 * it cannot be fooled by a commented-out or reordered pattern array — the
 * exact failure mode it exists to catch.
 */
import { describe, expect, it } from "vitest";

import { sanitizeReportText, sanitizeReportValue } from "@/lib/ecowittLocalForwardingStatus";
import { redactEvidenceValue } from "@/lib/ecowittValidationEvidenceRules";
import { redactSecrets } from "@/lib/postGrowReportRules";
import { sanitizeProofReportMarkdown } from "@/lib/proofReportRedactionRules";

/**
 * Canary secret. Chosen so that NO module can redact it on its own shape:
 * not hex (so the long-hex and MAC rules cannot fire), not a JWT, no `vbt_` /
 * `sk-` / `sk_live_` prefix, not a UUID, not an ISO timestamp, and containing
 * no credential keyword. If this string survives, it survived because the
 * ASSIGNMENT around it was not removed — which is what these tests measure.
 * A value-shaped canary would pass for the wrong reason.
 */
const SECRET = "zz-canopy-note-77";

/**
 * The five redaction entry points that guard a copy/print/export surface.
 *
 * Each adapter returns a string that is searched for the canary. Object-
 * returning entry points are serialized, so a secret surviving anywhere in
 * the structure still counts as a leak.
 */
interface RedactorUnderContract {
  readonly name: string;
  readonly redact: (text: string) => string;
}

const REDACTORS: readonly RedactorUnderContract[] = [
  {
    name: "sanitizeReportText",
    redact: (text) => sanitizeReportText(text),
  },
  {
    name: "sanitizeReportValue",
    // Deep object sanitizer. `note` is not in its FORBIDDEN_KEYS set, so the
    // string reaches the pattern pass on its merits rather than being blanked
    // by key name — which would make every case pass vacuously.
    redact: (text) => JSON.stringify(sanitizeReportValue({ note: text })),
  },
  {
    name: "redactEvidenceValue",
    // MUST go through the object path. Handed a BARE string this function
    // returns "[redacted]" wholesale for every input, benign ones included, so
    // a bare-string probe reports no leak no matter how broken the patterns
    // are. That false negative hid the #1184 defect during a first pass of the
    // audit. `note` matches none of its SECRETY_KEY_PATTERNS.
    redact: (text) => JSON.stringify(redactEvidenceValue({ note: text })),
  },
  {
    name: "redactSecrets",
    redact: (text) => redactSecrets(text),
  },
  {
    name: "sanitizeProofReportMarkdown",
    redact: (text) => sanitizeProofReportMarkdown(text),
  },
];

/**
 * Variable NAMEs. `SOME_PLAIN_NAME` carries no credential label on purpose:
 * the CONSUMING mechanism does not need one, and a label-only matrix would
 * have missed it.
 */
const LABELS = [
  "PASSKEY",
  "API_KEY",
  "BRIDGE_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SOME_PLAIN_NAME",
] as const;

/** Assignment shapes. Each is its own calibration unit. */
const SHAPES = [
  { id: "bareQuoted", build: (label: string) => `${label}="${SECRET}"` },
  { id: "bareUnquoted", build: (label: string) => `${label}=${SECRET}` },
  // The FRAGMENTING shape: label embedded inside a longer NAME.
  { id: "embeddedName", build: (label: string) => `MY_${label}_VAR="${SECRET}"` },
] as const;

/**
 * Where the assignment sits. Real reports embed these in prose rather than
 * emitting them alone, and an anchored rule would pass standalone and fail
 * in prose.
 */
const CONTEXTS = [
  { id: "standalone", wrap: (body: string) => body },
  {
    id: "inProse",
    wrap: (body: string) => `listener env dump: ${body} (captured during validation)`,
  },
] as const;

/**
 * The CONSUMING hazard vocabulary: prefixes drawn from the modules' own
 * header rules, which is precisely what makes them dangerous — each of these
 * is a token some rule in some module wants to swallow along with whatever
 * follows it.
 */
const HAZARD_PREFIXES = [
  { id: "bearer", apply: (body: string) => `Bearer ${body}` },
  { id: "bearerLower", apply: (body: string) => `bearer ${body}` },
  { id: "authorizationHeader", apply: (body: string) => `Authorization: ${body}` },
  { id: "authorizationLower", apply: (body: string) => `authorization: ${body}` },
  { id: "authorizationBearer", apply: (body: string) => `Authorization: Bearer ${body}` },
] as const;

type Coverage = Record<string, Record<string, boolean>>;

/**
 * Which (module, label, shape) pairs redact the UNDECORATED assignment.
 *
 * This is the calibration the ordering assertions key off, pinned so that a
 * change in either direction is loud instead of silently widening or
 * narrowing what the ordering tests examine. Without this pin a coverage
 * regression would quietly switch cases off rather than fail.
 *
 * Measured, not asserted from intent. The two `false` groups are coverage
 * decisions belonging to those modules, NOT ordering bugs — in both, no rule
 * destroys anything; the module simply has no rule that matches the shape:
 *
 *   - redactSecrets / SOME_PLAIN_NAME — deliberate. This helper renders a
 *     user-facing grow report and promises to preserve prose, and grow
 *     telemetry shares the uppercase `NAME=value` shape, so it requires a
 *     credential label in the NAME rather than using a generic
 *     `[A-Z][A-Z0-9_]{2,}=` rule. `VPD=1.2` and `EC=1.8` surviving is pinned
 *     by post-grow-report-pdf-export.test.tsx ("preserves benign report
 *     content").
 *   - sanitizeProofReportMarkdown / embeddedName + SOME_PLAIN_NAME — its
 *     keyword rules are `\b`-anchored (`\bapi_key\b`), and `_` is a word
 *     character, so a label inside `MY_API_KEY_VAR` matches nothing. An
 *     UNMEASURED coverage gap in that module, recorded here rather than
 *     fixed: widening it is a separate, reviewed change.
 *
 * Adding coverage is welcome. Flip the entry in the same commit.
 */
const COVERAGE_BASELINE: Coverage = {
  sanitizeReportText: {
    "PASSKEY/bareQuoted": true,
    "PASSKEY/bareUnquoted": true,
    "PASSKEY/embeddedName": true,
    "API_KEY/bareQuoted": true,
    "API_KEY/bareUnquoted": true,
    "API_KEY/embeddedName": true,
    "BRIDGE_TOKEN/bareQuoted": true,
    "BRIDGE_TOKEN/bareUnquoted": true,
    "BRIDGE_TOKEN/embeddedName": true,
    "SUPABASE_SERVICE_ROLE_KEY/bareQuoted": true,
    "SUPABASE_SERVICE_ROLE_KEY/bareUnquoted": true,
    "SUPABASE_SERVICE_ROLE_KEY/embeddedName": true,
    "SOME_PLAIN_NAME/bareQuoted": true,
    "SOME_PLAIN_NAME/bareUnquoted": true,
    "SOME_PLAIN_NAME/embeddedName": true,
  },
  sanitizeReportValue: {
    "PASSKEY/bareQuoted": true,
    "PASSKEY/bareUnquoted": true,
    "PASSKEY/embeddedName": true,
    "API_KEY/bareQuoted": true,
    "API_KEY/bareUnquoted": true,
    "API_KEY/embeddedName": true,
    "BRIDGE_TOKEN/bareQuoted": true,
    "BRIDGE_TOKEN/bareUnquoted": true,
    "BRIDGE_TOKEN/embeddedName": true,
    "SUPABASE_SERVICE_ROLE_KEY/bareQuoted": true,
    "SUPABASE_SERVICE_ROLE_KEY/bareUnquoted": true,
    "SUPABASE_SERVICE_ROLE_KEY/embeddedName": true,
    "SOME_PLAIN_NAME/bareQuoted": true,
    "SOME_PLAIN_NAME/bareUnquoted": true,
    "SOME_PLAIN_NAME/embeddedName": true,
  },
  redactEvidenceValue: {
    "PASSKEY/bareQuoted": true,
    "PASSKEY/bareUnquoted": true,
    "PASSKEY/embeddedName": true,
    "API_KEY/bareQuoted": true,
    "API_KEY/bareUnquoted": true,
    "API_KEY/embeddedName": true,
    "BRIDGE_TOKEN/bareQuoted": true,
    "BRIDGE_TOKEN/bareUnquoted": true,
    "BRIDGE_TOKEN/embeddedName": true,
    "SUPABASE_SERVICE_ROLE_KEY/bareQuoted": true,
    "SUPABASE_SERVICE_ROLE_KEY/bareUnquoted": true,
    "SUPABASE_SERVICE_ROLE_KEY/embeddedName": true,
    "SOME_PLAIN_NAME/bareQuoted": true,
    "SOME_PLAIN_NAME/bareUnquoted": true,
    "SOME_PLAIN_NAME/embeddedName": true,
  },
  redactSecrets: {
    "PASSKEY/bareQuoted": true,
    "PASSKEY/bareUnquoted": true,
    "PASSKEY/embeddedName": true,
    "API_KEY/bareQuoted": true,
    "API_KEY/bareUnquoted": true,
    "API_KEY/embeddedName": true,
    "BRIDGE_TOKEN/bareQuoted": true,
    "BRIDGE_TOKEN/bareUnquoted": true,
    "BRIDGE_TOKEN/embeddedName": true,
    "SUPABASE_SERVICE_ROLE_KEY/bareQuoted": true,
    "SUPABASE_SERVICE_ROLE_KEY/bareUnquoted": true,
    "SUPABASE_SERVICE_ROLE_KEY/embeddedName": true,
    // Unlabelled NAME — deliberate non-coverage, see note above.
    "SOME_PLAIN_NAME/bareQuoted": false,
    "SOME_PLAIN_NAME/bareUnquoted": false,
    "SOME_PLAIN_NAME/embeddedName": false,
  },
  sanitizeProofReportMarkdown: {
    "PASSKEY/bareQuoted": true,
    "PASSKEY/bareUnquoted": true,
    // `\b`-anchored keyword rules cannot see a label inside a longer NAME.
    "PASSKEY/embeddedName": false,
    "API_KEY/bareQuoted": true,
    "API_KEY/bareUnquoted": true,
    "API_KEY/embeddedName": false,
    "BRIDGE_TOKEN/bareQuoted": true,
    "BRIDGE_TOKEN/bareUnquoted": true,
    "BRIDGE_TOKEN/embeddedName": false,
    "SUPABASE_SERVICE_ROLE_KEY/bareQuoted": true,
    "SUPABASE_SERVICE_ROLE_KEY/bareUnquoted": true,
    "SUPABASE_SERVICE_ROLE_KEY/embeddedName": false,
    "SOME_PLAIN_NAME/bareQuoted": false,
    "SOME_PLAIN_NAME/bareUnquoted": false,
    "SOME_PLAIN_NAME/embeddedName": false,
  },
};

function measureCoverage(): Coverage {
  const measured: Coverage = {};
  for (const redactor of REDACTORS) {
    const row: Record<string, boolean> = {};
    for (const label of LABELS) {
      for (const shape of SHAPES) {
        row[`${label}/${shape.id}`] = !redactor.redact(shape.build(label)).includes(SECRET);
      }
    }
    measured[redactor.name] = row;
  }
  return measured;
}

describe("redaction ordering contract — the canary cannot redact itself", () => {
  it.each(REDACTORS.map((r) => [r.name, r] as const))(
    "%s leaves a benign string containing the canary intact",
    (_name, redactor) => {
      // Guards the whole file: if a module redacted this string on its own
      // shape, every ordering assertion below would pass without proving
      // anything about assignment handling.
      expect(redactor.redact(`daily note ${SECRET} recorded`)).toContain(SECRET);
    },
  );
});

describe("redaction ordering contract — coverage calibration", () => {
  it("pins which undecorated assignment shapes each redactor handles", () => {
    // A change here is not necessarily a bug — but it must be a decision.
    // Update COVERAGE_BASELINE in the same commit as the behaviour change.
    expect(measureCoverage()).toEqual(COVERAGE_BASELINE);
  });
});

describe("redaction ordering contract — decoration must never reduce redaction", () => {
  for (const redactor of REDACTORS) {
    describe(redactor.name, () => {
      for (const label of LABELS) {
        for (const shape of SHAPES) {
          for (const context of CONTEXTS) {
            const covered = COVERAGE_BASELINE[redactor.name][`${label}/${shape.id}`];
            const title = `${label} / ${shape.id} / ${context.id}`;

            if (!covered) {
              // Out of this module's coverage, so INVARIANT 1 HAS NO PREMISE
              // here: there is no clean `redact(X)` for a prefix to erode.
              // Asserting redaction would be a coverage demand wearing an
              // ordering test's clothes.
              //
              // This is NOT a claim that the decorated form is safe. A
              // prefix-specific rule can fire on a shape nothing matches
              // bare, consume the NAME and strand the VALUE — that is
              // exactly the defect the "no partial redaction" block below
              // catches, which is why that block makes NO coverage judgment
              // and runs on every input, these skipped ones included.
              // Raised by Copilot on #1189: the original wording here
              // asserted the very reasoning that block exists to refute.
              it.skip(`${title} — not covered undecorated, ordering not applicable`, () => {});
              continue;
            }

            it(`${title} — stays redacted behind every hazard prefix`, () => {
              const body = shape.build(label);

              // Re-establish the premise at runtime rather than trusting the
              // pinned table, so this assertion is self-contained.
              expect(redactor.redact(context.wrap(body))).not.toContain(SECRET);

              for (const prefix of HAZARD_PREFIXES) {
                const decorated = context.wrap(prefix.apply(body));
                expect(
                  redactor.redact(decorated),
                  `${redactor.name} leaked the value of a ${shape.id} assignment behind the ` +
                    `"${prefix.id}" prefix. It redacts the same assignment undecorated, so a ` +
                    `rule for it exists and ran too late: an earlier rule consumed or ` +
                    `fragmented the NAME first. Move the whole-assignment rule ABOVE the ` +
                    `header and bare-word label rules. Input: ${decorated}`,
                ).not.toContain(SECRET);
              }
            });
          }
        }
      }
    });
  }
});

/**
 * Any placeholder any of these modules emits. They disagree on case
 * (`[REDACTED]` vs `[redacted]`), so match case-insensitively.
 */
const PLACEHOLDER = /\[redacted\]/i;

describe("redaction ordering contract — no partial redaction", () => {
  /**
   * The STRONGER invariant, and the one that actually catches this defect
   * class:
   *
   *     if redact(X) contains a placeholder,
   *     then redact(X) must NOT still contain the secret.
   *
   * A placeholder beside a surviving secret means a rule fired on the span
   * and destroyed only part of it. That is the signature of every instance
   * of this class, and it is strictly worse than no redaction at all: the
   * output LOOKS sanitized, so nothing prompts a reader to look closer.
   *
   * Unlike the ordering block above, this makes NO coverage judgment. It runs
   * on every input in the matrix, including the shapes COVERAGE_BASELINE
   * marks uncovered — because "the module does not redact this bare" does not
   * imply "no rule will mangle it decorated", which is exactly the assumption
   * that let a live leak through.
   *
   * Written after that assumption failed in practice. The ordering block
   * skipped `redactSecrets` / `SOME_PLAIN_NAME` as out of coverage, while on
   * the deploy branch `bearer SOME_PLAIN_NAME="s"` was being rewritten to
   * `[redacted]="s"` — a real leak the contract stayed silent on. Copilot and
   * Codex (P1) both caught it on #1187; the contract did not. This block is
   * the correction, and it fails on that input without needing to know
   * anything about the module's intended coverage.
   */
  for (const redactor of REDACTORS) {
    for (const label of LABELS) {
      it(`${redactor.name} — ${label}: never leaves a placeholder beside the secret`, () => {
        for (const shape of SHAPES) {
          for (const context of CONTEXTS) {
            const body = shape.build(label);
            const variants = [
              context.wrap(body),
              ...HAZARD_PREFIXES.map((p) => context.wrap(p.apply(body))),
            ];
            for (const input of variants) {
              const out = redactor.redact(input);
              if (!PLACEHOLDER.test(out)) continue;
              expect(
                out,
                `${redactor.name} produced a PARTIAL redaction: a placeholder is present, ` +
                  `so a rule fired on this span, but the secret survived it. Output that ` +
                  `looks sanitized and is not. Input: ${input} -> ${out}`,
              ).not.toContain(SECRET);
            }
          }
        }
      });
    }
  }
});

describe("redaction ordering contract — the three historical defects", () => {
  it("FRAGMENTING: label inside a NAME does not strand the value (#1185)", () => {
    // Was: `MY_[REDACTED]_VAR="…"` — the bare-word /PASSKEY/gi rule rewrote
    // the label inside the NAME before the assignment rule could match.
    expect(sanitizeReportText(`MY_PASSKEY_VAR="${SECRET}"`)).not.toContain(SECRET);
  });

  it("CONSUMING: an UNLABELLED name behind a header does not strand the value (#1185)", () => {
    // Was: `[REDACTED]="…"` — /Bearer\s+\S+/ swallowed the NAME. No
    // credential label is involved, which is why label-based tests missed it.
    expect(sanitizeReportText(`Bearer SOME_PLAIN_NAME="${SECRET}"`)).not.toContain(SECRET);
  });

  it("CONSUMING: header-prefixed assignment in evidence export (#1184)", () => {
    // Object path only — a bare-string probe of this function is a false
    // negative. See the adapter note on REDACTORS.
    const out = JSON.stringify(redactEvidenceValue({ note: `Authorization: PASSKEY="${SECRET}"` }));
    expect(out).not.toContain(SECRET);
  });

  it("CONSUMING: `bearer BridgeToken=…` in the post-grow report (#1187)", () => {
    // Was: `[redacted]=…` — the bearer rule consumed `BridgeToken`.
    expect(redactSecrets(`bearer BridgeToken=${SECRET}`)).not.toContain(SECRET);
  });
});
