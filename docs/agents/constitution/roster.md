# Replaceable roster

Normative names for seats cited by `AGENTS.md`. Replace this file when seats change.
Numbered rules in the constitution do not name tools, vendors, or people.

| Seat | What the constitution means | Current holder |
| --- | --- | --- |
| Founder | Explicit current instructions outrank the constitution. Production database changes, spend, publish gates, and the publish decision remain with this seat. Repository work does not authorize those operations. | Matthew Cheek |
| Engineering lead | Default inheritor when a workstream's holder retires and names no successor. | OG Kush |
| Merge seat | Merges only after per-item approval at the exact head, every required check is green, and an independent exact-head review passes. Does not bypass the queue. | Matthew's current explicit assignment. Chemdawg/Grok 91 is retired; PR #1971 names the Codex coordinating session under the held exception below. No Harvest succession is inferred. |
| Peers | No peer outranks another. Assignment, named lock, and the coverage claim decide who writes. | Codex, Claude, Grok |
| Independent reviewer | A session that did not author or repair the change. A shared account is not independence. | See eligibility below |
| Default inheritor | See engineering lead. | OG Kush |

## PR 1971 merge actor exception and hold

On 2026-10-26, Matthew retired Chemdawg and explicitly selected the Codex
coordinating session for [PR #1971](https://github.com/Verdant-OS/verdant-grow-diary/pull/1971)
as that PR's merge actor. This is a named exception for **PR #1971 only**, including
its resulting repair heads. It overrides the general prohibitions on a contributing
Codex session integrating its work and the older Chemdawg/Grok 91/conditional-Harvest
routing in this roster, OWNERSHIP.md, AGENTS.md, role profiles and review-skill text
for this PR. Under AGENTS.md §0.1, Matthew's current instruction controls; OWNERSHIP.md
remains authoritative on routing. This grants no default self-integration power on
other work and does not change any separately recorded founder grant.

**Current status: merge and deployment held.** Matthew's latest instruction authorizes
the remaining merge-actor documentation repair, normal push and fresh CI, and says
not to merge or deploy yet. The assigned session must not mark ready, enqueue,
enable auto-merge or merge until Matthew later explicitly lifts this hold and gives
his per-item yes at the final reviewed **full 40-character head SHA**.

After that later approval, all gates must still hold at that same unchanged SHA:
all 35 required contexts and applicable supplemental checks successful; a complete
clean PASS with zero P1/P2 from an actually available, eligible, non-contributing
outside reviewer under OWNERSHIP.md §4.3; no blocking finding, owner hold, scorer-lock
issue, draft or conflict; and the normal merge queue with `expectedHeadOid` pinned.
Every contributing Codex session, including the assigned actor and its subagents,
remains excluded from independent acceptance. Actor assignment, green checks and a
review are not founder approval. A new head needs fresh CI, full review and approval.

No future #1971 work routes to retired Chemdawg or its Grok 91 alias. Harvest has not
inherited this assignment. The historical Chemdawg/Harvest role profiles and their
default routing below do not override this named exception. No production, publish,
SQL, auth, secret, spend, settings or deployment authority is granted.

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
- By default, Codex does not integrate its own work; the named PR #1971 founder exception above is the only exception recorded here and remains held.
- Codex pushes are ordinary branch pushes only: no force-push, publish, SQL apply, or production database writes. Merge authority requires an existing explicit founder grant; the named PR #1971 exception above remains held until its hold is lifted and every exact-head gate passes. This creates no other grant. Drafts stay draft until an authorized ready/enqueue step.

## Conditional backup merge seat

The earlier arrangement made Harvest the conditional backup while Chemdawg was
unavailable, only when Verdante asked, with the seat returned on Chemdawg's return.
Chemdawg's retirement does not activate that arrangement or assign Harvest PR #1971;
the current named exception above controls. Preserve this earlier role description
as history, not a new merge grant. Its recorded gates were all at one exact head SHA:
Matthew's per-item yes; 35/35 required checks; an eligible independent PASS under
OWNERSHIP.md §4.3; no HOLD, scorer-lock problem, draft state, or merge conflict.
The historical method used the existing merge queue with the expected head pinned.
Harvest's profile grants no code, review, deployment or production powers. This
historical record does not revoke separately recorded founder grants.

## Role profiles

Current task assignments and session claims stay in operating state and the handoff
log; a role profile does not replace the current engineering lead or default inheritor.

- [canopy](../roles/canopy.md)
- [graft](../roles/graft.md)
- [root-cause](../roles/root-cause.md)
- [trellis](../roles/trellis.md)
- [verdante](../roles/verdante.md)
- [chemdawg — historical profile; retired from current routing](../roles/chemdawg.md)
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
