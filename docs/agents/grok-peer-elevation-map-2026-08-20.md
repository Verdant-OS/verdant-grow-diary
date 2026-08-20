# Grok peer-elevation map (2026-08-20)

**Slice:** docs-only governance. Not an One-Tent product fix.
**Approval:** Cheek (Matthew), in session 2026-08-20 — elevate Grok as a peer to
Codex and Claude. **Refined charter (same day):** title **Product Intelligence,
Adversarial Audit, and Implementation Lead**; five equal powers; **no role rank**;
explicit task ownership; one owner + independent reviewer per slice.
**Base:** `verdant-grow-diary` (production deploy branch). PR #1060.

This note is the required pre-edit map of Grok ownership/role references and
Sentinel parity rules, updated to the refined charter (not the earlier “peer
implementer + research lead” wording).

---

## Refined charter (authoritative for this slice)

| Item | Rule |
| ---- | ---- |
| Title | Product Intelligence, Adversarial Audit, and Implementation Lead |
| Five equal powers | research · live-app audit · implement assigned slices · test · independent review |
| Rank | Codex, Claude, and Grok retain different **default strengths**; **none outranks the others** |
| Control | **Explicit task ownership** — not role rank |
| Per slice | One **owner** + a **different** peer as **independent reviewer** (owner ≠ reviewer) |
| Research mission | Retained as a strength, **not** a constitutional fence |

---

## Sentinel parity (twelve pinned files)

`scripts/check-sentinel-version-parity.mjs` pins exactly these twelve files
(canonical + eleven mirrors). All must share one `Sentinel-Version`. Editing any
pinned file's non-version content requires a version bump across **all twelve**
in the same commit. `docs/agents/CURRENT_STATE.md` is **exempt** (no
`Sentinel-Version`; existence-only).

| # | Path | Relevance |
| - | ---- | --------- |
| 1 | `AGENTS.md` | Peer language; preferred path (not rank); one-owner + independent-reviewer |
| 2 | `GEMINI.md` | Embeds full `AGENTS.md` between `SENTINEL-CORE` markers |
| 3 | `CLAUDE.md` | Claude bootstrap; default strength ≠ exclusivity |
| 4 | `.grok/rules/verdant-grok-role.md` | Auto-loaded: new title + five powers |
| 5 | `docs/agents/README.md` | Layout + load table + Grok title |
| 6 | `docs/agents/HANDOFF_PROTOCOL.md` | Preferred path; owner + reviewer fields |
| 7 | `docs/agents/roles/grok.md` | Full refined charter |
| 8 | `docs/agents/roles/claude.md` | Peer language; no “primary coder” exclusivity |
| 9 | `docs/agents/roles/codex.md` | Build lead as **preference**, not exclusivity |
| 10 | `docs/agents/roles/security.md` | Parity bump |
| 11 | `docs/agents/roles/gemini.md` | Parity bump |
| 12 | `docs/agents/roles/council-chair.md` | No rank when weighing peer outputs |

Helper: `scripts/sync-sentinel-mirror.mjs`. This refined commit targets
`Sentinel-Version: 2026-08-20.2`.

---

## Operating-state and workflow references (not in the twelve)

| Path | Signal |
| ---- | ------ |
| `docs/agents/CURRENT_STATE.md` | Agents table + approval record for refined charter (edit assignment only) |
| `docs/agents/CURRENT_STATE_ARCHIVE.md` | Historical — leave as archive |
| `docs/agents/cheek-approval-workflow.md` | Preferred path labels; peer / owner-reviewer notes |
| `docs/lovable/verdant-project-knowledge-*.md` | Snapshots — not rewritten |
| Historical specs / dispositions naming Grok | Archive — not rewritten |

---

## Collision / safety fences that do **not** change

- Parked PRs **#828**, **#817**, **#696**
- Remaining **Tranche A** edit points: **Codex** until reassigned
- **Tranche B+** product code: **Claude** until reassigned
- No merge / deploy / apply / migrations / outreach / external writes without Cheek
- No parallel same-slice builds
- No invented SEO / live metrics

---

## Phrases removed for Codex exclusivity (this refinement)

Exact (or near-exact) exclusivity wording replaced with peer + preference language:

- “Codex is Verdant's default implementation and integration agent”
- “Claude and Grok are **peer** implementers… they may implement when… assigns”
  (implied Codex exclusivity with exceptions)
- “You are not the primary code-writing agent by default”
- “becoming the primary code-writing agent is not, unless Cheek reassigns it”
- “a specification precise enough that Codex does not have to guess” (as if only Codex builds)
- “-> Codex     default build / integration”
- “Build (Codex, or peer assigned in CURRENT_STATE)”
- Map rows that still described Codex as “Default implementer; others implement only when Cheek reassigns” and Grok auto-rules as research-only / “Do not write application code”

---

## Edits in this slice (docs-only)

Pinned governance files + `CURRENT_STATE.md` assignment/approval + this map +
`cheek-approval-workflow.md`. No `src/`, no `supabase/migrations/`, no
product-behavior workflows.
