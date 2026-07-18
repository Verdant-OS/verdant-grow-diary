# Lighthouse CI — LCP + SEO regression guard

Protects the published Verdant surface (`https://verdantgrowdiary.com`) from
performance and SEO regressions, specifically the LCP finding fixed on
2026-07-18.

## What it checks

- **LCP** ≤ 2500ms (Core Web Vitals "good") — **error** (fails the run)
- **CLS** ≤ 0.1 — warn
- **TBT** ≤ 300ms — warn
- **SEO score** ≥ 0.9 — error
- **Performance score** ≥ 0.8 — warn
- **Accessibility score** ≥ 0.9 — warn

URLs are read from `public/sitemap.xml` (33 canonical routes) at run time.
No second source of truth to drift.

Each URL is audited 3× and the median is used, to smooth cold-cache noise.

## Running locally (Windows, pre-publish)

```bash
bun run lighthouse           # full sitemap (~5–10 min)
bun run lighthouse -- --home # home page only, fast smoke
```

Exits non-zero on any error-level assertion failure.

Report URL is printed at the end (temporary public storage).

## Running in GitHub Actions

`.github/workflows/lighthouse-ci.yml` is **opt-in**:

- `workflow_dispatch` — trigger manually from the Actions tab.
- Nightly cron at 08:00 UTC.

The workflow is not wired to PRs by design — Verdant publishes locally, so
CI runs are informational, not gating. Enable PR triggers only after
confirming budget stability over a few nightly runs.

## Adjusting the budget

Edit `lighthouserc.cjs`. Keep LCP tighter than the CWV threshold only if
recent runs consistently clear the new bar — false positives erode trust
in the gate.

## What this does NOT do

- Does not run against localhost/preview builds (published only).
- Does not audit auth-gated routes (they're not in the sitemap).
- Does not replace targeted regression tests — it's a coarse safety net.
