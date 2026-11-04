# Impeccable `critique` trial: public landing and pricing (2026-11-04)

⚠️ DEGRADED: single-context (Assessment B skipped by policy: the detector binary, edit hook and
live overlay were not enabled, per `docs/agents/third-party-agent-skills.md` standing rule 2)

**Purpose.** A one-run, read-only trial of the `critique` procedure from
`pbakaus/impeccable` against the two public surfaces the Founder visual gate now points at.
The founder brief named "the Founder page"; `src/routes/founder.tsx` redirects `/founder` to
`/pricing` (Founder Lifetime retired, #2028), so the trial targets `/` and `/pricing`.
Acceptance for the trial: the procedure either produces at least one finding a Verdant
reviewer would act on, or the register records it as not worth adopting.

**Provenance.**

- Skill source: `pbakaus/impeccable` at `5af4319c4e7a7ee3e5e2b9fe899bcfb21c6190cb`
  (committed 2026-11-04T15:09:55Z), Apache-2.0. Only `skill/reference/critique.md` was read and
  applied by hand; no text from it is copied into this repository.
- Target: `https://verdantgrowdiary.com/` and `/pricing`, read-only, no sign-in, no writes.
  Live `/version.json` at the time of capture: commit
  `57ed5a2904d5d47c49958d839db1c5c1d8b9260b`, built 2026-11-04T21:21:06Z, `dirty: false`.
  The deploy-branch tip at the same time was `afc04fa36f3eca4afd550b0a8a60e2ed9df1063b`,
  so the live build trails the branch; nothing below is evidence about commits after
  `57ed5a29`.
- Viewport: 1158×869 desktop only. A 390px mobile pass was attempted; the browser window
  did not resize, so mobile is `NOT_MEASURED`.
- Mode (the procedure's own axis): Persuade. Heuristics 7 and 10 are scored `n/a` as the
  procedure allows for that mode; the maximum is therefore 32, not 40.

## Design Health Score (Assessment A only)

| #   | Heuristic                       | Score     | Key issue                                                                                           |
| --- | ------------------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| 1   | Visibility of system status     | 3         | Walkthrough step rail is clear; no loading or error state was exercised                             |
| 2   | Match system / real world       | 4         | Grower language throughout; source labels (live, manual, csv, demo, stale, invalid) named in copy   |
| 3   | User control and freedom        | 3         | "Back to home", FAQ accordions, step rail all work; no exit observed inside "Check my context"      |
| 4   | Consistency and standards       | 2         | Two display typefaces (hero geometric sans vs later serif-leaning display); tagline drifts (see P2) |
| 5   | Error prevention                | 3         | Demo banners prevent reading the walkthrough as live data                                           |
| 6   | Recognition rather than recall  | 3         | Every nav item labelled; pricing toggle labelled                                                    |
| 7   | Flexibility and efficiency      | n/a       | Persuade surface                                                                                    |
| 8   | Aesthetic and minimalist design | 2         | Long page: hero, walkthrough, 5-card grid, SEO blocks, FAQ, trust box, AI check, CTA, beta (see P1) |
| 9   | Error recovery                  | 3         | Not exercised; copy promises missing context stays visibly missing                                  |
| 10  | Help and documentation          | n/a       | Persuade surface                                                                                    |
|     | **Total**                       | **23/32** | **72%, Good**                                                                                       |

## Design specificity verdict

**Authored, not interchangeable, in the places that matter.** The walkthrough ("Follow one
decision through the full loop" with the "Illustrative product walkthrough. No account data is
loaded" banner), the trust box ("No fake live data / No blind automation / Approval-required
Action Queue") and the AI Doctor readiness check are specific to Verdant's promise and would
not survive a find-and-replace onto another product. Two regions are category-interchangeable:
the five feature cards (a 3+2 grid with an orphan card) and the mid-page SEO paragraphs.

**Deterministic scan:** skipped by policy; see banner. No detector counts exist for this run.

**Visual overlays:** not attempted.

## Overall impression

The hero does the one thing a Verdant landing has to do: it states the promise in grower
words and then says what the product will not do. The page then keeps going for roughly six
more screens, and the second half reads as written for a crawler rather than for the operator
who was convinced in the first half. The single biggest opportunity is cutting the middle.

## What's working

- The hero's two-line headline plus the "cannot touch your equipment" clause is the clearest
  statement of the read-only promise anywhere in the product.
- The walkthrough's step rail with a visible demo disclaimer is the right pattern for a
  product whose whole pitch is "no fake live data": it shows the loop without pretending.
- Pricing states the card-level facts a grower needs (grows, tents, credits, exports) as short
  nouns, and the Paddle line says who takes the payment before the buttons appear.

## Priority issues

- **[P1] Four competing first actions in the hero.** `Start Free`, `See Pro & Craft plans`,
  `Take the 60-second tour`, plus `Pricing` and `Sign in` in the header. A first-time grower
  has five choices at the first decision point; the procedure's own threshold is four.
  - Why it matters: a grower on a phone in the tent picks nothing.
  - Fix: one filled primary (`Start Free`), the tour as a text link under it, plans only in
    the header. Measure the change on the funnel events the page already emits.
- **[P1] Mid-page SEO blocks read as keyword copy.** "…growers using a grow room VPD tracker or
  grow tent monitoring app…", "Verdant is a cannabis plant tracker and grow room timeline…".
  - Why it matters: the hero earns trust by talking like an operator; these paragraphs spend
    it. They also push the FAQ and the trust box below the sixth screen.
  - Fix: move the long-tail copy to `/features` (already linked as "Explore Verdant features")
    or compress each block to one sentence. Keep the H2s if search needs them.
- **[P2] Tagline drift.** Hero: "Plant memory. Sensor truth. Grower-approved decisions."
  Pricing and `AGENTS.md` §3: "Plant memory. Sensor truth. Better decisions."
  - Fix: pin one string in `src/constants` and reuse it; a test can assert both pages read it.
- **[P2] Two display typefaces.** The hero headline and the `Grow diary app for serious
growers` / `Built so the grower stays the decision-maker.` headings use different display
  faces. If this is a token, one of the two is off-token; if it is intentional, the switch
  should happen at a section boundary the reader can see.
- **[P2] Orphan feature card.** Five cards in a two-column grid leaves one card alone with an
  empty slot beside it. Six cards, four cards, or a one-column list on this width.
- **[P3] Savings lines are easy to miss.** "~31% savings vs. monthly" sits in small muted text
  under the feature list rather than next to the price.

## Persona red flags

- **Jordan (first-timer):** hero gives five choices; the tour button and the walkthrough
  section below it look like two different tours. Will pick `Pricing` to understand the
  product, which is the wrong page for that.
- **Casey (one-handed, in the tent):** mobile `NOT_MEASURED`; on desktop every primary
  action is in the top half of its section, and the page is six-plus screens long.
- **Riley (stress tester):** the "Check my context" card promises "Nothing is uploaded";
  the trial did not open it, so the promise is unverified here (`NOT_MEASURED`).

## Minor observations

- Pricing shows Craft at 300 AI Doctor credits / month. `AGENTS.md` §7 names 100 credits per
  month for paid tiers and does not name Craft. This is a copy-versus-constitution question
  for the billing owner, not a design finding; recorded as `source claim`, not verified.
- Pricing's "Secure checkout by Paddle" line appears before the toggle has any effect; fine,
  but it is the only line on the page in a smaller type size than the feature lists.

## Questions to consider

- What would the landing look like if everything after the walkthrough were the trust box and
  one CTA?
- Does the 60-second tour button and the walkthrough section need to be two things?
- Which single sentence should every public page share, and where does it live in code?

## Trend

First run for this target; no trend. Nothing was persisted under `.impeccable/`; this trial
does not create that directory.

## Run notes

- Assessment independence: `NOT_APPLICABLE` (single-context by policy).
- CLI detector: `SKIPPED` (binary not enabled; standing rule 2).
- Browser visibility: `PASS` for desktop capture; overlay injection `SKIPPED`.
- Live server: none started. Temp files: none written.
- Mobile viewport: `NOT_MEASURED` (resize did not apply).

## Verdict on the trial itself

The procedure produced two P1 findings a Verdant reviewer would act on (hero decision load,
SEO copy placement) using only its design-review half. Its scoring rubric and persona pass
are usable by hand. Its detector, hook, telemetry and live mode were not evaluated and stay
out of scope. Recommendation for the register: **adapt the review rubric as a manual
procedure; do not install the package or enable any of its scripts.** The next step, if
wanted, is a separate task to run the detector once against `dist/` in an isolated fixture
with no credentials and compare its findings with this report.

## Questions for the founder (the procedure requires these at three or more priority issues)

1. **Priority direction.** Hero decision load, mid-page SEO copy, or the tagline/typeface
   consistency pair: which first? (Options: hero only; hero plus SEO blocks; all three.)
2. **SEO copy intent.** Were the long-tail paragraphs placed on `/` deliberately for search?
   (Options: yes, keep on `/` but shorten; move to `/features`; drop them.)
3. **Scope.** Address the two P1s only, or all five P1/P2 items in one slice?
   (Options: P1s only; P1 + P2; everything including P3.)
