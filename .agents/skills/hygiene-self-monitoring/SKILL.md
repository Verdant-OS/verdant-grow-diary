---
name: hygiene-self-monitoring
description: "Change-scope discipline for a fix or a feature that touches shared code. A change can keep the request's check green and still reach past the request - another exported function, a helper other callers use, a sibling fixed 'for consistency', a documented default - and the summary reports it as a matter of course ('it uses the same rule now'). This skill has the agent list the public behaviour its change reaches, mark what the request names, and put back or offer to the owner what it does not, closing with a [HYGIENE CHECK]: Request names, Change reaches, Outside, Decision. Triggers - fix this bug, this issue, while I'm in there, for consistency, the same bug is also in, shared helper, refactor, cleanup, tidy up, small fix, minimal change, public API, exported function, breaking change, deprecated, legacy, keep the change small, scope creep, unrelated change."
---

# Hygiene Self-Monitoring Skill

## In short

- A change can keep the request's check green and still reach past the
  request. Before you close, list every public behaviour your change alters -
  a function, an option, a documented result - and mark the ones the request
  names.
- One it does not name is left as it was, or put to the owner as a decision.
  It is never kept on your own call.
- Size is not the measure: a one-line change can reach three public
  functions, and a long tidy-up can reach none.
- Write the `[HYGIENE CHECK]` block: Request names, Change reaches, Outside,
  Decision.

**Purpose:** Keep a change to the behaviour the request asks to change, and
make every other public behaviour it touches visible to the owner, instead of
reported in passing as a matter of course.

**Key idea:** the request's own check - the issue's example, the failing
test, the gate a plan quotes - tests what the request names, so it cannot see
a change to anything else. A fix that keeps that check green and also alters
another public function passes every check you have. The way to see it is to
name what the change reaches, function by function, and hold that list
against the request.

## When to Activate

- You fix a defect or add a feature in code that other code calls: a shared
  helper, an exported function, a class other modules use, a documented
  option or default.
- The place the defect sits is shared, or the same defect sits somewhere
  else too.
- Your summary is about to say the change "also" applies somewhere, or that
  something "uses the same rule now".
- A companion hook reports how many public functions your edits changed, or
  that your close does not account for them.

## Core Protocol

1. **Name what the request names.** The functions, options or behaviours the
   request asks to change - as it states them, not as you would extend them.

2. **List what the change reaches.** Every public function, option or
   documented behaviour whose result your change alters: what you edited,
   and what calls what you edited. What is public is what callers can reach
   and rely on: exports, documented options and results, what the README or
   the changelog promises.

3. **Hold one against the other.** What the change reaches and the request
   does not name is outside the request. Two shapes carry most of it:

   - **The fix in the shared place** - the defect sits in a helper that other
     public functions, or callers outside this code, also use. Fixing it there
     fixes the request and changes them too.
   - **The fix copied to the sibling** - another function has the same
     defect, and fixing it there too "for consistency" changes what its
     callers get.

   Neither is wrong in itself; each is a change the owner did not ask for,
   made on their behalf.

4. **Decide, and say so.** Outside the request means one of two things: put
   it back as it was (`revert-extra`), or put it back too and offer the change
   to the owner as an option, with what it would change for their callers
   (`ask-owner`). A line in the summary saying the change reaches it too
   reports the change; it does not ask for it.

## Scope failure signatures

- **The consistency fix** - the same defect is fixed in a sibling the request
  did not name, and the close calls it consistency.
- **The shared-helper fix** - the defect is fixed where it is cheapest, in a
  helper whose other callers now behave differently.
- **The standard applied everywhere** - the request cites an outside
  standard, and every function the standard has an opinion on is brought in
  line with it.
- **The reported reach** - the close mentions what else changed as a fact,
  not as a choice the owner has.
- **The block that contradicts itself** - Change reaches lists more than
  Request names, and Outside says none; or Outside lists something and the
  Decision keeps it.

## Integration

Write the block at the close, as a markdown list in the message, **not
inside a fenced code block**. Fences do not wrap. No blank line inside the
block. The marker, field names and decisions stay in English (hooks parse
them); the rest is in the language of the turn.

**Write the block. Do not announce writing it.** No "I loaded this skill", no
"per the protocol" - the reader wants the work, not a status report about the
rules you were given.

[HYGIENE CHECK]
- Request names: <the functions, options or behaviours the request asks to change>
- Change reaches: <every public function, option or documented behaviour whose result this change alters>
- Outside: none | <what it reaches that the request does not name>
- Decision: keep | revert-extra | ask-owner

`Outside: none` goes with `keep`. Anything under `Outside` is never kept on
your own call: `revert-extra` puts it back as it was, and `ask-owner` puts it
back too and offers the change to the owner as an option, with what it would
change for their callers.
