
# Content Ideas Report — Cannabis Cultivation

## Deliverable
A single artifact pair written to `/mnt/documents/`:
- `verdant-content-ideas.md` (source of truth, easy to edit)
- `verdant-content-ideas.pdf` (rendered, QA'd via page-image inspection)

No app code, no schema, no route, no Action Queue, no protected file touched. Verdant repo stays clean.

## Research inputs (Semrush + light competitor read)
Anchor competitor: **app.pulsegrow.com** (grower's chosen reference; grow-room environment/sensor niche — same category as Verdant).

Semrush calls I will run before writing outlines:
1. `domain_analysis` — app.pulsegrow.com (US) — authority, top themes.
2. `top_pages` — app.pulsegrow.com — which content actually pulls traffic.
3. `competitive_analysis` — verdantgrowdiary.com vs auto-discovered + pulsegrow — keyword gaps.
4. `keyword_research` on 3-4 seed clusters already validated in prior turns:
   - "how to grow weed" (5,400/mo, KD 46)
   - "growing marijuana indoors" (720/mo, KD 29)
   - "how to care for a cannabis plant" (210/mo)
   - "cannabis vpd" / "grow room humidity" (env/sensor angle — Pulse's turf)
5. `keyword_compare` on the finalists to pick the 6 outlines with the best volume × difficulty × Verdant-fit.

If a Semrush call returns nothing usable, I note it in the report rather than fabricate numbers.

## Report structure (per grower's request: Title + H2s + H3s + intent + internal-link hooks)
Front matter:
- Method + data provenance (Semrush US database, date, competitor scope)
- Cluster map: 3-4 themes → article slots
- Honest caveats (Semrush = Google organic top-100 only; small-site KD calibration; no promise of traffic)

Then **6 article briefs**, each:
- **Title** (SEO + human)
- **Primary keyword** + volume + KD + why it fits Verdant
- **Search intent** (informational / comparison / troubleshooting / how-to)
- **H2 outline with H3s** under each
- **Internal-link hooks** — anchor phrase → target Verdant surface (Quick Log, AI Doctor, Sensor Snapshot, Pheno Hunt, Action Queue). Anchors only; no URL fabrication.
- **What NOT to include** (bro-science, one-photo diagnosis certainty, aggressive autoflower recovery — per Verdant cultivation rules)
- **Next-step CTA** (soft, product-honest)

Planned theme slots (final list depends on Semrush results):
1. **Env/sensor truth** — e.g. "VPD for cannabis: the honest guide" (Pulse's strongest turf; Verdant's differentiator = sensor provenance labeling).
2. **Beginner how-to** — "How to grow weed indoors: a first-tent plan" (highest-volume cluster).
3. **Troubleshooting/diagnosis** — "Reading a cannabis leaf: what one photo can and can't tell you" (leans into cautious-AI positioning).
4. **Plant care rhythm** — "Cannabis plant care week by week" (question-cluster driven).
5. **Pheno hunting** — "Pheno hunt without guessing: what to log, when to cull" (Verdant-native angle, low competition).
6. **Autoflower-specific** — "Autoflower care done gently" (guardrails against high-stress advice baked into the brief).

## Rendering
- Write markdown first.
- Render PDF via reportlab Platypus with DejaVu Sans (registered) to survive any accented copy.
- `pdftoppm` every page to JPG at 150dpi, view each, fix overflow/clipping/black-box glyphs, re-render until clean.
- Emit `<presentation-artifact>` tags for both files.

## Explicit non-goals (per project fences)
- No `/content-ideas` route, no page component, no edge function.
- No Semrush connector wiring — using built-in read-only Semrush tools only.
- No AI Doctor call, no Action Queue write, no schema, no RLS, no migration, no auth change.
- No touching PR #227/#228, the candidate-number slice, timeline/report/CSV/PDF app code, or Playwright/E2E.
- No claims about traffic. Numbers are Semrush estimates, labeled as such.
- No links to real Verdant URLs I haven't verified — internal-link hooks are anchor+target-surface only.

## Output the grower gets back
- Both artifact tags (md + pdf)
- The 9-section report format applied to the *task itself*: Summary / Requirements / Files (artifacts only, no repo files) / Implementation notes (Semrush calls made + which returned data) / Tests (n/a — artifact) / Validation (page-image QA log) / Safety verdict / Deferred / Risk & rollback (delete files from `/mnt/documents`).
