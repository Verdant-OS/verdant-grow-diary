# Replaceable roster

Normative names for seats cited by `AGENTS.md`. Replace this file when seats change.
Numbered rules in the constitution do not name tools, vendors, or people.

| Seat | What the constitution means | Current holder |
| --- | --- | --- |
| Founder | Explicit current instructions outrank the constitution. Production database changes, spend, publish gates, and the publish decision remain with this seat. Repository work does not authorize those operations. | Matthew Cheek |
| Engineering lead | Default inheritor when a workstream's holder retires and names no successor. | OG Kush |
| Merge seat | Merges only after per-item approval at the exact head, every required check is green, and an independent exact-head review passes. Does not bypass the queue. | Chemdawg (also called Grok 91 in operating notes); Harvest is the conditional backup described below |
| Peers | No peer outranks another. Assignment, named lock, and the coverage claim decide who writes. | Codex, Claude, Grok |
| Independent reviewer | A session that did not author or repair the change. A shared account is not independence. | See eligibility below |
| Default inheritor | See engineering lead. | OG Kush |

## Eligibility (illustrative of the current map)

Preserved from the constitution as it stood before names moved here:

- Select an actually available, eligible independent reviewer for the complete scope under `docs/agents/OWNERSHIP.md` §4.3.
- Blue Dream and Critical Mass are retired from future routing. Keep historical receipts.
- Codex may review work Codex neither authored nor repaired.
- A non-contributing Claude or Grok review session may accept work, including work Codex authored.
- Durban Poison remains eligible when available.
- Exclude every author and repairer, including after a task transfer.
- Graft's exact-head pass counts only on Graft's existing low-risk allowlist, and only when Graft neither authored nor repaired the work. Governance, protected, or mixed scopes still need an eligible outside reviewer.
- The merge gate is every required check in `config/required-status-checks.json` (the ruleset count at the time of writing is 35) plus an independent pass at the exact head, with no P1 or P2.
- Security and Council Chair are retired roles. Historical receipts stay as history; their safety and quality checks remain in the assigned QA/review scope.
- The preferred cross-role sequence is research, architecture, build, QA audit, founder approval. It is a path, not rank.
- New branches for the Codex seat use `codex/<task-id>-<slug>`. Other seats preserve the branch they were given.
- Any agent with repository access may open its own draft pull request for its assigned slice. Preserve the one active writer, branch ownership and review gates.
- Codex fixes every discovered defect in its assigned repository scope itself. New work arrives as `@codex` comments. A coverage record does not delegate implementation or grant new authority.
- Codex does not integrate its own work.
- Codex pushes are ordinary branch pushes only: no force-push, merge, publish, SQL apply, or production database writes. Drafts stay draft.

## Conditional backup merge seat

Harvest acts only while Chemdawg is unavailable, only when Verdante asks, and hands
the seat back when Chemdawg returns. Its merges use the account connected on the
Grok Bot box, not Chemdawg's account. Every gate applies at one exact head SHA:
Matthew's per-item yes; 35/35 required checks; an eligible independent PASS under
OWNERSHIP.md §4.3; no HOLD, scorer-lock problem, draft state, or merge conflict.
Use the existing merge queue with the expected head pinned. Harvest never writes
code, reviews, deploys, or touches production. This conditional seat grants no
other agent merge authority and does not revoke separately recorded founder grants.

## Role profiles

Current task assignments and session claims stay in operating state and the handoff
log; a role profile does not replace the current engineering lead or default inheritor.

- [canopy](../roles/canopy.md)
- [graft](../roles/graft.md)
- [root-cause](../roles/root-cause.md)
- [trellis](../roles/trellis.md)
- [verdante](../roles/verdante.md)
- [chemdawg](../roles/chemdawg.md)
- [golden-toad](../roles/golden-toad.md)
- [harvest](../roles/harvest.md)

## Per-item approval

Low-risk repository work may proceed under an existing assignment: opening draft
pull requests, syncing a branch with its base without force-push, editing docs and
PR bodies, filing issues, read-only checks, and lowering a routine's frequency.
Merges, migrations and SQL, production or config changes, deletes outside one's
own scratch space, spend, outbound messages, and installs need Matthew's per-item
yes. Verdante collects pending items in its numbered weekday approvals batch.
Approval does not grant production access or waive a named hold.

## Off limits until the founder approves

Migrations and SQL, `supabase/`, RLS, auth, edge functions, the Action Queue, lockfiles, and device control. Stop that item, write the escalation, and move on.

Standing locks, including the production database lock and any named hold, live in `docs/agents/CURRENT_STATE.md` until removed there.

## Smoke identity

Hosted smoke uses the production site only. The disposable test account writes only its own grow, tagged `[smoke <timestamp>]`. Never write customer data or use the KEEP account. The account address is an operating fact in the production verification runbook, not a constitutional name.
