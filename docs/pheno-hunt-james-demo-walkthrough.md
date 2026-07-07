# Pheno-Hunt — Demo Walkthrough (James)

A click-by-click script for demoing the live pheno-hunt feature. Follows the
breeder story, not the database depth.

**Positioning (repeat this):**

> Verdant does not rank or pick the phenotype. It preserves the evidence and
> makes weak comparisons obvious. The grower/breeder decides.

The four demo routes:

| Step | Route                        | Purpose                                                             |
| ---- | ---------------------------- | ------------------------------------------------------------------- |
| 1    | `/pheno-expression-showcase` | Show the expression vocabulary and range (fixture, no login)        |
| 2    | `/pheno-hunts/:id/compare`   | Honest side-by-side + missing-data flags                            |
| 3    | `/pheno-hunts/:id/workspace` | Staged scoring, smoke test, COA, sex/herm, append-only decision log |
| 4    | `/pheno-hunts/:id/keepers`   | Keeper naming, clone lineage, breeding crosses                      |

Do **not** open Dashboard, MCP, Agent Integrations, or build/test internals
unless asked.

---

## Before the call (5-min setup)

1. **Log in** as the demo account — the three `/pheno-hunts/:id/*` routes read
   _your own_ hunt via RLS.
2. Ensure a **pheno hunt exists with at least 3–4 candidate plants tagged**
   (plants with `pheno_hunt_id` set + a `candidate_label`). Copy the hunt **id**
   from the URL — reuse it in steps 2–4.
3. Choose how to run the live pages:
   - **Enter data live during the demo** (recommended — proves persistence), or
   - **Pre-seed once** by clicking through the workspace before the call.
4. `/pheno-expression-showcase` is **fixture-only and needs no login** — the
   safest opener.

**Open with the thesis (before sharing screen):**

> "James, this isn't Verdant picking winners. It organizes the evidence around
> phenotype selection so the grower makes a better call — what did the plant
> express, what evidence backs it, what's missing, and what should be preserved
> or culled, with a clear reason."

---

## Step 1 — Expression range · `/pheno-expression-showcase`

_Fixture data, no login._

**What loads:** a **Mix & match** picker (10 checkboxes) and, below it, 4 phenos
already compared side-by-side: **GMO Gas #1, Gelato Dessert #4, Tropic Punch #2,
Cherry Pheno #9**.

**Do, in order:**

1. **Point at GMO Gas #1's "Nose loudness" bar → 10/10 loud;** then Gelato's
   dessert nose, Tropic's fruit. _"Same vocabulary across every pheno — nose
   loudness 0–10, then structure, density, resin, stretch, yield."_
2. **Scroll to Cherry Pheno #9** — the red **"Hermaphrodite observed — consider
   removing"** callout with _"Verdant never removes a plant for you."_ _"It flags
   the herm and suggests — it never culls for you."_
3. **Point at Tropic Punch #2's amber missing-data flags** ("No post-cure smoke
   test yet"). _"Honest about what hasn't been recorded."_
4. **Tick "Purple Haze Pheno #8"** → an amber **apples-to-apples warning**
   appears (different tent). _"That pheno ran in a different tent, so Verdant
   warns the comparison isn't apples-to-apples."_
5. _(optional)_ Tick **Big Bud Yielder #7** → warning escalates to _different
   grows_. Untick both to reset.

**Line:** _"Verdant does not rank or pick the phenotype. It preserves the
evidence and makes weak comparisons obvious."_

---

## Step 2 — Honest comparison · `/pheno-hunts/:id/compare`

_Live, your real hunt._

**What loads:** a **Read-only preview** badge, a **live-hunt banner** ("your own
data, scoped to you"), the confidence caveat, and the **source legend**
(Live / Manual / CSV / Demo / Stale / Invalid).

**Do:**

1. Show the **side-by-side grid** of the hunt's real tagged candidates.
2. Point at **amber missing-context flags** (no photo / no sensor snapshot /
   no diary) and the **source chips** — _"demo/stale/invalid readings are never
   shown as healthy."_
3. If candidates span tents/grows, point at the **apples-to-apples warning**.

**Line:** _"This is read-only. It's the evidence board — no writing, no
automation, no picking."_

---

## Step 3 — Workspace decisions · `/pheno-hunts/:id/workspace`

_Live — where you enter data._

**What loads:** the suggest-only caveat, a **Scoring round** dropdown
(Overall · Veg · Early flower · Mid flower · Late flower · Post-cure), and a card
per candidate.

**Do on one candidate:**

1. **Score the loud axes** — Nose loudness (0–10) + Vigor/Structure/Density/
   Resin/Stretch/Yield (1–5).
2. **Switch the round dropdown to "Mid flower."** _"Same plant, scored again at
   each stage — the keeper is the one that wins across rounds."_ Note the extra
   **Aroma** + **Nose note** fields; add a couple aroma tags.
3. **Expand "Post-cure smoke test"** — flavor, effect, smoothness, potency
   (feel), verdict. _"The cured smoke test is the deciding gate — it can override
   great structure and even the COA."_
4. **Expand "Lab (COA)"** — Source = COA, THC/CBD + terpenes. _"Real lab numbers,
   tagged by source. We never fabricate a number — an estimate is marked as an
   estimate."_
5. **Set the Keeper decision** (Keep/Cull/Hold/Undecided) and **type a Reason.**
   Click **Save** → "Saved."
6. **Change the decision and Save again**, then expand **"Decision history"** —
   both entries with reasons + dates. _"Append-only audit trail — you can always
   defend why a plant was kept or cut."_
7. **Set Sex = Hermaphrodite** → the red **"Queue removal for approval"** callout
   appears; click it → _"Removal queued for approval."_ _"Even a herm cull is a
   suggestion that goes to your approval queue — Verdant still never removes the
   plant."_

**Line:** _"Every write here is your own note. Recording a decision changes
nothing on its own."_

---

## Step 4 — Keepers, clones & crosses · `/pheno-hunts/:id/keepers`

_Live — the breeding endgame._

**What loads:** the record-only caveat and a **Name a keeper** section.

**Do:**

1. **Name a keeper:** pick a candidate, type a name ("GMO Gas Keeper"), click
   **Name keeper.** It shows in the Keepers list with its **source candidate**
   (lineage).
2. **Add a clone:** in that keeper's card type a label ("mother"), click **Add
   clone.** _"Preserve the winner as living clones — take-a-clone-first, tracked."_
3. **Name a second keeper** ("Dessert Male") so two exist.
4. The **Record a cross** section appears: pick **♀ female × ♂ male**, name it
   ("GasCake F1"), click **Record cross.** It lists under **Crosses.** _"The hunt
   endgame — a keeper becomes a parent. Two-parent cross, both preserved
   phenotypes."_

**Line:** _"Verdant helps document expression, compare evidence honestly,
preserve decisions, and carry winning selections forward — without pretending
software replaces breeder judgment."_

---

## The full loop in one breath

> **Expression range → honest comparison → workspace decisions → keeper lineage
> & crosses.**

## Say

Organizes evidence · flags incomplete records · preserves selection history ·
suggests only approval-required actions · **the breeder decides.**

## Do not say / do not show

Avoid "selects / ranks / predicts the winner" and "automates culling." If asked
_"does it decide for me?"_ — the honest answer is the whole pitch: **no, and it's
enforced in code.** A suite of guardrail tests fails CI if anyone ever
introduces ranking, an auto-cull, a device write, or `service_role` on these
surfaces, or presents demo data as live.

---

## What's live behind the demo (only if he asks)

- **12 pheno tables**, all RLS user-scoped (`auth.uid() = user_id` + hunt/plant
  ownership + candidate consistency). Append-only tables (decision log, sex
  observations) grant SELECT + INSERT only.
- The **herm → cull** action is the single sanctioned Action Queue write — it
  inserts one `status = "pending_approval"` row and nothing else (isolated in a
  dedicated service + separately tested).
- Nothing auto-executes, nothing ranks or picks a phenotype, nothing fabricates
  a number. The `PHENO_COMPARISON_CAVEAT` ("Verdant does not pick a phenotype
  for you") is enforced by static-safety tests.
