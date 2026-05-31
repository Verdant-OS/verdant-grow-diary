# Lovable Task Template

Copy this template for every Verdant work request. Keep it scoped and safe.

```
MISSION
<one sentence describing the goal>

CONTEXT DOCS TO LOAD
- /README.md
- /docs/glossary.md
- /docs/verdant-product-context.md
- /docs/one-tent-loop.md
- /docs/data-labeling-spec.md
- <add any other doc relevant to this task>

TASK
<concrete description of what to build / change / add>

SCOPE
- <e.g. presentation-only, docs-only, pure helper, fixtures-only, safety regression>
- <files that may change>

OUT OF SCOPE
- App schema / migrations / RLS
- Automation
- Device control
- Sensor ingestion changes
- Fake live data
- Anything not listed in SCOPE

REQUIREMENTS
1. <requirement>
2. <requirement>
3. <requirement>
...

TESTS
- <required test cases — happy, edge, invalid, deterministic, regression>
- <which file the tests live in>

VALIDATION
- bunx vitest run — report exact pass count
- Static safety scan unchanged
- Confirm: no service_role, no device-control strings, no auto-execute language,
  no Next Door Cannabis strings, no "zero liability" phrase

SAFETY VERDICT
- Safe / Risky / Incomplete / Stop-ship — with one-line reasoning

STOP CONDITIONS
Stop and report instead of proceeding if any of the following are true:
- You need to edit app components outside SCOPE
- You need to edit schemas or migrations
- You need to add automation or device control
- You cannot guarantee fixture data is labeled demo/stale/invalid correctly
- Tests do not pass after your change

RETURN
- Summary
- Files changed
- Tests added / updated
- Validation output
- Safety verdict
- Publish recommendation
```
