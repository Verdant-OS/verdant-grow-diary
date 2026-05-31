# Lovable Prompt Bank

Reusable prompt scaffolds for Verdant work. Every scaffold enforces scope, safety, tests, and a safety verdict.

Each prompt must include these sections:

- **Scope**
- **Out of scope**
- **Files to load**
- **Tests required**
- **Validation required**
- **Safety verdict required**

---

## 1. Docs-only task

```
MISSION
<one sentence>

SCOPE
- Documentation only.
- No app/source/schema/UI changes.

OUT OF SCOPE
- App components.
- Schemas, migrations, RLS.
- Edge Functions.
- Fixtures (unless explicitly named).

FILES TO LOAD
- /docs/glossary.md
- /docs/verdant-product-context.md
- <any other doc directly relevant>

TESTS REQUIRED
- None (docs-only). Confirm no app files changed.

VALIDATION REQUIRED
- Static safety scan: no Next Door Cannabis strings, no "zero liability",
  no executable device language, no service_role.
- Link resolution for any cross-references added.

SAFETY VERDICT REQUIRED
- Return Safe / Risky / Incomplete / Stop-ship with reasoning.
```

---

## 2. Presentation-only task (UI tweak, no behavior change)

```
MISSION
<one sentence>

SCOPE
- Presentation / view-model only.

OUT OF SCOPE
- Schema, RLS, writes.
- New data fetching.
- Automation, device control, sensor ingest.

FILES TO LOAD
- <target component(s)>
- <related rule/view-model file(s)>
- /docs/data-labeling-spec.md (if labels touched)

TESTS REQUIRED
- Vitest render tests for changed presenter.
- Snapshot of data-state badges if labels touched.

VALIDATION REQUIRED
- bunx vitest run — report exact pass count.
- Confirm no fake live data, no demo-as-live.

SAFETY VERDICT REQUIRED
- Safe / Risky / Stop-ship.
```

---

## 3. Pure helper task (logic in src/lib)

```
MISSION
<one sentence>

SCOPE
- Pure helper in src/lib. No I/O.

OUT OF SCOPE
- React components, hooks, fetchers.
- Schema, RLS, writes.

FILES TO LOAD
- <target lib file>
- <test file>
- /docs/glossary.md

TESTS REQUIRED
- Happy path.
- Edge cases (null, NaN, empty, invalid).
- Determinism (injected clock if time-dependent).
- Regression coverage.

VALIDATION REQUIRED
- bunx vitest run on the test file + full suite.
- Report exact pass count.

SAFETY VERDICT REQUIRED
- Confirm: no writes, no service_role, no automation, no device control.
```

---

## 4. Safety regression task

```
MISSION
Add a guardrail test that prevents <regression>.

SCOPE
- New / updated test file only.

OUT OF SCOPE
- Behavior changes.

FILES TO LOAD
- <test directory>
- /docs/data-labeling-spec.md
- /docs/action-queue-safety-rules.md
- /docs/ai-doctor-output-contract.md

TESTS REQUIRED
- The new guardrail test fails before the fix and passes after — or
  passes today and locks in the current contract.

VALIDATION REQUIRED
- bunx vitest run — exact pass count.
- Static safety scan unchanged.

SAFETY VERDICT REQUIRED
- Safe / Stop-ship.
```

---

## 5. Fixture update task

```
MISSION
Update / add fixture <name>.

SCOPE
- Files under /fixtures only.

OUT OF SCOPE
- Schema, RLS, writes.
- Inserting fixture data into live tables.

FILES TO LOAD
- /docs/fixture-schema-contract.md
- /docs/data-labeling-spec.md
- <target fixture file>

TESTS REQUIRED
- A schema-shape test that every reading has the 11 required fields.
- A label test that demo fixtures are 100% state="demo".

VALIDATION REQUIRED
- bunx vitest run — exact pass count.
- Confirm no secrets, no real customer data, no executable payloads.

SAFETY VERDICT REQUIRED
- Safe / Stop-ship.
```
