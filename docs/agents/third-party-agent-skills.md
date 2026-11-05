# Third-party agent skills — adoption register

A record of external agent-skill bundles, hooks and procedures reviewed for use by the agents
working on this repository, and what was decided about each. It is the place to check before
installing, enabling or copying in an outside skill.

This register covers **agent tooling**: Claude, Codex, Grok and Gemini skills, hooks and
commands. It does not cover Verdant's product skill runtime. That runtime has its own
[authoring contract](../skills/verdant-skill-authoring-contract.md) and
[promotion policy](../skills/verdant-skill-promotion-policy.md).

A verdict here grants no permission. Installation, hook enablement and repository changes each
need their own authorized task. `AGENTS.md`, `CLAUDE.md`, `docs/agents/OWNERSHIP.md` and the
role files keep authority over any third-party instruction.

## Standing rules for any outside skill

1. **Existing authority wins.** A third-party skill never expands permissions, overrides an
   owner hold, or replaces a governance file. Setup snippets that overwrite `AGENTS.md`,
   `GEMINI.md` or another root instruction file are not applied.
2. **Procedures before code.** A Markdown procedure can be adapted into a Verdant skill. Hooks
   and scripts are not enabled until they have been read in full, their failure paths have
   been tested in an isolated fixture with no credentials or production connections, and an
   authorized task enables them.
3. **Pin what is copied.** Before any third-party text or code is copied in, record the
   upstream source, the exact revision and the license. A link to a repository does not prove
   that a given copy came from it. A Verdant skill written from scratch from an outside
   concept copies nothing, so it needs no pin, but its entry must say that no text was copied.
4. **One router per host.** A host that routes skills natively does not also get a startup
   router hook.
5. **Evidence keeps its label.** A cached summary is not current evidence, a lexical routing
   score is not proof of behavior, and a source-only review is not a runtime test.

## Register

### `addyosmani/agent-skills` upload (reviewed 2026-10-04 UTC)

**Verdict: adopt selected workflow ideas; do not install the upload as a pack or enable its
hooks as supplied.**

- **Source:** an owner-supplied upload of 24 files (18 unique: 12 Markdown documents and six
  shell scripts), plus a separate 25th file, the `idea-refine` skill definition. The upload
  names `addyosmani/agent-skills` but carries no pinned commit, manifest or license.
  Provenance is `missing evidence`.
- **Review:** an owner-supplied static review, shared in an agent session on 2026-10-04 UTC.
  It is not archived in this repository. The component findings below are `source claim`s
  from that review and were not re-verified here. No uploaded script or test was run, sourced
  or installed, and no pass or fail count was measured.

Decisions by component:

- **Workflow guidance** (small verifiable tasks, failing test first, explicit handoffs):
  **adopted as ideas.** Verdant's existing process already requires most of it.
- **Skill anatomy and three-tier evaluation design** (structure, routing, behavior):
  **adopted as authoring guidance.** The eval runner, cases and results were not supplied, so
  no score from them is evidence.
- **`doubt-driven-development` procedure:** **adapted** as
  `.claude/skills/verdant-doubt-check/SKILL.md` (`#1890`). It was written from scratch from the
  concept, and no text was copied because the upload has no license. It has no hooks or
  scripts.
- **Host setup guides** (Copilot, Cursor, Gemini, OpenCode): **reference only.** The snippets
  that overwrite `GEMINI.md`, replace `AGENTS.md` with a generic template, or run a broad
  `rsync` over customized skills are rejected.
- **`session-start.sh` router hook:** **omitted.** Native skill routing already exists, and the
  meta-skill it loads was not supplied.
- **`sdd-cache-pre.sh` / `sdd-cache-post.sh` documentation cache:** **deferred.**
  - The stored validator is not bound to the stored body.
  - Entries are keyed by URL only, so a different question can get an earlier answer.
  - Reads are not snapshot-consistent.
  - There is no host allowlist or redirect policy, and URLs, prompts and responses are kept
    in plaintext.

  Never usable as current-source evidence.

- **`simplify-ignore.sh` source-hiding hook:** **rejected.**
  - An ordinary Edit or Write can discard protected code.
  - Malformed input triggers project-wide restoration, and its own test reaches that path.
  - A Read rewrites the working tree with no session ownership, which conflicts with the
    one-branch, one-holder rule.
  - Bash 5.2+ can corrupt `&` on restore.
  - Warnings exit 0 and are not shown to the agent.
- **`idea-refine` skill:** **usable manually for early product exploration, not installed.**
  Speculative alternatives must not widen approved scope. Its referenced `frameworks.md`,
  `refinement-criteria.md`, `examples.md` and helper script were not supplied.

**Account-level skills with the same names.** Sessions on this account list
`anthropic-skills:code-review-and-quality`, `anthropic-skills:api-and-interface-design` and
`anthropic-skills:browser-testing-with-devtools`. Their names match this bundle, but their
source, revision and license could not be read from a session container. Treat them as
unvetted until their exact contents are pinned and read. They never stand in for a named
independent reviewer seat. `#1897` merged as `a980489a`. Its
[`SKILL.md:10`](https://github.com/Verdant-OS/verdant-grow-diary/blob/a980489ad5188e36eba89461117c2b60fc10f927/.agents/skills/verdant-exact-sha-review/SKILL.md#L10)
references the unpinned box copy of `code-review-and-quality` at
`/home/box/agent-data/workflows/code-review-and-quality/SKILL.md` for review axes only:
correctness, readability, architecture, security and performance. That copy's approval
standard does not apply; the Verdant review
loop governs verdicts, and `docs/agents/recurring-review-findings.md` is the checklist authors
run before review. This register records that axes-only use. Pinning the copy or adopting it
as a standing review checklist is a separate step under the next step below.

**Smallest next step, if wanted.** Pin one complete `code-review-and-quality` skill and its
references. Run it by hand in a read-only session against a closed historical diff, with no
hooks and no credentials. Compare it with a baseline review on actionable findings, false
positives and missed known issues. Stop there; any adoption is a separate small draft PR.

### `pbakaus/impeccable` (reviewed 2026-11-04 UTC)

**Verdict: adapt the `critique` review rubric as a manual procedure; do not install the
package, and do not enable its binary, edit hook, telemetry or live mode.**

- **Source:** `https://github.com/pbakaus/impeccable` at commit
  `5af4319c4e7a7ee3e5e2b9fe899bcfb21c6190cb` (2026-11-04T15:09:55Z), Apache-2.0 (`LICENSE`
  read from the clone). Pinned by a read-only shallow clone in the trial session. No text
  was copied into this repository.
- **What it is:** one skill with 24 commands routed through `skill/SKILL.src.md`, each
  command a Markdown procedure under `skill/reference/`. Every command also runs
  `scripts/impeccable`, a launcher that downloads a Rust engine binary into
  `~/.impeccable/bin/` on first use. The package installs an edit hook that scans UI files
  on every Edit or Write, fetches a remote catalog on new designs (telemetry, opt-out by
  environment variable) and has a live mode that can launch the `codex` or `claude` CLI with
  approvals and sandboxing disabled (`source claim`: the upstream `CLAUDE.md` and `README`;
  the binary, hook and live mode were not run).
- **Evidence gathered:** `skill/reference/critique.md` read in full and applied by hand to
  `https://verdantgrowdiary.com/` and `/pricing` at live commit `57ed5a2904d5`, desktop only.
  Report: `docs/audits/impeccable-critique-trial-2026-11-04.md`. The run is declared
  degraded because its detector half was skipped under standing rule 2.
- **Result:** two P1 findings a reviewer would act on (hero decision load; SEO copy placement)
  from the design-review half alone. Nothing measured about the detector's accuracy.

Decisions by component:

- **`critique` and `audit` review rubrics** (heuristic table with mode-aware `n/a`, P0–P3
  severity, persona pass): **adapted as a manual procedure.** Use the report above as the
  shape; a reviewer runs it by hand with no scripts.
- **`polish`, `bolder`, `distill` and the other steer/finish commands:** **reference only.**
  They edit source and are not run against this repository.
- **Engine binary and `impeccable detect`:** **deferred.** Would close with: one run against a
  built `dist/` in an isolated fixture, no credentials, checksum of the downloaded binary
  recorded against `skill/scripts/engine-checksums.txt`, findings compared with the manual
  report. A separate authorized task.
- **Edit hook (`hook`, `hook-before-edit`):** **rejected.** A per-edit scan that runs a
  downloaded binary conflicts with the one-router-per-host rule and the no-untested-hooks
  rule, and would fire on every agent edit in this repository.
- **Live mode and `generate`:** **rejected.** Launching a coding CLI with approvals and
  sandboxing disabled has no place in this repository's agent model.
- **Telemetry / catalog fetch:** **rejected** for the same reason as the hook; it only
  matters if the package is installed, which it is not.
- **`npx impeccable install` and plugin-marketplace installs:** **not run.** They write
  harness directories and hooks into the project.

**Smallest next step, if wanted.** Decide the three founder questions at the end of the
trial report, then open a UI slice for the P1 pair under normal review.

## Adding an entry

Add a dated section under **Register** naming the source, the evidence actually gathered, and
a decision per component: adopted, adapted (with the Verdant file), reference only, deferred
(with what would close it) or rejected (with the reason). Keep unmeasured claims labelled
`NOT_MEASURED` or `missing evidence`.
