# Verdant Docs Index

This directory holds Verdant's internal product, engineering, and operator
documentation. Most documents are written for the team and partners — not for
public marketing. Treat anything here as internal unless explicitly published
elsewhere.

## Demo scripts

Short, founder/operator-led scripts that demonstrate a real Verdant flow using
labeled evidence rather than hype.

- **[One-Tent Evidence Chain Demo Script v1](./one-tent-evidence-chain-demo-script-v1.md)** —
  Founder/operator demo path showing source-labeled sensor data flowing into
  alerts, evidence badges, Action Queue review, and the Post-Grow Learning
  Report.

### Demo doc safety

Demo scripts are scanned for unsafe automation / certainty / device-control
language. Banned phrases (e.g. "fully automated", "AI grows for you",
"guaranteed yield") may appear **only** inside the fenced Do-Not-Say block:

```
<!-- DEMO-SCRIPT-DO-NOT-SAY:BEGIN -->
...
<!-- DEMO-SCRIPT-DO-NOT-SAY:END -->
```

The safety check lives at `src/test/one-tent-demo-docs-safety.test.ts` and runs
with the standard vitest suite.
