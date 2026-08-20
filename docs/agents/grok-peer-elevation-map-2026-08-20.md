# Grok peer-elevation map (2026-08-20)

**Slice:** docs-only governance. Not an One-Tent product fix.
**Approval:** Cheek (Matthew), in session 2026-08-20 — elevate Grok as a peer to
Codex and Claude for implementation, audit, and review.
**Base:** `verdant-grow-diary` (production deploy branch).

This note is the required pre-edit map of Grok ownership/role references and
Sentinel parity rules. Authority changes land in the role/handoff files listed
under "Edits in this slice"; ownership and collision fences stay intact.

---

## Sentinel parity (twelve pinned files)

`scripts/check-sentinel-version-parity.mjs` pins exactly these twelve files
(canonical + eleven mirrors). All must share one `Sentinel-Version`. Editing any
pinned file's non-version content requires a version bump across **all twelve**
in the same commit. `docs/agents/CURRENT_STATE.md` is **exempt** (no
`Sentinel-Version`; existence-only).

| # | Path | Pre-slice Grok relevance |
| - | ---- | ------------------------ |
| 1 | `AGENTS.md` | Agent Role Routing loads `roles/grok.md`; Multi-Agent Coordination listed Codex/Claude/Lovable only |
| 2 | `GEMINI.md` | Embeds full `AGENTS.md` between `SENTINEL-CORE` markers (must stay byte-equivalent) |
| 3 | `CLAUDE.md` | Claude bootstrap; no Grok mission text (version-parity only unless content changes) |
| 4 | `.grok/rules/verdant-grok-role.md` | Auto-loaded Grok rules: research-only; "Do not write application code" |
| 5 | `docs/agents/README.md` | Layout + load table for Grok |
| 6 | `docs/agents/HANDOFF_PROTOCOL.md` | Sequential order: Grok = research only → Claude → Codex |
| 7 | `docs/agents/roles/grok.md` | Full mission: Search/Market/Backlink; "do not write production code" unless Cheek authorizes |
| 8 | `docs/agents/roles/claude.md` | Mentions Grok section structure; default non-primary coder |
| 9 | `docs/agents/roles/codex.md` | Default implementer; others implement only when Cheek reassigns |
| 10 | `docs/agents/roles/security.md` | No Grok mission text (parity bump only) |
| 11 | `docs/agents/roles/gemini.md` | No Grok mission text (parity bump only) |
| 12 | `docs/agents/roles/council-chair.md` | Conflict note: Grok demand evidence vs Claude architecture |

Helper: `scripts/sync-sentinel-mirror.mjs` (`--set-version=…` + GEMINI re-embed).
Pre-slice version across the set: `2026-08-09.3`.

---

## Operating-state and workflow references (not in the twelve)

| Path | Pre-slice Grok signal |
| ---- | --------------------- |
| `docs/agents/CURRENT_STATE.md` | Agents table: Grok on `ONE_TENT_LOOP_OPERATING_ORDER` + Cursor SDK spike; "Not Unassigned". DIRTY-PR note still said "Grok remains Unassigned" (stale vs table). Tranche A = Codex; Tranche B+ = Claude |
| `docs/agents/CURRENT_STATE_ARCHIVE.md` | Historical Grok update attributions — leave as archive |
| `docs/agents/cheek-approval-workflow.md` | Default pipeline diagram: Grok = Research only |
| `docs/lovable/verdant-project-knowledge-*.md` | Snapshot packs; not rewritten in this slice |
| `docs/specs/convex-component-physical-sandbox-spike.md` | "Grok stays the Search/Market lead and does not implement this spike" — historical spike contract; not rewritten here |
| `docs/specs/one-tent-loop-quicklog-single-write-path.md` | Author attribution to Grok — historical |
| Other `docs/**` Grok author/disposition notes | Historical evidence only |

---

## Collision / ownership fences that do **not** change

- Parked PRs **#828**, **#817**, **#696** — no competing Timeline / Alerts /
  Action Queue UI rewrite.
- **Tranche A** edit points and remaining A2–A5 work: **Codex**.
- **Tranche B+** product code: **Claude** (architect + implementer for B+ only).
- Action Queue transition/RLS production repair: **Codex**.
- Parallel implementation of the same slice remains a protocol failure.
- Grok does **not** take Claude's or Codex's assigned slices unless
  `CURRENT_STATE` already marks that slice done and unassigned (or Cheek
  reassigns).

---

## Authority that **does** change (this slice)

- Grok gains **equal** authority with Claude and Codex for **implementation,
  audit, and review** when `CURRENT_STATE` / Cheek assigns a slice.
- Research / market / backlink mission is **retained**, not deleted.
- Default research → architecture → build sequence remains the preferred
  handoff path; it no longer means Grok is research-only by constitution.

---

## Edits in this slice (docs-only)

Pinned governance files as needed for peer language + `Sentinel-Version`
bump; `CURRENT_STATE.md` assignment/approval record; this map; optional
`cheek-approval-workflow.md` peer note. No `src/`, no `supabase/migrations/`,
no product-behavior workflows.
