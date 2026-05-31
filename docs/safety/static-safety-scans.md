# Static Safety Scans

Verdant ships an automated **static safety** gate that protects the V0
operating loop (Alert → Action Queue → Action Detail → Complete → Follow-up
Diary → Timeline) from regressions that could leak internal tokens, bypass
grower approval, or sneak in automation/device-control surfaces.

The gate runs as:

```bash
bun run test:static-safety
```

It also runs on every PR via the **"Static safety scans (Action Queue
provenance + chip)"** step in `.github/workflows/ci.yml`.

---

## When to run it (required)

Run `bun run test:static-safety` locally **before publishing** any change
that touches — directly or indirectly — any of:

- Action Queue (`src/pages/ActionQueue.tsx`, related hooks, helpers)
- Alerts (alert lists, alert detail, alert→action handoff)
- AI Doctor recommendations or actions
- Provenance parsing (`[alert:<id>]`, `[session:<id>]` tokens, reason
  strings, source/back-pointer metadata)
- Query-param context chips (e.g. `?alert=<id>` filter chips, "Back to
  alert", "Clear filter")
- Automation/device-control-adjacent code (anything near MQTT, Home
  Assistant, relays, actuators, Pi bridge, webhooks)
- Safety copy (approval-required wording, follow-up wording, empty-state
  copy that must not imply automation)

If your change touches none of the above, the full Vitest suite still
covers you — but the static gate is cheap, so running it is encouraged.

---

## What the scan currently protects

The suite enforces these invariants on the relevant source files:

- **No raw provenance tokens in the UI.** `[alert:<id>]` and
  `[session:<id>]` must never appear in rendered text, ARIA labels, or
  `innerHTML` of Action Queue surfaces.
- **No inline provenance extraction outside approved helpers.** Token
  parsing must go through the shared helpers in
  `src/lib/actionQueueProvenanceRules.ts` (e.g. `extractSourceAlertId`,
  `extractSourceAiDoctorSessionId`, `stripBackPointerTokens`).
- **No ad-hoc parsing of provenance tokens** in executable code —
  including JSX attributes, event handlers, and callback bodies. The scan
  forbids `.match`, `.exec`, `new RegExp`, `.indexOf`, `.includes`,
  `.split`, and `.slice` against `[alert:` / `[session:` literals.
- **No unsafe Action Queue / Alerts write paths.** No
  insert/update/delete/upsert/rpc against `action_queue` or `alerts`
  beyond the existing approved completion path.
- **No `functions.invoke`** in the scanned surfaces.
- **No `service_role`** in client code.
- **No device-control or automation strings** (`mqtt`, `home_assistant`,
  `pi_bridge`, `relay`, `actuator`, etc.).

The scan uses `src/test/utils/stripSourceComments.ts` to strip JS/TS/JSX
comments before searching, so harmless docstring mentions of the tokens
don't trip the gate — but real executable code containing them will.

---

## Approved patterns

- **Parse provenance via shared helpers.** Import
  `extractSourceAlertId` / `extractSourceAiDoctorSessionId` from
  `@/lib/actionQueueProvenanceRules` instead of writing inline regexes.
- **Keep parsing out of JSX.** Compute derived values (e.g.
  `sourceAlertId`) at the top of the component or in a hook, then
  reference the variable inside JSX/handlers.
- **Render safe labels and links only.** Use
  `getActionQueueSourceLabel(row)` for the badge text and
  `alertDetailPath(sourceAlertId)` for "Open source alert" / "Back to
  alert" affordances. Never render the raw token.
- **Strip back-pointer tokens from grower-visible reason text** with
  `stripBackPointerTokens` before display.

---

## Validation commands

Before publishing any change in the scope above, run:

```bash
bun run test:static-safety
bunx vitest run --reporter=dot
```

Both must be fully green.

---

## Stop-ship rule

If `test:static-safety` fails, **do not publish**.

Fix the underlying cause in the source file — do not weaken the scan,
relax the regex, or move forbidden code into a comment to bypass it. The
scan exists to keep the V0 loop trustworthy for growers; loosening it
defeats its purpose. If a new approved pattern legitimately needs to be
added, extend the shared provenance helpers and update the scan
intentionally in the same PR.
