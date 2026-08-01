# CI contract hygiene

Agent skill (canonical playbook): [`.claude/skills/ci-contract-hygiene/SKILL.md`](../../.claude/skills/ci-contract-hygiene/SKILL.md).

Codified after PR #630 (grow-binding loop). Summary:

1. **Route manifest** — new paths in `src/lib/appRouteManifest.ts` must be **path-sorted** or primary CI fails at _Route manifest + Alerts quick-link drift_.
2. **Static source tests** — create-dialog / page-wiring `readFileSync` tests are product consumers; update them in the **same commit** as behavior changes.
3. **Leaf hooks** — prefer no `useNavigate` for optional actions; guard `useGrows` methods; mock providers when required.
4. **Copy matchers** — use `\s+` (and optional groups) so Prettier line wraps do not flake static tests.

Run:

```bash
bunx vitest run src/test/route-manifest-sync.test.ts
```
