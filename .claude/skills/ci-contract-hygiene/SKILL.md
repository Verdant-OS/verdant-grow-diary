---
name: ci-contract-hygiene
description: >
  Avoid primary-CI red from route-manifest order, static source-contract tests,
  leaf-component hooks, and Prettier-fragile copy matchers. Use when adding
  routes, changing CreateTent/CreatePlant dialogs, wiring useGrows/useNavigate
  into leaf components, editing empty-state copy, or diagnosing route-manifest /
  static test CI failures (PR #630 class).
---

# ci-contract-hygiene

Lessons codified from PR #630 (`fix/create-bind-active-grow` → main). Lint and
typecheck can be green while **primary CI still fails** on static contracts.

Trigger words: route manifest, sorted path, static source test, create dialog,
`useGrows`, `useNavigate`, copy matcher, Prettier flake, Route manifest + Alerts
quick-link drift.

---

## 1. Route manifest — sort or primary CI dies early

**Gate:** step _Route manifest + Alerts quick-link drift_ in the primary
`Lint, typecheck, test, build` job (also pheno-comparison-v0).

**Rule:** every new path in [`src/lib/appRouteManifest.ts`](../../../src/lib/appRouteManifest.ts)
must land in **ascending path order**. Same length + wrong order still fails:

```text
expected [ '*', '/', '/action-queue', …(N) ] to deeply equal [ … ]
```

**Do this in the same commit as the route:**

1. Add the route entry in sorted position (not “near related routes”).
2. Register the page in `App.tsx` if needed.
3. Run:

```bash
bunx vitest run src/test/route-manifest-sync.test.ts
```

**Example (PR #630):** `/start-room` belonged after `/signup`, not after
`/onboarding`.

---

## 2. Static source tests own create-dialog shape

Static tests `readFileSync` production sources and regex-match implementation
shape. They are **first-class consumers** of CreateTent / CreatePlant (and
similar) wiring — not optional docs.

When you change create-dialog behavior (binding, hard-stop, payload keys, empty
copy), **update every static consumer in the same commit**:

| Area                       | Typical files                                                                                                                                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create binding / hard-stop | `src/test/create-dialog-grow-binding-guard.test.ts`, `src/test/create-dialog-grow-hard-stop-rules.test.ts`, `src/test/plants-tents-create-grow-preselect.test.ts`, `src/test/plantMergeDialogGrowContextFallback.test.ts`, `src/test/quick-create-shortcuts.test.ts`, `src/test/first-run-creation-simplification.test.ts` |
| Route + page preselect     | `src/test/plants-tents-create-grow-preselect.test.ts`                                                                                                                                                                                                                                                                      |
| Pheno / grow context       | other `readFileSync` wiring tests under `src/test/*`                                                                                                                                                                                                                                                                       |

**Anti-pattern:** ship product fail-closed / active-grow fallback, leave matchers
expecting tent-derived `payload.grow_id = selectedTent.grow_id` or bare
`if (defaultGrowId) payload.grow_id = defaultGrowId`.

**Do:**

```bash
# After any Create*Dialog or Plants/Tents create wiring change:
bunx vitest run \
  src/test/create-dialog-grow-binding-guard.test.ts \
  src/test/create-dialog-grow-hard-stop-rules.test.ts \
  src/test/plants-tents-create-grow-preselect.test.ts \
  src/test/plantMergeDialogGrowContextFallback.test.ts \
  src/test/quick-create-shortcuts.test.ts \
  src/test/first-run-creation-simplification.test.ts
```

Prefer pure rules modules + tests of pure functions when possible; keep static
wiring tests for the thin JSX glue only.

---

## 3. New hooks in leaf components break shallow unit tests

Adding `useGrows()`, `useNavigate()`, or other provider-backed hooks to a
**leaf** component (e.g. `PlantQuickLog`) will crash suites that render without
providers/Router:

```text
TypeError: Cannot read properties of undefined (reading 'length')  # useGrows
Error: useNavigate() may be used only in the context of a <Router>  # useNavigate
```

**Prefer (in order):**

1. **No router dependency for optional actions** — e.g. toast “View timeline”
   uses `window.location.assign(href)` instead of `useNavigate`.
2. **Guard optional store methods** before calling:

```ts
if (growId && typeof setActiveGrowId === "function") {
  setActiveGrowId(growId);
}
```

3. **Mock the hook** in the affected test file when the dependency is required.
4. Only wrap the whole suite in `MemoryRouter` + store providers when the
   behavior under test _is_ routing/store integration.

**Do not** assume “other tests mock auth so they mock grows.” New hooks need
new doubles or guards in the **same commit**.

---

## 4. Copy matchers — use `\s+` so Prettier cannot flake them

Static tests that pin user-facing strings often break when Prettier wraps a
line:

```text
// Source (two lines):
//   Verdant works best
//   once your first plant memory exists.

// Fragile:
/Verdant works best once your first plant memory exists\./

// Robust:
/Verdant works best\s+once your first\s+plant memory exists\./
```

Rules:

- Between words that may wrap: prefer `\s+` over a single space.
- For optional wording, prefer explicit optional groups, e.g.
  `/No tents yet(?: in this grow)?\. Create a tent first\./`.
- For multi-line JSX props, allow whitespace inside call sites:
  `environmentMetricChipStatus\(\s*classifyTempAgainstStage\(`.

---

## Pre-push checklist (agent)

When the change set touches routes, create dialogs, grow binding, or leaf
hooks:

```bash
bunx vitest run src/test/route-manifest-sync.test.ts
# plus the create-dialog / wiring tests listed above when those files change
bun run typecheck   # or package script equivalent
```

If primary CI fails only on _Route manifest + Alerts quick-link drift_, fix
sort order first — later steps are skipped and will look “green by omission.”

---

## Related

- Route list: `src/lib/appRouteManifest.ts`
- Sync test: `src/test/route-manifest-sync.test.ts`
- Run skill: `.claude/skills/run-verdant-grow-diary/SKILL.md`
- Shard map: `docs/testing/ci-full-suite-shards.md`
- Static guards overview: `docs/testing/static-guards.md`
