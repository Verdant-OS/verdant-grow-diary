# Verdant BuildOps Kit

**Version:** BuildOps Kit v0.1

A documentation + fixtures + template package that keeps Verdant work scoped, safe, test-backed, and aligned with the One-Tent Loop.

This kit changes **no app behavior by itself**. It is read-context for humans and for tools like Lovable / Replit.

## Purpose

- Lock in canonical product context, data-labeling rules, and safety rules.
- Provide reusable Lovable prompt scaffolds and a task template.
- Provide demo and negative fixtures that follow a single contract.
- Give every change a pass/fail QA regression checklist.

## File map

- `/docs/glossary.md` — Canonical terms.
- `/docs/data-labeling-spec.md` — The five states: demo, manual, live, stale, invalid.
- `/docs/fixture-schema-contract.md` — Required fixture JSON shape.
- `/docs/verdant-product-context.md` — Identity, mission, principles.
- `/docs/one-tent-loop.md` — End-to-end operating loop.
- `/docs/sensor-truth-rules.md` — How sensor readings must be treated.
- `/docs/ai-doctor-output-contract.md` — 8 required AI Doctor output fields.
- `/docs/action-queue-safety-rules.md` — Approval-required architecture.
- `/docs/lovable-prompt-bank.md` — Reusable prompt scaffolds.
- `/docs/qa-regression-checklist.md` — Pre-publish checklist.
- `/fixtures/demo-grow-one-tent.json` — One-tent demo fixture.
- `/fixtures/bad-sensor-data-examples.json` — Negative sensor examples.
- `/fixtures/demo-ai-doctor-cases.json` — AI Doctor fixture cases.
- `/templates/lovable-task-template.md` — Reusable task template.
- `/docs/buildops-kit/README.md` — This file.

## Read order

1. `/docs/glossary.md`
2. `/docs/data-labeling-spec.md`
3. `/docs/fixture-schema-contract.md`
4. `/docs/verdant-product-context.md`
5. `/docs/one-tent-loop.md`
6. `/docs/sensor-truth-rules.md`
7. `/docs/ai-doctor-output-contract.md`
8. `/docs/action-queue-safety-rules.md`
9. `/docs/lovable-prompt-bank.md`
10. `/docs/qa-regression-checklist.md`
11. `/fixtures/demo-grow-one-tent.json`
12. `/fixtures/bad-sensor-data-examples.json`
13. `/fixtures/demo-ai-doctor-cases.json`
14. `/templates/lovable-task-template.md`

## How Lovable / Replit should use this kit

1. Start every new task by loading `/templates/lovable-task-template.md`.
2. Fill the template using the relevant scaffold from `/docs/lovable-prompt-bank.md`.
3. Always load `/docs/glossary.md`, `/docs/verdant-product-context.md`, and `/docs/data-labeling-spec.md` as base context.
4. Before publishing, run `/docs/qa-regression-checklist.md` and return the result.
5. Fixtures are read-only inputs to demos and tests. They are not seeds for live tables.

## Hard safety rules

- No fake live data. Use the five states: demo, manual, live, stale, invalid.
- No blind automation. AI suggests; the grower approves.
- No device control. Verdant runs a read-only, no-write, no-control architecture for advisory surfaces.
- No Next Door Cannabis branding or references. Verdant is standalone.
- No executable hardware commands, relay payloads, or auto-execute language.
- No production data seeding from this kit.
- No fixture data inserted into live app tables.
- No secrets, tokens, API keys, or real customer data in any file.

## Note

This kit is documentation + fixtures only. It changes no app behavior. Any code, schema, or UI change must be its own scoped task using `/templates/lovable-task-template.md`.
