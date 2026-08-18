# Release-Provenance Runbook

> Relocated verbatim on 2026-08-18 from `docs/agents/CURRENT_STATE.md`
> (section "Release-provenance runbook (added 2026-08-05)") under the approved
> Tranche 1 of `docs/specs/current-state-archival-slice.md`. Durable reference
> for identifying what production is running.

How to identify what production is running, even when a publish build had no
git context:

- **Read `/version.json`.** `commitSource` says where identity came from:
  `github-env` or `git` → `commit` is authoritative; `none` → `commit` is
  honestly `"unknown"` and identity lives in `treeHash` (the version string
  reads `<pkg>+<date>.t<hash12>`). `inherited` (if present) is the last
  repo-tracked stamp, explicitly `trusted: false` — lineage context, never
  identity. A null `treeHash` comes with `treeHashError` explaining why.
- **Resolve a treeHash to commits:** from any checkout with history,
  `node scripts/resolve-release-provenance.mjs --hash=<treeHash>`.
  Release tags created by `auto-tag-release` carry `Tree-Hash:` annotations
  (instant answer); the union scan then recomputes over recent commits
  (`--scan=N` caps it — the scan is slow on loaded Windows machines) and
  reports every content-identical commit **within the annotated tags plus the
  bounded scan window** — a partial-history answer, not exhaustive
  provenance. Candidates whose stamps predate the current hash algorithm are
  re-hashed by executing their own committed module, gated to ancestors of
  the protected release branch (`--trust-ref`) in a scrubbed environment —
  never code from arbitrary refs.
- **Canary practice:** periodically take a healthy stamp (`commitSource:
"git"` or `"github-env"` — both authoritative) and resolve its treeHash
  **pinned to its own recorded commit**:
  `node scripts/resolve-release-provenance.mjs --hash=<treeHash>
--ref=<stamped commit> --scan=1`. Only a NO_MATCH on that pinned scan
  indicates the publish pipeline mutated hashed inputs; an unpinned default
  scan can NO_MATCH merely because the commit fell outside the 30-commit
  window or the default remote ref is absent. First live run 2026-08-05
  22:06Z: PASS (exact match via tag annotation).
