# AI Doctor Preview Safety Scanner

Dependency-free static guard that prevents the AI Doctor **Action Queue
suggestion preview** (helper + presenter, plus any future preview files)
from drifting into executable Action Queue behavior, device control,
automation, or AI write paths.

The preview is read-only. The scanner enforces that the source code of
the preview surface never adopts approved/queued/executed language,
Action Queue write calls, `functions.invoke`, `service_role`,
device-command, MQTT publish, pump/dose/turn-on/setpoint, or
"automation enabled" / "control equipment" phrasing.

## What the scanner checks

- Always scans:
  - `src/lib/aiDoctorActionSuggestionPreviewRules.ts`
  - `src/components/AiDoctorContextReadinessPanel.tsx`
- Auto-discovers any `.ts` / `.tsx` file under `src/lib/**` or
  `src/components/**` whose content includes a preview-identifying
  marker (e.g. `ActionSuggestionPreview`, `previewActionSuggestion`,
  `ai-doctor-action-suggestion-preview`, `Action Queue suggestion
  preview`). Unrelated components are ignored. Test files are excluded.
- Skips comment lines, regex-literal pattern declarations, allowlisted
  phrases, lines containing an allow marker comment, and lines with a
  denial / safety-context word (`never`, `not`, `cannot`, `blocked`,
  `drop`, `prohibit`, `prevent`, `guard`, `refuse`, `forbid`,
  `defence/defense`, `safety filter/posture/note/net/guard`).

## How to run it

```bash
# Direct
node scripts/assert-ai-doctor-preview-safety.mjs

# Package script
bun run ai-doctor:preview-safety
```

The scanner exits non-zero on any violation. Each violation prints:

```
<file>:<line> [<rule>] "<text>" — <explanation>
```

## Allowlist config

`scripts/config/ai-doctor-preview-safety-allowlist.json` controls the
safe phrases and per-line allow markers used by the scanner:

```json
{
  "allowedPhrases": [
    "Approval required",
    "No device control",
    "Preview only",
    "no queue item created",
    "no Action Queue item is created",
    "will not run equipment commands"
  ],
  "allowedLineMarkers": [
    "AI-DOCTOR-PREVIEW-SAFETY: ALLOW"
  ]
}
```

- A line is exempted if it contains any of the `allowedPhrases`
  (case-insensitive substring).
- A line is exempted if it contains any of the `allowedLineMarkers`
  (e.g. a trailing `// AI-DOCTOR-PREVIEW-SAFETY: ALLOW` comment).
- The scanner **fails closed**: missing file, invalid JSON, wrong
  shape, or empty/non-string entries all cause an immediate error.

## GitHub Actions annotations

When run with `GITHUB_ACTIONS=true`, the scanner additionally emits
inline workflow annotations alongside the structured output:

```
::error file=<file>,line=<line>,title=<rule>::<escaped message>
```

`%`, `:`, `,`, `\r`, and `\n` in messages are URL-escaped per the
GitHub Actions workflow-command spec so annotations render correctly
on PR diffs.

CI wires the scanner as a stop-ship step in `.github/workflows/ci.yml`
under the `AI Doctor preview safety` job step.

## Optional pre-commit hook

This repository does **not** install a git hook automatically. Operators
who want a local pre-commit guard can wire the helper script manually:

```bash
echo '#!/bin/sh'                                         >  .git/hooks/pre-commit
echo 'node scripts/precommit-ai-doctor-preview-safety.mjs' >> .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Behavior:

- Inspects staged files via `git diff --cached --name-only`.
- If any staged file is a preview target, the scanner script, the
  allowlist config, or the scanner test file, runs the full scanner.
- Otherwise prints a skip message and exits 0.
- Dependency-free; does not require Husky or lint-staged.

Also available as a package script:

```bash
bun run precommit:ai-doctor-preview-safety
```

## Safety boundary

This scanner is a **static guard** against unsafe drift in the preview
surface. It does not, on its own, prove that no Action Queue write,
device command, or automation can ever happen elsewhere in the app.
Other static and runtime safety checks (Action Queue provenance scans,
RLS harnesses, V0 operating-loop contract tests) cover those concerns.
Keep this scanner narrow, fast, and dependency-free.
