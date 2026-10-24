# Replaceable roster

Normative names for seats cited by `AGENTS.md`. Replace this file when seats change.
Numbered rules in the constitution do not name tools, vendors, or people.

| Seat | What the constitution means | Current holder |
| --- | --- | --- |
| Founder | Explicit current instructions outrank the constitution. Production database changes, spend, publish gates, and the publish decision remain with this seat. Repository work does not authorize those operations. | Matthew Cheek |
| Engineering lead | Default inheritor when a workstream's holder retires and names no successor. | OG Kush |
| Merge seat | Merges only after every required check is green and an independent exact-head review passes. Does not bypass the queue. | Chemdawg (also called Grok 91 in operating notes) |
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
- Agents without repository access (Security, Council Chair) read the log and act only on an explicit assignment. They do not set `claimed_by` or push.
- The preferred cross-role sequence is research, architecture, build, security review, QA audit, council, founder approval. It is a path, not rank.
- New branches for the Codex seat use `codex/<task-id>-<slug>`. Other seats preserve the branch they were given.
- The Codex seat opens pull requests as drafts when it is the holder. A holder without that right asks the seat that can open one.
- Codex fixes every discovered defect in its assigned repository scope itself. New work arrives as `@codex` comments. A coverage record does not delegate implementation or grant new authority.
- Codex does not integrate its own work.
- Codex pushes are ordinary branch pushes only: no force-push, merge, publish, SQL apply, or production database writes. Drafts stay draft.

## Off limits until the founder approves

Migrations and SQL, `supabase/`, RLS, auth, edge functions, the Action Queue, lockfiles, and device control. Stop that item, write the escalation, and move on.

Standing locks, including the production database lock and any named hold, live in `docs/agents/CURRENT_STATE.md` until removed there.

## Smoke identity

Hosted smoke uses the production site only. The disposable test account writes only its own grow, tagged `[smoke <timestamp>]`. Never write customer data or use the KEEP account. The account address is an operating fact in the production verification runbook, not a constitutional name.
