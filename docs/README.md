# Verdant Docs Index

This directory holds Verdant's internal product, engineering, and operator
documentation. Most documents are written for the team and partners — not for
public marketing. Treat anything here as internal unless explicitly published
elsewhere.

## V0 safety & One-Tent Loop doctrine

The core V0 doctrine pack. Start here before changing product behavior.

- **[Verdant V0 Product Spine](./verdant-v0-product-spine.md)** — what Verdant
  is, the V0 priority loop, build order, anti-feature-creep and safety rules.
- **[The One-Tent Loop](./one-tent-loop.md)** — every loop step with inputs,
  safety requirements, validation signals, failure modes, and the definition
  of done.
- **[Sensor Truth Rules](./sensor-truth-rules.md)** — source labels, stale /
  invalid / demo / csv handling, VPD and unit-sanity rules.
- **[AI Doctor Safety Contract](./ai-doctor-safety-contract.md)** — cautious,
  evidence-aware diagnosis doctrine, grounded in Golden Cases v1.
- **[Action Queue Safety Rules](./action-queue-safety-rules.md)** —
  approval-required suggestions, forbidden contents and language.
- **[EcoWitt Hardware Validation Runbook](./ecowitt-hardware-validation-runbook.md)** —
  operator-only physical home-LAN validation flow.
- **[V0 Release Validation Checklist](./v0-release-validation-checklist.md)** —
  per-PR safety and validation checklist.

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
