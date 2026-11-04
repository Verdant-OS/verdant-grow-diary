### CHEM-CORE-SCHEMA-001

```text
TASK CHEM-CORE-SCHEMA-001  priority: publish-gate  status: CLOSED
goal: Stop the retired non-production core-schema probe running automatically on deploy pushes.
branch: codex/chem-score-core-ci-20260928
base: verdant-grow-diary
checkout: git fetch origin codex/chem-score-core-ci-20260928 verdant-grow-diary && git switch codex/chem-score-core-ci-20260928 && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/1778
head_sha: 4e6710b9872e4c75cb478ea342f083796a561c7a
state: #1778 merged through the protected queue at 2026-09-28 20:44:18 CT as 674eb480e5e5c2b55c18dd7ac823f088c5e0b424, from head 4e6710b9872e4c75cb478ea342f083796a561c7a. GitHub and deploy Git agree. Local 167 PASS / 0 FAIL / 0 SKIP; 35 required contexts passed before queue. Optional dependency failures remain visible. No independent author PASS or production acceptance claim.
next_action: CLOSED for this scoped CI scheduling repair. Release acceptance and locked dependency repairs remain in their separate OPEN tasks; no remote database probe dispatched.
files: .github/workflows/required-core-migrations.yml; src/test/required-core-migrations-gate.test.ts
blockers: No remaining integration blocker for this landed slice. Root fast-uri and nested undici repairs remain locked in their own tasks; no production dispatch.
artifacts: https://github.com/Verdant-OS/verdant-grow-diary/pull/1778; Copilot DEFAULT_SCHEMA concern measured against installed js-yaml 4.3.2: YAML on remains the string key on. No parser change needed.
reviewer_seat: Critical Mass (explicit reviewer of the named CI-only slice)
claimed_by: Codex, 2026-09-28 18:46 CT
last_updated: 2026-09-28 21:13 CT, by Codex
```
