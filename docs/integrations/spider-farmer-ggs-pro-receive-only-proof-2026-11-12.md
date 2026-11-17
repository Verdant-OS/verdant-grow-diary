# GGS Pro receive-only end-to-end proof

> **Filing note (2026-11-17).** Filed as written on 2026-11-12, with two edits: the listen PC's hostname is omitted, and the links to `spider_farmer_protocol_report_part1.md` and `spider_farmer_protocol_report_part2.md` are plain names because those two files are not in this repo. The bridge this file plans in §9 merged as PR #2978 (`tools/ggs-ble-csv-bridge/`). The literature review that preceded these listens is [`spider-farmer-ggs-ble-literature-review-2026-11-12.md`](spider-farmer-ggs-ble-literature-review-2026-11-12.md).

**Date:** 2026-11-12, America/Chicago (CST, UTC−6).
**Equipment:** Matthew Cheek's Spider Farmer GGS Pro Controller, advertised name `SF-GGS-ICB`.
**Seat:** Northern Lights. Receive-only. This file is evidence, not a license to write to the controller, decrypt a payload, update firmware, put the unit on the internet, import into production, or merge a PR.

Every claim is labeled **measured**, **inferred**, **owner-confirmed**, or **NOT_MEASURED**. Plans are plans, not results. Finishing this document does **not** prove Verdant ingestion.

This file supersedes the “tent sensors still NOT_MEASURED” sections of `spider_farmer_protocol_report_part1.md` (§7) and `spider_farmer_protocol_report_part2.md` (§1a, §3–§4). The GATT, framing, `getSysSta` field catalog, accessory `00 02` listens, and community-license notes in those files remain in force and are not repeated in full here.

No Product Code, MAC addresses, `pid`, `uid`, Wi-Fi values, or physical-sensor identifiers appear in this document.

---

## 0. What this file proves, and what it does not

### Proven (measured on this Pro, 2026-11-12)

1. A receive-only BLE subscribe to FF01, with no write to FF02, is enough to receive unsolicited plaintext status from this unit on firmware 2.17.
2. With **no** tent sensor attached, `getDevSta.data` was empty (`{}`) for a 32-minute window — empty, not zero.
3. After a physical sensor was plugged into **zone 1**, `getDevSta.data` became non-empty and carried tent temperature, humidity, and VPD on every `getDevSta` in the captured window (40 of 40).
4. Those three numbers agree with each other as °C, % RH, and kPa, even though the JSON does not name the units (**owner-confirmed**, arithmetic in §6).
5. Those three fields fit Verdant's **existing** CSV sensor import path (`temp_c` / `air_temp`, `humidity`, `vpd`), with `source` = `csv`. This is a paper mapping against a repo snapshot, not a run of the importer.

### Not proven

- No CSV row was imported into Verdant. No production write was made. **NOT_MEASURED** (and not attempted).
- Other zones (`zone2`–`zone8`), empty-zone behavior, fan level, light level, CO2, PPFD, and soil: **NOT_MEASURED**.
- Whether one Pro can drive multiple tents: **NOT_MEASURED**. Only zone 1 was populated.
- Reconnect after a controller power-cycle, a full planned 6-minute zone-1 window, and per-message `getSysSta` gaps in the zone-1 window: **NOT_MEASURED**.
- Passing tests, a review, or a merged PR would still not prove ingestion.

---

## 1. Equipment, environment, and holds

**Measured** from the owner's System Settings photo (morning of 2026-11-12) and from plaintext `getSysSta` on `SF-GGS-ICB`:

| Item                             | Value                                                           | Label                                                                                                |
| -------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| On-screen name                   | GGS Pro Controller                                              | measured (photo)                                                                                     |
| Advertised BLE name              | `SF-GGS-ICB`                                                    | measured                                                                                             |
| Firmware `data.sys.ver`          | `2.17`                                                          | measured (matches the photo)                                                                         |
| Hardware `data.sys.hwver`        | `ICB`                                                           | measured                                                                                             |
| Firmware `data.sys.buildTime`    | `Sep 12 2025 09:34:40`                                          | measured (this is the build string; it is not 2025-08-28)                                            |
| Ethernet `eth.isConnect`         | 0                                                               | measured (morning `getSysSta`)                                                                       |
| MQTT `mqtt.isConnect`            | 0                                                               | measured (morning `getSysSta`)                                                                       |
| On-screen clock, morning listens | 2023-12-20                                                      | measured; device `UTC` / `localtime` agreed with that date                                           |
| Owner statement                  | Never connected to the internet; never had its firmware updated | owner-stated, morning of 2026-11-12, and restated at 12:21 PM CST (“still no internet connectivity”) |

That `SF-GGS-ICB` is this Pro is **inferred** from the photo, the advertised name, strongest RSSI, and the measured `hwver` / `ver`. It is not independently proven by a vendor document.

**Listen environment (measured):** owner's Windows PC (hostname omitted), Windows 10.0.26300.9974, Python 3.14.5, bleak 3.0.2 (MIT), Intel Wireless Bluetooth. Scripts were ephemeral and removed after each run. Computer control used the owner's go-ahead for those sessions and is not a standing listen.

**Holds, still in force:**

- Still no internet on the controller.
- Still no firmware update (stay on 2.17). Community reports say BLE encryption begins at firmware 3.14+ — that is a **community claim**, not measured on this Pro. This unit is **measured** plaintext at 2.17, framing `00 01`.
- Still no vendor-app bind or factory reset.
- Still no writes to the controller, including FF02. No `getDevSta` / `getSysSta` poll.
- Still no micro SD card in the unit. USB hub unused; power and Bluetooth are enough (**measured**).
- Still no decryption of accessory `00 02` frames, and no key from the vendor app.
- Still no Product Code, MAC, `pid`, `uid`, Wi-Fi, or physical-sensor id in commits, logs, fixtures, screenshots, or handoffs.

---

## 2. Method (all listens)

- Scan by advertised **name** and RSSI only. No addresses logged.
- Connect, discover GATT UUIDs and properties only (no characteristic-value reads).
- Subscribe to FF01 (CCCD `0x2902`). **Never write FF02.** Never send a request.
- Reassemble fragmented notifications by the measured v1 header; strip non-JSON bytes; `json.loads`.
- Redact identifiers at capture.
- Stale window: 30 seconds. Never fill gaps. Zero, if sent, is a value; missing is missing.
- Invalid ranges used for flagging (not for filling): humidity 0–100, temp −40–90, VPD 0–15, non-finite rejected.
- `observed_at` is **receive time**, labeled as receive time. Morning device clock was 2023-12-20 (**measured**). Do not use device `UTC` or `localtime` as observation time unless a later listen proves the clock is trustworthy.

---

## 3. Protocol measured on `SF-GGS-ICB`

**Measured** GATT (two 90-second sessions, ~5:03–5:09 AM CST, and later listens — same layout):

- Custom service: `000000ff-0000-1000-8000-00805f9b34fb` (16-bit `00FF`). This matches community repo R1's `ggs_ble.py`, **not** that repo's README value `FF00`.
- Also present: standard GAP `1800` and GATT `1801`.
- FF01: notify. Subscribed.
- FF02: write present. **Never written** on any session.
- MTU: 500.

**Measured** unsolicited FF01 message kinds on this Pro, both plaintext, framing version `00 01` (not the later `00 02` form):

| Kind        | How it arrives                                                                                         | Cadence          | Role                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `getDevSta` | Short complete JSON (no reassembly needed when the body is small)                                      | about every 6 s  | Device/sensor status. `data` is `{}` with no sensor attached, and `data.zone1` once a zone-1 sensor is attached. |
| `getSysSta` | Fragmented: 20-byte header `AA AA 00 03 … 00 01`, paired by header CRC, chunks concatenated at offsets | about every 10 s | System status only (`data.sys`). No tent-sensor fields in any session.                                           |

**Measured** v1 framing (morning session 2, 9 complete `getSysSta`): header 20 bytes; `field_a` equals reassembled payload length (517 on the first message, 518 on the next eight — **inferred** the +1 is `upTime` rolling from 4 digits to 5); chunk 1 offset 0 length 400; chunk 2 offset 400 with the remainder; two trailing bytes; 9/9 `json.loads` succeeded, 0 leftover buffers. Full `getSysSta` field catalog is in part 1 §4.

**Accessories** (`SF-GGS-CB`, `SF-GGS-LC`, `SF-GGS-PS5`, 5:10–5:16 AM CST): same GATT and MTU 500; every notification used version `00 02`; the same reassembly produced **zero** plaintext JSON. **Inferred** (measurement + community descriptions of v2): encrypted. Not decrypted. Method names and sensor fields on those units are **NOT_MEASURED**.

**Community literature** (not Pro fact except where a listen matches or conflicts):

| Repo                                                                                                                   | License        | Pinned SHA                                              | Role                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [cr0ssn0tice/Spider-Farmer-GGS-Controller-MQTT](https://github.com/cr0ssn0tice/Spider-Farmer-GGS-Controller-MQTT) (R1) | **No license** | `e4e4c71b492582943892c513e6c03f909fad2507` (2025-12-26) | BLE literature only. Do not copy its code. Some scripts write FF02 — out of bounds. |
| [cobragt2000/spider_farmer_bridge](https://github.com/cobragt2000/spider_farmer_bridge) (R2)                           | MIT            | `2300c45a13e195b1811e26bfc586c4501c01ccd4` (2026-11-09) | **Not BLE.** Wi-Fi TLS interception of a vendor MQTT host. Must not be used.        |

---

## 4. Negative control — 32-minute listen, no sensor attached

**Owner later stated** (after this listen): nothing was hooked to sensors or a tent at that time. That statement explains the empty `data`; it was not known when the listen started.

**Measured** window: 10:14:31 to 10:46:46 AM CST. Receive-only, FF01 only, connection held the whole way. 0 disconnects. 0 stale gaps on a 30-second window. Two message types only, both plaintext (`00 01`).

| Message     | Count | Cadence                                                | `data`                        | Sensor / zone fields |
| ----------- | ----- | ------------------------------------------------------ | ----------------------------- | -------------------- |
| `getDevSta` | 319   | about every 6.0 s (range 5.864–6.138 s)                | always `{}` — empty, not zero | none                 |
| `getSysSta` | 191   | about every 10.0 s (range 9.867–10.183 s), reassembled | `sys` only                    | none                 |

`getSysSta` still reported `ver` 2.17, `hwver` ICB, clock 2023-12-20, ethernet and MQTT unconnected. Temp, humidity, VPD, zone, and port fields: **not present**. Tent-sensor payload in this window: **NOT_MEASURED** (and, given the owner's later statement, not expected).

---

## 5. Positive — zone 1 sensor attached

**Owner stated** at the start of this listen: a sensor was plugged in, and the controller screen was showing a zone-1 reading. Power only; no internet; micro SD left out.

**Measured** window: first `getDevSta` at 11:39:19 AM CST through last at 11:43:14 AM CST. The listen process stopped at 11:43:15 AM CST after 255 seconds, short of the planned 6 minutes, and did not write a final summary. Cause of the early stop: **NOT_MEASURED**. Stats below were taken from the captured per-message timestamps and progress lines, not from a script footer.

### 5.1 Counts, gaps, empty vs non-empty

| Message     | Count | Empty                                        | Gaps                                                                               | Stale (30 s) |
| ----------- | ----- | -------------------------------------------- | ---------------------------------------------------------------------------------- | ------------ |
| `getDevSta` | 40    | **0** — every one carried zone-1 sensor data | 6 s thirty-eight times, 7 s once (mean 6.03 s)                                     | 0            |
| `getSysSta` | 24    | n/a (system-only, as before)                 | about every 10 s, from counts versus elapsed; **per-message gaps were not logged** | —            |

Timestamps for `getDevSta` are at one-second resolution, so the single 7-second gap is consistent with rounding, not a missed message (span and count fit a ~6 s cadence).

### 5.2 Payload shape (**measured**, first non-empty `getDevSta`, ~11:39 AM CST)

Top-level keys: `method` = `getDevSta`, `code` = 200, `msg` = `ok`, `pcode` = 1008 (type code, not a Product Code), `UTC` (device clock), `pid` and `uid` present and **redacted**.

`data` keys: `['zone1']` only. Other zone keys: **not present** (other zones **NOT_MEASURED**).

`data.zone1.sensor` is an array of **two** objects, same `temp` / `humi` / `vpd` on both:

| Object | `id`                                                  | Fields                                                                                            | Notes                                                                                                                                         |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [0]    | `avg1`                                                | `temp`, `humi`, `vpd`                                                                             | **Inferred** zone average. **Owner-confirmed:** zone 1 had only one sensor, so the average matching that sensor is expected.                  |
| [1]    | unique physical-sensor id, **redacted**, not recorded | `temp`, `humi`, `vpd`, `label` with a `TH-` prefix (unique suffix **redacted**), `typeCode` 43522 | What `typeCode` 43522 means is **NOT_MEASURED**. The physical id looks like a device identifier and is omitted on purpose (**owner-agreed**). |

No unit fields in the JSON. **Measured.**

First simultaneous reading (**measured**): `temp` 18.1, `humi` 40.4, `vpd` 1.24.

Over the window the readings **kept moving** (**measured** ranges): temp 18.1 to 18, humidity 40.4 to 41.6, VPD 1.24 to 1.21. Those are ranges of the series, not a claim that 18 / 41.6 / 1.21 was a single simultaneous sample.

`getSysSta` in this window stayed system-only: no sensor fields.

### 5.3 How to take a tent snapshot from this shape (**plan**, for a later bridge)

- The grower maps the controller (and, if needed, the zone) to a tent. Nothing is guessed from the advertised name or from RSSI.
- Both array objects carried the same temp / humidity / VPD. Emit **one** row per `getDevSta`, not two duplicate rows.
- Do not write the physical-sensor id, the unique `TH-` suffix, `pid`, `uid`, MAC, or Product Code into a CSV, log, fixture, or commit.
- `avg1` is a zone-average label, not a secret, and is safe to mention as a field name.

---

## 6. Units proof

The JSON does not name units. Magnitude first suggested °C, % RH, and kPa (**inferred** at 11:39 AM CST). The owner then **confirmed** the same, and the arithmetic agrees.

**First simultaneous sample (measured):** T = 18.1, RH = 40.4, device-sent `vpd` = 1.24.

Air VPD by Magnus-Tetens (saturation vapor pressure in kPa):

$$
e_s = 0.6108 \exp\left(\frac{17.27\,T}{T + 237.3}\right), \quad \mathrm{VPD} = e_s \left(1 - \frac{\mathrm{RH}}{100}\right)
$$

**Computed** from those two measured values (this calculation, 2026-11-12):

- \(e_s = 2.077003\) kPa
- actual vapor pressure \(e_a = 0.839109\) kPa
- VPD = \(1.237894\) kPa, which rounds to **1.24** kPa at two decimal places — the same value the device sent.

**Owner-confirmed:** “18.1 °C and 40.4% RH work out to an air VPD of 1.24 kPa, the same value it sent. That fits °C, % RH and kPa, even though the payload doesn't name them.”

The owner also noted 18.1 °C is about 64.6 °F, which is cool if lights were on at 11:39 and fine if they were off. Light-on vs light-off at that moment is **NOT_MEASURED**. Fan and light level were not in the payload.

Units used from here on: **°C**, **% RH**, **kPa**.

---

## 7. End-to-end mapping to Verdant's existing CSV path

This section is a **paper mapping**. It shows that the measured fields can be carried by the existing importer. It is **not** a completed import, and it is **not** a production write.

### 7.1 Repo snapshot this mapping was read from

Verdant docs and import helpers were copied to this computer at **2026-11-12 ~05:40 AM CST**. An earlier note recorded default-branch tip SHA `58286d66fb8ed7380977c25d5301ec7e4a882512` at 4:19 AM CST. Whether head has moved since 05:40 AM CST is **NOT re-verified** in this file. Paths below are that snapshot:

- `src/lib/csvMappingTemplates.ts` — presets include a `vpd` field (synonyms include `vpd`).
- `src/lib/csvRowValidationRules.ts` — canonical field `vpd`, parsed as `row.vpd_kpa`.
- `docs/csv-sensor-schema-mapping.md` — column table lists `temp_c`, `humidity`, `source`, timestamps; that shorter table **omits** `vpd`, but the mapping-template and validation **code** in the same snapshot accept it.
- Canonical displayed `source` labels are the trust set (`live` / `manual` / `csv` / `demo` / `stale` / `invalid` and related ingest allow-lists). Do **not** write `spider_farmer_ble` into `source`.
- `src/constants/sensorProviderLabels.ts` already has presenter-only keys `spider_farmer` and `spider_farmer_ggs` for provenance display. Those are labels, not canonical `source` values, and they do not authorize a new source string.

Ingest-contract rule (**from that snapshot's** `docs/sensor-ingest-payload-contract.md`): VPD is used from the device **or** computed from temp+RH, **never both**. Here the device sent VPD, and §6 shows it agrees with a °C / % RH computation, so a bridge must emit the **device-sent** `vpd` and must not also submit a second computed VPD.

CSV rows must not be displayed as a live feed. `captured_at` is ISO 8601 with timezone.

### 7.2 Worked example — first measured zone-1 reading, as one CSV row

Receive time is the observation time, labeled as receive time. Tent id is **grower-supplied** and is not invented here. Physical-sensor id is omitted. `raw_payload`, if stored, must be a redacted object (no `pid`, `uid`, MAC, Product Code, physical-sensor id, or unique `TH-` suffix).

```csv
captured_at,temp_c,humidity,vpd,source
2026-11-12T11:39:19-06:00,18.1,40.4,1.24,csv
```

| CSV column                        | Value                                                    | Origin                                                                                   |
| --------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `captured_at`                     | `2026-11-12T11:39:19-06:00`                              | **measured** receive time of the first non-empty `getDevSta` (America/Chicago, CST)      |
| `temp_c`                          | `18.1`                                                   | **measured** `data.zone1.sensor[].temp`; unit **owner-confirmed** °C                     |
| `humidity`                        | `40.4`                                                   | **measured** `humi`; unit **owner-confirmed** % RH                                       |
| `vpd`                             | `1.24`                                                   | **measured** device-sent `vpd`; unit **owner-confirmed** kPa; not recomputed for storage |
| `source`                          | `csv`                                                    | existing canonical label, **planned** — required by the current import path              |
| tent                              | grower-mapped, not in this example                       | nothing guessed                                                                          |
| provenance (not a `source` value) | e.g. `source_app` = `spider_farmer_ggs`, transport `ble` | **planned**; presenter labels for those tokens already exist in the snapshot             |
| `observed_at` label               | receive time, not device clock                           | morning device clock was untrustworthy (**measured** 2023-12-20)                         |

This example row is evidence of a mapping. It has **not** been submitted to Verdant.

### 7.3 What this path cannot carry (stop and ask)

- Fan level and light level: not seen on this Pro (**NOT_MEASURED**), and they have no CSV sensor column in the snapshot. If they appear later, they are device-reported equipment state, never a command — stop and ask.
- PPFD: not seen. Must be a real measurement, never synthesized from a light percentage.
- A new canonical `source` value such as `spider_farmer_ble`: the path will not accept it. Do not add one. Do not change schema, RLS, edge functions, or auth.
- Accessory (`00 02`) payloads: no plaintext JSON (**measured**). Do not decrypt to fill a CSV.

---

## 8. Still NOT_MEASURED

- Zones other than zone 1, and the shape of `data` when several zones have sensors.
- Whether one Pro can feed several tents.
- Fan, light, CO2, PPFD, soil.
- A completed 6-minute (or longer) zone-1 cadence with a script footer; the captured window is 255 seconds.
- Cause of the 11:43:15 AM CST process stop.
- Reconnect after a controller power-cycle (the 32-minute empty-sensor listen held one connection; that is not a power-cycle test).
- Per-message `getSysSta` gaps in the zone-1 window.
- Whether the device clock was later set closer to wall time (morning listens: 2023-12-20). Continue to use receive time until that is checked.
- Firmware versions of in-range accessories, and any plaintext on `00 02`.
- Official-app CSV export, USB-hub, and micro SD contents (intentionally unused).
- Production ingestion, idempotent replay into Verdant, or a draft PR (not opened as of this file).

---

## 9. Attribution

| Session              | Window (CST, 2026-11-12)                               | What was measured                                                                                                                                      |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Photo + literature   | morning, before 5 AM                                   | On-screen firmware 2.17, clock 2023-12-20; community licenses; Verdant CSV path snapshot                                                               |
| ICB 90 s × 2         | ~5:03–5:09 AM                                          | GATT `00FF`, MTU 500, FF01 notify, FF02 present not written, plaintext `getDevSta` with empty `data`, reassembled `getSysSta` catalog, framing `00 01` |
| Accessories          | 5:10–5:16 AM                                           | Same GATT; framing `00 02`; zero plaintext JSON                                                                                                        |
| 32-minute ICB listen | 10:14:31–10:46:46 AM                                   | 319 empty `getDevSta`, 191 `getSysSta`, 0 disconnects, 0 stale; no zone or sensor fields                                                               |
| Zone-1 ICB listen    | 11:39:19–11:43:14 AM (process stopped 11:43:15, 255 s) | 40 non-empty `getDevSta` (0 empty), 24 `getSysSta`; zone-1 temp / humidity / VPD; units owner-confirmed                                                |

Older literature is not a substitute for a field that was not seen on this equipment. Labeled synthetic fixtures, if used later in tests, never prove this controller's behavior.

**Next step (plan):** a smallest-change **draft** PR, through an authorized CloudAgent only, that maps these measured zone-1 fields onto the existing CSV path, with the redaction and holds in this file. Independent review is required. This seat never reviews, approves, or merges its own work. Never merge. Opening that PR waits on an explicit go-ahead.

---

_End of proof. Written 2026-11-12, afternoon CST, from the measured listens and the owner's unit confirmation. Not a production ingest._
