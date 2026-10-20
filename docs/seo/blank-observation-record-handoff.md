# Blank observation record asset handoff

Task: SEO-BLANK-OBSERVATION-RECORD. Status: OPEN, implemented draft.
PR: https://github.com/Verdant-OS/verdant-grow-diary/pull/2260

```text
HANDOFF
from_agent: Codex
to_agent: Claude (guide integration); Critical Mass (independent acceptance)
sentinel_version: 2026-10-13.1
claimed_by: Codex, Matthew's explicit asset-only assignment
branch: codex/seo-blank-observation-record
base: verdant-grow-diary, c0ce65cb37498d346f46ec5d0a5a6c2f21a8da9a
asset_commit: 6c6c6901136b569969b2d56068e554af444435c9
independent_reviewer: Critical Mass; pending, no self-acceptance
last_updated: 2026-10-20 00:20 UTC
```

The final PR body records the exact final remote head. This evidence document
follows the asset commit; its update changes no asset or test bytes.

## Scope and ownership

All five changed files are new:

- `public/downloads/blank-observation-record.csv`
- `public/downloads/blank-observation-record.pdf`
- `public/downloads/blank-observation-record-instructions.txt`
- `src/test/blank-observation-record-assets.test.ts`
- `docs/seo/blank-observation-record-handoff.md`

The draft opened before implementation at
`3c10d31fe818cd5a08bc42a4f222b878db3311f1`, with one holder recorded in its
body. GitHub comments require separate approval, so no comments were posted.
The handoff uses this new document and the PR body to preserve the closed scope;
existing agent logs and other owned files were not changed in the PR.

Fresh deploy-branch fetch and public-tree enumeration found no `public/downloads`
directory, public CSV, or matching blank observation/journal download. The only
public PDF was the separate `verdant-bud-rot-prevention-checklist.pdf`. Local
checkout was clean. Recent/open PR inspection found no matching asset work;
#2023 and #2259 concern other SEO code. The shared fleet registry was unavailable.
No overlap was observed in the inspected scope; other-chat coverage is unavailable.

Claude retains `src/constants/verdantSeoContent.ts`, `GuidePage.tsx`,
`staticPublicSeoDocuments.ts` and related SEO page work. This branch contains no
changes to those files. Cultivar schema PR #2259 and Canopy's authenticated PDF
export work stay separate. No existing protected test, dependency, lockfile,
workflow, secret, schema, merge or deployment change is included.

## Completed and verified

The CSV has eight approved columns: `date`, `local_time`, `time_zone`,
`record_identifier`, `observation`, `photo_file_reference`, `source_reference`,
`follow_up_note`. It contains one entirely blank data row, UTF-8 without a BOM,
and CRLF line endings. The PDF has the matching eight human-readable labels and
blank spaces, with larger ruled areas for observation and follow-up notes.

The PDF and instructions state: "These are local records, not automatic Verdant
imports." The 769-byte instructions explain one row/sheet per record, local
references and leaving unknown details blank. There are no sample facts,
readings, cultivation/breeding/processing instructions, thresholds or prescriptions.

Prediction and observation: the new contract failed before the assets existed
(**5 FAIL**, missing files), then passed against the actual assets (**5 PASS**).
The related existing CSV fixture adds **2 PASS**: total **2 files / 7 PASS /
0 FAIL / 0 SKIP**. No existing scorer was edited or unlocked.

Checks completed in this isolated worktree on 2026-10-20 UTC:

| Check                                                                                                                                               | Result and coverage                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun x --no-install vitest run src/test/blank-observation-record-assets.test.ts src/test/csv-sensor-browser-e2e-fixture.test.ts --reporter=verbose` | PASS, 7 tests                                                                                                                                                                                                        |
| `bun run typecheck`                                                                                                                                 | PASS, full TypeScript check                                                                                                                                                                                          |
| Normal commit hooks                                                                                                                                 | PASS: scoped Prettier/ESLint, staged full-project typecheck, docs safety, 67 automated-phenotyping safety tests                                                                                                      |
| `node scripts/scorer-lock.mjs --report --strict`                                                                                                    | PASS, no tracked scorer modified/deleted/renamed/retyped                                                                                                                                                             |
| `node scripts/check-contract-test-resolution.mjs`                                                                                                   | PASS                                                                                                                                                                                                                 |
| `node scripts/assert-docs-safety.mjs`                                                                                                               | PASS                                                                                                                                                                                                                 |
| `git -c core.whitespace=cr-at-eol diff --check`                                                                                                     | PASS, CSV CRLF preserved                                                                                                                                                                                             |
| Python `csv.reader`                                                                                                                                 | PASS: two 8-column rows, completely blank body                                                                                                                                                                       |
| `pdfinfo`, `pdffonts`, `pdftotext -layout`                                                                                                          | PASS: one unencrypted Letter page, embedded fonts, selectable expected text, no forms/JavaScript                                                                                                                     |
| PyMuPDF text bounds                                                                                                                                 | PASS: all 14 spans within 36-point page margins, smallest footer font 9 pt; main instructions/field labels 11 pt                                                                                                     |
| Local Chromium download fixture                                                                                                                     | PASS: all 3 HTTP 200, expected MIME and suggested filenames, exact downloaded bytes                                                                                                                                  |
| PDF regeneration comparison                                                                                                                         | PASS, byte-identical output                                                                                                                                                                                          |
| Clean build                                                                                                                                         | PASS at asset commit `6c6c6901136b569969b2d56068e554af444435c9`; postbuild validates 383 JSON-LD blocks / 77 HTML documents, 1 existing Quick Log warning; all 3 `.output/public/downloads` files byte-match sources |

An initial uncommitted build attempt stopped at the expected `stamp_dirty` preflight. The clean asset-commit build then passed; build-generated version stamps were restored and are excluded from the PR.

Initial PDF visual inspection found poor fallback font spacing. The final PDF
embeds DejaVu Sans and DejaVu Sans Bold, generated with the environment's existing
ReportLab 4.4.9. No repository dependency was added. The final 144-dpi PNG was
visually inspected: one clean page, every field and notice legible, no clipping.
A read-only Codex peer also inspected the final render/content and found no
issues; this is peer evidence, not independent acceptance.

The local download check serves only the built `.output/public` asset directory with Python's
HTTP server and clicks same-origin anchors with the `download` attribute in
Chromium. It does not establish the application guide links or production delivery.
A Node global-fetch attempt hit an undici assertion; the completed check uses
Playwright's request client and actual browser downloads.

Local evidence (ephemeral, supplied alongside the PR handoff):

- `/tmp/verdant-seo-tooling/assets-red.log`
- `/tmp/verdant-seo-tooling/assets-green.log`
- `/tmp/verdant-seo-tooling/typecheck.log`
- `/tmp/verdant-seo-tooling/commit-assets.log`
- `/tmp/verdant-seo-tooling/downloads.json`
- `/tmp/verdant-seo-tooling/build-clean.log`
- `/tmp/verdant-seo-tooling/preview/blank-observation-record.png`
- `/tmp/verdant-seo-tooling/preview/blank-observation-record.txt`

| Artifact      | SHA-256                                                            |
| ------------- | ------------------------------------------------------------------ |
| CSV           | `b398381895296755a881d8f1d68d067d5c3078e4f123af6fd7357c840f24af06` |
| PDF           | `052e705ced2aefd30b2f62e0f659b41eb14a8ef783d4bbb7f931a8603b9a9725` |
| Instructions  | `ffa96d7fa00d2937fbc7d11a98aca82cec82438fc632bb10aafa825402a3d329` |
| Inspected PNG | `49c49c2f076f55936d95a219806531f9696316814bb7e97326ebd6a32a7102b7` |

## Claude integration prompt

In your existing guide integration branch, link the following public paths using
ordinary anchors and an explicit `download` filename (for example
`download="blank-observation-record.pdf"`). Keep labels specific: blank CSV,
printable PDF and local-use instructions.

```text
/downloads/blank-observation-record.csv
/downloads/blank-observation-record.pdf
/downloads/blank-observation-record-instructions.txt
```

Replace the existing "interactive starter, not a download" wording only in your
owned page/content work. Keep static and hydrated guide copy/links aligned.
Preserve the local-record disclaimer and do not imply that opening/editing these
files imports them or saves them into a Verdant account. Add a new integration
regression in your own scope; this asset contract deliberately does not pin or
modify the existing page tests. Verify those links once your integration contains
these assets. Do not copy the same assets into a competing branch implementation.

Independent exact-head acceptance and hosted CI are pending; the author cannot
provide acceptance. Full repository test suite, production downloads, deployment,
indexing and traffic outcomes are NOT_MEASURED. No production request or write was
needed. This draft stays draft; no ready/enqueue/merge/deploy operation is authorized.
Rollback is removal of the three new downloads and new test before integration;
Claude owns any later link changes.

## Reproducing the PDF

This is the exact generation source used with the environment's existing
ReportLab and system DejaVu fonts. Save it outside the repository and pass the
output PDF path as its first argument. It is tooling documentation, not a new
application dependency or build step. The deterministic output matched the PDF
hash above on regeneration. Render with `pdftoppm -png -r 144 -singlefile` and
inspect every page after any later asset edit.

```python
from pathlib import Path
import sys
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

destination = Path(sys.argv[1])
pdfmetrics.registerFont(TTFont("RecordSans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("RecordSansBold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
c = canvas.Canvas(str(destination), pagesize=(612, 792), pageCompression=0, invariant=1, pdfVersion=(1, 4))
c.setTitle("Blank observation record")
c.setAuthor("Verdant")
c.setSubject("Blank local records")

def text(x, y, size, value, bold=False):
    c.setFillColorRGB(0.10, 0.16, 0.13)
    c.setFont("RecordSansBold" if bold else "RecordSans", size)
    c.drawString(x, y, value)

def line(x, y, width):
    c.setStrokeGray(0.68)
    c.setLineWidth(0.5)
    c.line(x, y, x + width, y)

def field(x, y, width, height, label, ruled=False):
    c.setStrokeGray(0.55)
    c.setLineWidth(0.6)
    c.rect(x, y, width, height)
    text(x + 12, y + height - 20, 11, label, True)
    if ruled:
        for at in range(y + height - 47, y + 12, -24):
            line(x + 12, at, width - 24)

text(48, 744, 10, "VERDANT / LOCAL RECORDS", True)
text(48, 711, 25, "Blank observation record", True)
text(48, 687, 11, "These are local records, not automatic Verdant imports.")
text(48, 668, 11, "Use one sheet per record. Leave unknown details blank.")
line(48, 648, 516)
field(48, 572, 164, 58, "Date")
field(224, 572, 164, 58, "Local time")
field(400, 572, 164, 58, "Time zone")
field(48, 506, 516, 54, "Record identifier")
field(48, 326, 516, 168, "Observation", True)
field(48, 259, 516, 55, "Photo/file reference")
field(48, 192, 516, 55, "Source/reference")
field(48, 89, 516, 91, "Follow-up note", True)
text(48, 64, 10, "Keep the sheet and any referenced files together in your own records.")
text(48, 46, 9, "Blank template | Print at actual size or fit to page")
c.showPage()
c.save()
```

Status: implemented draft. Next owner: Claude for guide integration; Critical Mass for
independent acceptance. Prompt: use the integration instructions above; keep the
asset scope separate from #2259 and authenticated exports.
