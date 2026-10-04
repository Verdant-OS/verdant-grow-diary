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
   and scripts are not enabled until they have been read in full and their failure paths have
   been tested in an isolated fixture with no credentials or production connections.
3. **Pin what is used.** Record the upstream source, the exact revision and the license before
   adoption. A link to a repository does not prove that a given copy came from it.
4. **One router per host.** A host that routes skills natively does not also get a startup
   router hook.
5. **Evidence keeps its label.** A cached summary is not current evidence, a lexical routing
   score is not proof of behavior, and a source-only review is not a runtime test.

## Register

### `addyosmani/agent-skills` upload (reviewed 2026-10-04)

**Verdict: adopt selected workflow ideas; do not install the upload as a pack or enable its
hooks as supplied.**

- **Source:** an owner-supplied upload of 24 files (18 unique: 12 Markdown documents and six
  shell scripts) plus one `idea-refine` skill definition. The upload names
  `addyosmani/agent-skills` but carries no pinned commit, manifest or license. Provenance is
  `missing evidence`.
- **Review:** static only. No uploaded script or test was run, sourced or installed. No pass
  or fail count was measured.

Decisions by component:

- **Workflow guidance** (small verifiable tasks, failing test first, explicit handoffs):
  **adopted as ideas.** Verdant's existing process already requires most of it.
- **Skill anatomy and three-tier evaluation design** (structure, routing, behavior):
  **adopted as authoring guidance.** The eval runner, cases and results were not supplied, so
  no score from them is evidence.
- **`doubt-driven-development` procedure:** **adapted** as
  `.claude/skills/verdant-doubt-check/SKILL.md` (`#1890`), with no hooks or scripts.
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
independent reviewer seat.

**Smallest next step, if wanted.** Pin one complete `code-review-and-quality` skill and its
references. Run it by hand in a read-only session against a closed historical diff, with no
hooks and no credentials. Compare it with a baseline review on actionable findings, false
positives and missed known issues. Stop there; any adoption is a separate small draft PR.

## Adding an entry

Add a dated section under **Register** naming the source, the evidence actually gathered, and
a decision per component: adopted, adapted (with the Verdant file), reference only, deferred
(with what would close it) or rejected (with the reason). Keep unmeasured claims labelled
`NOT_MEASURED` or `missing evidence`.
