# Replaceable roster

Normative names for seats cited by `AGENTS.md`. This file is the only map from seats to current agent names and GitHub accounts.

Governance docs define seats and duties. `docs/agents/constitution/roster.md` is the only file mapping seats to current agent names and GitHub accounts, and on who holds a seat the roster wins. Matthew's own words override both. Renaming an agent edits only the roster.

## Current seats

| Seat            | Side  | Holder                                   | GitHub account          |
| --------------- | ----- | ---------------------------------------- | ----------------------- |
| Ultra Builder 1 | Ultra | Node                                     | `verdant-ultra-bot`     |
| Ultra Builder 2 | Ultra | Wedding Cake                             | `verdant-ultra-bot`     |
| Ultra Fixer     | Ultra | Brachs (Blueberry)                       | `verdant-ultra-bot`     |
| Coordinator     | Main  | OG Kush                                  | `cheekhimself` (shared) |
| Merge Steward   | Ultra | Granddaddy Purple                        | `verdant-ultra-bot`     |
| Merge Readiness | Main  | Green Crack                              | `cheekhimself` (shared) |
| Steward Backup  | Main  | OG Kush                                  | `cheekhimself` (shared) |
| Reviewer A      | Main  | Sour Diesel                              | `cheekhimself` (shared) |
| Reviewer B      | Main  | Jack Herer                               | `cheekhimself` (shared) |
| Reviewer C      | Main  | Durban Poison · Reviewer (Main)          | `cheekhimself` (shared) |
| Reviewer D      | Main  | Maui Wowie · Reviewer (Main)             | `cheekhimself` (shared) |
| QA              | Main  | Blue Dream · QA (Main)                   |                         |
| New-User Smoke  | Main  | Toad Venom                               |                         |
| Bug Sweep       | Main  | White Widow                              |                         |
| Owner Adviser   | Main  | Bloom                                    |                         |
| Flow Owner      | Both  | The Coordinator on each side, by default |                         |

Reviewer C, Reviewer D, and QA are active.

The Merge Steward has no authority over the #1971 hold, which stays with the Coordinator.

Ultra's open pull-request cap is 10.

## Rules

- Ultra seats never review, approve, or mark ready. Only the Ultra Merge Steward seat queues and merges, as `verdant-ultra-bot`, and only after a non-author Main Reviewer seat posts APPROVE at the exact current head. Matthew set that seat on 2026-10-30 at 11:03 PM CT.
- The Merge Steward has no authority over the #1971 hold, which stays with the Coordinator.
- Steward Backup (Main) stands in when the Ultra Merge Steward is unavailable, under the same Steward rules, and still has no authority over the #1971 hold.
- Main seats never write product code.
- Approvals come only from Matthew, in his own words.
- OG Kush holds both Coordinator and Steward Backup. When it acts as Steward Backup, it cannot also be the reviewer of record for the same PR.
- Ultra's open pull-request cap is 10.
- Reviewer C, Reviewer D, and QA are active.

**Historical, no current seat:** Codex, Claude, Chemdawg/Grok 91, GDP. Their historical attribution, receipts, and contributor exclusions are kept word for word below. **Handoff guard:** any active assignment or hold owned by a historical agent stays in force until the Coordinator posts an explicit handoff to a seat (or Matthew releases it, as he released Codex's work on 2026-10-30), so no work is abandoned and no two writers collide.

## Historical

# Replaceable roster

Normative names for seats cited by `AGENTS.md`. Replace this file when seats change.
Numbered rules in the constitution do not name tools, vendors, or people.

<!-- prettier-ignore -->
| Seat | What the constitution means | Current holder |
| --- | --- | --- |
| Founder | Explicit current instructions outrank the constitution. Production database changes, spend, publish gates, and the publish decision remain with this seat. Repository work does not authorize those operations. | Matthew Cheek |
| Engineering lead | Default inheritor when a workstream's holder retires and names no successor. | OG Kush |
| Merge seat | Merges only after per-item approval at the exact head, every required check is green, and an independent exact-head review passes. Does not bypass the queue. | Matthew's current explicit assignment: OG Kush merges PR #1971; Jack Herer gives its independent PASS; Codex is repair-only. The hold below remains. Chemdawg/Grok 91 is retired; no Harvest succession is inferred. |
| Peers | No peer outranks another. Assignment, named lock, and the coverage claim decide who writes. | Codex, Claude, Grok |
| Independent reviewer | A session that did not author or repair the change. A shared account is not independence. | See eligibility below |
| Default inheritor | See engineering lead. | OG Kush |

## PR 1971 merge actor assignment and hold

Matthew's latest direct instruction supersedes the earlier Codex merge-actor
assignment for [PR #1971](https://github.com/Verdant-OS/verdant-grow-diary/pull/1971):
**OG Kush merges #1971; Jack Herer gives the independent PASS; Codex is repair-only.**
Codex may perform the assigned documentation repair, validate it, push normally
and follow fresh CI. Codex must not mark ready, enqueue, enable auto-merge or merge
this PR, including after checks turn green. There is no Codex author-integration
exception for #1971. This assignment changes no separately recorded founder grant.
Under AGENTS.md §0.1, Matthew's current instruction controls; OWNERSHIP.md
remains authoritative on routing.

**Current status: merge and deployment held.** Matthew explicitly said not to
merge or deploy yet. OG Kush may ready/enqueue this PR only after Matthew later
explicitly lifts the hold and gives his per-item yes at the final reviewed
**full 40-character head SHA**, after every gate below passes. Assignment, green
checks and a review do not supply that approval.

At that same unchanged head, require all 35 required contexts and applicable
supplemental checks successful; a complete clean PASS with zero P1/P2 from the
assigned Jack Herer session, actually available, eligible and non-contributing
under OWNERSHIP.md §4.3; verified session identity, contributor exclusions and a
durable complete-scope receipt; no blocking finding, owner hold, scorer-lock
issue, draft or conflict; and the normal merge queue with expectedHeadOid pinned.
A role name or shared account is not availability or independence evidence.
Every contributing Codex session and subagent remains excluded from independent
acceptance. OG Kush's pre-check or merge role is separate from Jack Herer's
acceptance. A new head needs fresh CI, complete review and same-head approval.

No future #1971 work routes to retired Chemdawg or its Grok 91 alias. Harvest has
not inherited this assignment. Historical role profiles and default routing below
do not override this assignment. No production, publish, SQL, auth, secret, spend,
settings or deployment authority is granted.

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
- Codex does not integrate its own work under this roster. For PR #1971, Codex is repair-only: OG Kush is the assigned merge actor and Jack Herer the assigned independent acceptor, subject to the hold and all gates above.
- Codex pushes are ordinary branch pushes only: no force-push, publish, SQL apply, or production database writes. No #1971 ready/enqueue/auto-merge/merge authority is granted to Codex. Other explicit founder grants retain only their separately recorded scope. Drafts stay draft until an authorized ready/enqueue step by the assigned merge actor.

## Conditional backup merge seat

The earlier arrangement made Harvest the conditional backup while Chemdawg was
unavailable, only when Verdante asked, with the seat returned on Chemdawg's return.
Chemdawg's retirement does not activate that arrangement or assign Harvest PR #1971;
the current named assignment above controls. Preserve this earlier role description
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
