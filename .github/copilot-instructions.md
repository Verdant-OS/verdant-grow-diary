# Copilot code review instructions — Verdant Grow Diary

Copilot code review is an **advisory** reviewer on this repository. Its comments are
input for the human/agent Reviewer seat named in `docs/agents/OWNERSHIP.md`; they are
not an approval, do not count toward merge requirements, and never replace the
independent exact-head review. Do not approve or request changes; comment only.

Roots remains coordinator. Preserve reviewer assignments, contributor exclusions,
holds, draft status, merge stewardship, required checks, protected-file restrictions,
and production gates. Do not edit code, apply fixes, start coding-agent work, or
invoke MCP tools as part of review.

## What to report

Report only concrete findings tied to a specific file and line in the diff.
Read relevant surrounding code to verify the consequence:

- **Correctness**: logic errors, off-by-one, wrong null/undefined handling, broken
  control flow, incorrect types.
- **Security**: secrets or service-role keys in client code, trusting a
  client-supplied `user_id`, RLS or auth bypass, unsanitized input reaching SQL,
  storage, or edge functions.
- **Data integrity**: sensor readings relabeled as healthy or live when they are
  demo, manual, stale, or invalid; lost timezone, units, or provenance; migrations
  that edit a published file instead of adding a forward repair; silent writes to
  Action Queue items (nothing may auto-approve, auto-complete, or auto-cancel).
- **Regressions**: behavior that an existing test, contract, or documented rule in
  `AGENTS.md` protects and this change breaks.
- **Tests**: missing regression coverage for changed behavior, tests weakened or
  deleted to pass, tests that cannot fail. Explain the concrete untested failure.

## What not to report

- Style, naming, formatting, or preference comments.
- Speculative issues with no evidence.
- Duplicate findings already raised by CodeRabbit or another reviewer.
- Praise, summaries, or restating the PR description.

## Format

One comment per finding: file and line, what is wrong, a concrete trigger and
consequence, why it matters (cite the `AGENTS.md` section when one applies), and
the smallest fix. State plainly when you are inferring rather than observing.
Do not claim tests ran or live behavior was verified without evidence.
