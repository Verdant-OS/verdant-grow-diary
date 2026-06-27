# AI Doctor Output Safety Scanner

Test-only recursive safety scanner for AI Doctor diagnosis output.

## Purpose

Prevent certainty, automation, device-control, dosing, controller
write-back, and unsafe Action Queue wording from slipping into AI Doctor
results. The scanner enforces Verdant's safety contract: cautious AI,
approval-required Action Queue, hardware-neutral, no blind automation.

## Scope

- Test utility only — lives under `src/test/utils/`.
- **MUST NOT** be imported by `src/lib/*`, `src/components/*`,
  `src/pages/*`, `src/hooks/*`, or any Edge Function / runtime path.
- No model calls, no schema access, no Action Queue writes, no
  device-control side effects. Pure string walker.

## What it scans

- Every string in nested diagnosis output objects/arrays.
- Golden case outputs (`src/test/ai-doctor-golden-cases.test.ts`).
- Fake objects in scanner self-tests
  (`src/test/ai-doctor-output-safety-scanner.test.ts`).

Paths are reported as dotted JSON (e.g.
`result.action_queue_suggestion.reason`,
`result.what_not_to_do[1]`).

## Phrase categories

- **Certainty / overclaiming** — "guaranteed", "definitely",
  "confirmed diagnosis", `\bcertain\b`, `\balways\b`, etc.
- **Automation / execution** — "auto-execute", "send command",
  "trigger controller", "write-back".
- **Device control / setpoints / controller write-back** — "turn on
  fan", "set humidifier", "apply setpoint", "dim light".
- **Dosing / pesticide / treatment execution** — "dose nutrients",
  "raise EC", "flush now", "apply pesticide", "spray fungicide".

## Warning-framing exceptions

- `what_not_to_do` and `safety_notes` may contain warning-framed
  device-control or dosing terms.
- A warning must be **explicitly framed**, starting with one of:
  `do not`, `don't`, `never`, `avoid`.
- **Certainty phrases are never allowed**, even inside warning fields.
- `action_queue_suggestion.*` is held to the **strict** bar — no
  warning escape applies. Any matched phrase fails the scan.

## How to add a phrase

1. Add the phrase or regex to the appropriate list in
   `src/test/utils/aiDoctorOutputSafetyScanner.ts`.
2. Add or update a self-test in
   `src/test/ai-doctor-output-safety-scanner.test.ts`.
3. Run the scan-only script:
   `bun run test:ai-doctor-output-safety-scan`.
4. Run the full Phase 1 safety suite:
   `bun run test:ai-doctor-phase1`.

## Handling legitimate false positives

1. Prefer rewriting the AI Doctor output copy to safer wording.
2. Only widen the allowlist behavior when the phrase is **explicitly
   warning-framed** and located outside Action Queue suggestions.
3. **Never** allow executable Action Queue or device-control
   language — there is no allowlist for `action_queue_suggestion.*`.

## CI annotations

`formatUnsafePhraseGitHubAnnotations(findings, options?)` renders one
GitHub workflow `::error` annotation per finding:

```
::error file=<path>,line=<line>,title=AI Doctor unsafe phrase::Case <id> at <path> matched "<phrase>": <shortText>
```

- `line=` is omitted when no line is provided.
- Offending text is sanitized (newlines and stray `::` removed) and
  truncated. Full diagnosis JSON, secrets, and env values are never
  emitted.
- The grouped human-readable report from `formatUnsafePhraseReport` is
  still printed alongside the annotations for local debugging.

## Commands

- `bun run test:ai-doctor-output-safety-scan` — scanner self-tests +
  filtered golden-case safety assertions.
- `bun run test:ai-doctor-golden-cases` — golden suite +
  `node scripts/sensor-safety-check.mjs`.
- `bun run test:ai-doctor-phase1` — complete Phase 1 safety suite:
  engine, context compiler, core static-safety scan, scanner
  self-tests, golden cases, and `node scripts/sensor-safety-check.mjs`.
- `node scripts/sensor-safety-check.mjs` — sensor-source static safety
  scan (fake-live wording, service_role leaks, etc.).
