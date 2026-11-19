# GGS-BLE-CSV-BRIDGE

```text
TASK GGS-BLE-CSV-BRIDGE  priority: other  status: CLOSED
closed: merged. Verdant-OS/verdant-grow-diary#2978 merged into verdant-grow-diary on 2026-11-17 at 09:10 UTC as 6a0540b0bea169c7d7cda0eb9514ee8a726616a0 (final SHA; merge commit from GitHub, confirmed an ancestor of origin/verdant-grow-diary at c468bc90e83f4a7d2c1e15937d88e0e14a0da741). The merged PR head was 3f57d3e57c65b6e7b34b4b18d9220263135d84c3, with a GitHub APPROVE from matt816cheek-bit at that commit. The required-check count at that head and the founder's per-item yes were not re-read for this close (NOT_MEASURED). post_merge_check result: PASS. bunx vitest run src/test/ggs-ble-csv-bridge-import.test.ts --reporter=dot on c468bc90e83f4a7d2c1e15937d88e0e14a0da741, 2026-11-17: Test Files 1 passed (1), Tests 2 passed (2). The tool's pytest suite was not run for this close (pytest is not installed on the closing machine). Closed on 2026-11-17 by a Claude Code session that did not author or review #2978, at Matthew's request ("close the GGS-BLE-CSV-BRIDGE handoff"). This close does not resolve the open questions below, and the tool has still not been run on a controller. The receive-only proof this entry cites as a task attachment is filed in draft Verdant-OS/verdant-grow-diary#2991.
goal: Draft a receive-only bridge that turns measured GGS status notifications into one CSV row per snapshot for the existing environment CSV import.
why: The owner asked for the smallest draft that reuses the current CSV path. Source stays csv. No schema, UI, or radio write.
branch: cursor/ggs-ble-csv-bridge-163b
base: verdant-grow-diary
checkout: git fetch origin cursor/ggs-ble-csv-bridge-163b verdant-grow-diary && git switch cursor/ggs-ble-csv-bridge-163b && VERIFIED_SHA=$(git rev-parse origin/cursor/ggs-ble-csv-bridge-163b) && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA"
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2978
head_sha: implementation commit 0b75af83914ff97d1f31943170410d02ddb68a6b. This handoff edit is a child of that commit. Confirm origin/cursor/ggs-ble-csv-bridge-163b and the pull request head before resuming. Baseline is 1f138a548756babf610d1260be6906f4f3653a6a.
state: pushed draft
current_step: draft pull request 2978 is open; unused _DROPPED_KEYS was removed after a code-quality note; do not mark it ready
next_action: read the draft pull request body for the tested head SHA, commands, and open questions; do not mark ready, merge, or review this change from the authoring session
post_merge_check: bunx vitest run src/test/ggs-ble-csv-bridge-import.test.ts --reporter=dot on verdant-grow-diary after merge. NOT_MEASURED until then.
active_writer: Grok implementation session on cursor/ggs-ble-csv-bridge-163b
decisions: New tool at tools/ggs-ble-csv-bridge, leaving tools/ggs-ble-testbench unchanged because that kit uses the community service UUID and a flat payload. This tool uses service 000000ff-0000-1000-8000-00805f9b34fb and characteristic 0000ff01-0000-1000-8000-00805f9b34fb. Version 00 01 frames are reassembled. Version 00 02 frames are counted and dropped. One getDevSta with an avg1 reading becomes one CSV row. source is csv. spider_farmer_ggs and ble are cells on that row. Observation time defaults to receive time. The 20-byte header layout follows the measured sketch order and has not been run on a controller. Fan level and light level are omitted. Zones other than zone1 are rejected.
tried_and_rejected: Extending the CSV parser, persistence source_app union, or soil parser. Copying the unlicensed controller repository. Editing the existing testbench. Using captured_at as the timestamp header, because the drop importer does not treat that header as the time column.
commands: On baseline 1f138a548756babf610d1260be6906f4f3653a6a, before these files existed: bunx vitest run src/test/csv-row-validation.test.ts src/test/environment-csv-import-view-model.test.ts src/test/csv-import-spider-farmer-soil-and-dst.test.tsx --reporter=dot (3 files, 40 passed); python3 -m pytest tools/ggs-ble-testbench -q --tb=line (27 passed); git cat-file -e 1f138a548756babf610d1260be6906f4f3653a6a:tools/ggs-ble-csv-bridge/ggs_status_csv.py (exit 128, path not in that commit). After the new files: python3 -m pytest tools/ggs-ble-csv-bridge -q --tb=short; bunx vitest run src/test/ggs-ble-csv-bridge-import.test.ts --reporter=dot; NODE_OPTIONS=--max-old-space-size=8192 bunx tsc -p tsconfig.json --noEmit --skipLibCheck. Counts belong in the pull request body at the tested head.
files_touched: tools/ggs-ble-csv-bridge/, src/test/ggs-ble-csv-bridge-import.test.ts, docs/agents/handoffs/GGS-BLE-CSV-BRIDGE.md
files_remaining: none in this slice
blockers: draft only; independent review is required; this author holds no review seat
open_questions: The importer stores the tent the grower selects, not the tent_id cell. The insert source_app union cannot carry spider_farmer_ggs, so that token stays in the raw row. Importer bounds (temp -40..80 C, VPD 0..10, and a derived VPD when the VPD cell is blank) differ from the flag windows and are unchanged. Header byte offsets and the CRC polynomial were not tabulated. Zones 2-8, fan, light, and more than one tent from one unit were not measured.
gotchas: Do not write a characteristic. Do not decrypt version 00 02. Do not put a hardware address, product code, or sensor-suffix label in fixtures or logs. Synthetic tests do not prove a controller. CI runs the vitest file, not pytest.
links: proof file was the task attachment spider_farmer_e2e_proof.md; related merged work includes #203, #501, and #2902
artifacts: tools/ggs-ble-csv-bridge/fixtures/synthetic-zone1-snapshot.csv and synthetic-controller-map.json
reviewer_seat: none
reviewer_sha: none
session_state: no hardware listen was run; no production write
claimed_by: Grok, 2026-11-12 21:05 CT
owner: Grok implementation session
last_updated: 2026-11-17, by Claude Code (close; previous 2026-11-12 21:15 CT, by Grok)
```
