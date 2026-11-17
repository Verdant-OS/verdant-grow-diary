# Step 1 — Spider Farmer GGS BLE Protocol: Literature Review (Field Log)

> **Filing note (2026-11-17).** Filed as written on 2026-11-12. Two statements are out of date. §8 says Verdant has no BLE listener and no FF01 parser: a read-only capture kit has been at `tools/ggs-ble-testbench/` since PR #203, and a receive-only CSV bridge merged as PR #2978 (`tools/ggs-ble-csv-bridge/`). §5 and §9 list measurements still to take: the receive-only listens that followed are in [`spider-farmer-ggs-pro-receive-only-proof-2026-11-12.md`](spider-farmer-ggs-pro-receive-only-proof-2026-11-12.md).

- **Prepared:** Thu 2026-11-12, ~04:45–05:30 CST (America/Chicago)
- **Scope:** Public community repos only. No hardware access, no writes, no app decompilation, no PRs/issues/contact.
- **Subject equipment (Matthew Cheek's Spider Farmer Pro Controller):** **NOTHING in this report is measured on it.** Every Pro-Controller property is **NOT_MEASURED**.

## 0. Labels used

| Label               | Meaning                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **REPO-MEASURED**   | The repo itself presents this as an observation/capture from a named device (e.g. `SF-GGS-CB`). It is _their_ measurement, on _their_ standard GGS Controller — not ours, not a Pro. |
| **INFERRED**        | Derived from reading their code (what the code parses/expects), or from comparing sources. Not stated as a capture.                                                                  |
| **COMMUNITY-CLAIM** | Stated in an issue comment or a third-party README; unverified by us. Not treated as measured.                                                                                       |
| **NOT_MEASURED**    | No source states it, or it concerns the Pro Controller. Must be measured on Cheek's hardware.                                                                                        |

## 1. Sources reviewed (pinned)

| #   | Repo                                            | Visibility | Pinned commit (default `main`)             | Commit time          | Transport it actually documents                                                                            |
| --- | ----------------------------------------------- | ---------- | ------------------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| R1  | `cr0ssn0tice/Spider-Farmer-GGS-Controller-MQTT` | Public     | `e4e4c71b492582943892c513e6c03f909fad2507` | 2025-12-26 14:09 CST | **BLE** (GATT FF01/FF02), plaintext JSON ("v1")                                                            |
| R2  | `cobragt2000/spider_farmer_bridge`              | Public     | `2300c45a13e195b1811e26bfc586c4501c01ccd4` | 2026-11-09 11:41 CST | **NOT BLE.** Wi-Fi: TLS man-in-the-middle of the device→cloud MQTT link (`sf.mqtt.spider-farmer.com:8883`) |

Permalink bases:

- R1: `https://github.com/cr0ssn0tice/Spider-Farmer-GGS-Controller-MQTT/blob/e4e4c71b492582943892c513e6c03f909fad2507/<path>`
- R2: `https://github.com/cobragt2000/spider_farmer_bridge/blob/2300c45a13e195b1811e26bfc586c4501c01ccd4/<path>`

R1 files read in full: `README.md`, `ggs_ble.py`, `ggs_console.py`, `ggs_ff00_sniffer.py`, `SpiderFarmer_GGS_BLE_MQTT_Bridge.ino`. R1 issues #3, #4, #7 and PR #8 were also read (public API).
R2 files read: `LICENSE.md`, `README.md`, `custom_components/sf/proxy/normalizer.py`, `proxy/mqtt_parser.py`, `proxy/mitm_proxy.py` (relevant parts), `tempunits.py`, `entity_defs.py` (units), `tests/test_integration.py` / `tests/test_environment.py` (fixtures), `manifest.json`, bundled third-party license files. I grepped the whole R2 tree for `bluetooth|ble|gatt|ff0x|bleak` (excluding the large compiled JS card). **R2 has no BLE code.**

Secondary sources found by search (license checked, read only as context; see §2.3): `MarcHard-tech/spider-farmer-ggs-ble`, `smurfy/esphome-spiderfarmer_ble`, `1am/spiderwire`, `1am/spiderfarmer-ha`, `matthias1232/spider-farmer-homeassistant`, npm `spider-farmer-client`, plus the official Spider Farmer GGS FAQ / Pro Controller product page.

---

## 2. LICENSE (done first)

### 2.1 R1 — cr0ssn0tice/Spider-Farmer-GGS-Controller-MQTT → **NO LICENSE**

- GitHub repo API: `"license": null`. `GET /repos/.../license` → **404 Not Found**.
- No `LICENSE*` file in the tree (tree is 5 files: README + 4 source files).
- README has no license statement. Its only legal text is a "⚖️ Disclaimer": _"private research and hobby project … Not affiliated with Spider Farmer … Protocol was reverse-engineered … Use at your own risk"_ (`README.md` L244–250).
- **Verdict:** All rights reserved by default. **Do not copy, adapt, or vendor any R1 code** (Python, `.ino`, parser logic, MQTT topic scheme). Only _facts about device behavior_ that R1 documents (UUIDs, JSON key names, framing observations) may inform a **clean-room** implementation written from scratch.
- Dependencies R1 relies on (not vendored, just named): `bleak` (Python; MIT per its project, not verified here), ESP32 Arduino core BLE libs, `PubSubClient` (MIT per its project, not verified here). Irrelevant to us if no R1 code is reused.

### 2.2 R2 — cobragt2000/spider_farmer_bridge → **MIT**

- GitHub API: `license.spdx_id = "MIT"`; file `LICENSE.md` (blob `46fc1a7e…`, 1068 bytes).
- Text: _"Copyright (c) 2026 cobragt2000. Permission is hereby granted, free of charge, to any person obtaining a copy … to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies … subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software."_ Warranty disclaimer: _"AS IS, WITHOUT WARRANTY OF ANY KIND."_
- Key terms: copy ✔, modify ✔, commercial use ✔ ("sell"), sublicense ✔; **attribution required** (keep copyright + permission notice in copies/substantial portions); no warranty.
- README L676–678: _"Released under the MIT License — see LICENSE.md."_ `CONTRIBUTING.md` L103–106: contributions under the same license. `card-src/package.json` `"license": "MIT"`.
- README "Credits" (L668–671): _"an independent implementation written from its own packet captures of the Spider Farmer GGS protocol."_
- Bundled third-party material inside R2:
  - `custom_components/sf/cards/three.min.js` — three.js r128, **MIT** (`cards/LICENSE-threejs.txt`).
  - `custom_components/sf/fonts/sf-overlay.ttf` — DejaVu Sans subset under the Bitstream Vera / DejaVu font license (`fonts/LICENSE-DejaVu.txt`); renamed as that license requires.
  - `card-src` deps: `lit`, `custom-card-helpers`, rollup/typescript tooling (licenses not individually verified; irrelevant to a BLE bridge).
  - ⚠️ `custom_components/sf/certs/server_key.pem`, `server.pem`, `ca.pem`, `upstream_ca/upstream_ca.pem` — a **private key and certificates committed to the repo** for the TLS MITM. **Do not copy, use, or reference these.** They're also irrelevant to a read-only BLE bridge.
- **Verdict:** R2 code _may_ legally be reused with MIT attribution, **but R2 is not a BLE implementation**, so very little is relevant. What it adds is a much larger catalog of `getDevSta` JSON key names/meanings, observed over the Wi-Fi/MQTT transport. Reusing those facts as documentation needs no license. If any code is ever adapted, keep the MIT notice.

### 2.3 Secondary repos (context only; license checked via GitHub API on 2026-11-12)

| Repo                                       | License (API)                                                         | Use                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `MarcHard-tech/spider-farmer-ggs-ble`      | **None** (README: "Provided as-is, with no warranty and no support.") | Facts only. **No code reuse.**                                                          |
| `smurfy/esphome-spiderfarmer_ble`          | GPL-3.0                                                               | Copyleft. Avoid code reuse unless we accept GPL. Facts only.                            |
| `1am/spiderwire`, `1am/spiderfarmer-ha`    | MIT                                                                   | RS-485/Modbus wired bus, **not BLE**. Not relevant.                                     |
| `matthias1232/spider-farmer-homeassistant` | GPL-3.0                                                               | Uses BLE only to _write_ Wi-Fi credentials (`setWifi`). Not a model for us. Facts only. |
| npm `spider-farmer-client` 0.0.2           | MIT (registry field)                                                  | Not read in depth (search summary only).                                                |

### 2.4 Hard exclusions (all sources)

- ⚠️ **AES key/IV.** MarcHard-tech (no license) and R1 issue #7 say the newer-firmware BLE payload is AES-128-CBC with a key/IV "compiled into the Android app", **recovered by decompiling the vendor app**. smurfy's README says the user must supply a key/IV themselves. Those key/IV values are Spider Farmer's material extracted from its app. **Do not fetch, copy, store, or use them.** That would mean copying from the official app, which is out of bounds. I didn't open `protocol.py` and haven't recorded any key.
- Don't copy Spider Farmer app code, screens, assets, names, or branding as reusable material. Device advertising names such as `SF-GGS-CB` appear here **only as identifiers to match during measurement**, not as assets.

---

## 3. PROTOCOL EXTRACTION

### 3.1 BLE advertisement / service UUID

| Claim                                                                                                                                                                                         | Source                                                              | Label                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| Primary service `0000ff00-0000-1000-8000-00805f9b34fb` ("Primary GGS Service"), "identified and verified"                                                                                     | R1 `README.md` L74–81                                               | REPO-MEASURED (their GGS `SF-GGS-CB`) |
| Service constant `UUID_SVC_CUSTOM = "000000ff-0000-1000-8000-00805f9b34fb"` with comment "Custom-Service 0x00FF". The script **only warns** if it's missing and carries on (L46–49)           | R1 `ggs_ble.py` L6–7, L46–49                                        | INFERRED (code constant)              |
| The ESP32 sketch has **no service UUID**. It walks _all_ services looking for characteristic FF01                                                                                             | R1 `SpiderFarmer_GGS_BLE_MQTT_Bridge.ino` L164–170                  | INFERRED                              |
| Advertised device name `SF-GGS-CB`; scripts match on name                                                                                                                                     | R1 `README.md` L45; `ggs_ff00_sniffer.py` L5, L24; `ggs_ble.py` L11 | REPO-MEASURED (name)                  |
| Whether FF00 appears **in the advertisement packet** (vs only in GATT discovery after connecting)                                                                                             | Not stated anywhere in R1                                           | **NOT_MEASURED**                      |
| Other services                                                                                                                                                                                | Not listed in R1                                                    | **NOT_MEASURED**                      |
| R2                                                                                                                                                                                            | No BLE at all                                                       | n/a                                   |
| Secondary: MarcHard says "Service `0xFF00`"; matthias1232 says "setup service (`0x00FF`)"; smurfy lists other advertised names `SF-GGS-PS5`, `SF-GGS-PS10`, `SF-GGS-LC` (power strips, light) | secondary READMEs                                                   | COMMUNITY-CLAIM                       |
| Passive BLE scanning may not get the name (scan-response data)                                                                                                                                | MarcHard README                                                     | COMMUNITY-CLAIM                       |

**→ Conflict C1 (see §4): FF00 vs 00FF.** R1 disagrees with itself (README vs `ggs_ble.py`).

### 3.2 Characteristics: who reads, who writes

| UUID          | R1 README purpose                                                                  | Label           |
| ------------- | ---------------------------------------------------------------------------------- | --------------- |
| `0000ff01-…`  | "Status Notifications, Device → Client"                                            | REPO-MEASURED   |
| `0000ff02-…`  | "Command Write, Client → Device"                                                   | REPO-MEASURED   |
| CCCD `0x2902` | Sketch writes `{0x01,0x00}` to enable notifications (`.ino` L177–185; README L233) | INFERRED (code) |

Per-file behavior (⚠️ = **writes to the controller**):

| File                                      | Subscribes FF01 | Writes FF02                                | What it writes                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | --------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 `ggs_ff00_sniffer.py`                  | ✔ (L41)         | ✘ (`UUID_WRITE` defined L7 but never used) | — **receive-only**                                                                                                                                                                                                                                                                                                          |
| R1 `SpiderFarmer_GGS_BLE_MQTT_Bridge.ino` | ✔ (L178)        | ✘                                          | Only the CCCD descriptor (`0x2902`) + MTU request 517 (L143). **No FF02 writes.**                                                                                                                                                                                                                                           |
| R1 `ggs_ble.py`                           | ✔ (L55)         | ⚠️ ✔ (L57–61, write-with-response)         | `{"method":"getDevSta"}` (L65, L79). ⚠️ **`setLight` {on, level}** (L70–75)                                                                                                                                                                                                                                                 |
| R1 `ggs_console.py`                       | ✔ (L24)         | ⚠️ ✔ (L75–79, write-without-response)      | ⚠️ `setLight`, `setFan`, `setBlower` (L45–68). Note: the `light <n>` command ignores `<n>` and always sends level 20 (L47–53)                                                                                                                                                                                               |
| R2 (Wi-Fi MITM)                           | n/a             | n/a                                        | ⚠️ Injects commands into the device's MQTT downlink (`SF/GGS/{prefix}/API/DOWN/{MAC}`) when "Allow device control" is on (default off per README). **Also injects `getDevSta`/`getConfigField`/`getAlarmLog`/`getDevOpLog`/`setDevTimezone` polls regardless** (`proxy/mitm_proxy.py` L330–346, L386–398, L558–716, L1113+) |

**Our policy:** subscribe to FF01 only (enabling notifications needs a CCCD descriptor write, which is a GATT client-config write, not a controller command). **Never write FF02.** That rules out R1's `getDevSta` _request_, so we depend on unsolicited notifications (§3.5).

### 3.3 Notification payload format (framing)

| Claim                                                                                                                                                                                                                                                                                           | Source                                                                             | Label                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Payloads are plain, unencrypted JSON                                                                                                                                                                                                                                                            | R1 `README.md` L21, L111–112                                                       | REPO-MEASURED (firmware version **not stated**)                                                                    |
| Messages may arrive fragmented across multiple notifications                                                                                                                                                                                                                                    | R1 `README.md` L113, L133                                                          | REPO-MEASURED                                                                                                      |
| "Binary garbage bytes may precede valid JSON" / "proprietary binary headers"                                                                                                                                                                                                                    | R1 `README.md` L114, L136–137                                                      | REPO-MEASURED                                                                                                      |
| Reassembly heuristic: keep only printable ASCII 32–126 from each notification, append to a buffer, and process once the buffer contains `fan"` **and** `}}`. Reset if over 2500 chars                                                                                                           | R1 `.ino` L122–137                                                                 | INFERRED (a heuristic, not a framing spec. It would miss frames with no `fan` block, and it drops non-ASCII UTF-8) |
| Alternative: slice from the first `{` and `json.loads` a single notification                                                                                                                                                                                                                    | R1 `ggs_console.py` L11–13                                                         | INFERRED                                                                                                           |
| Encoding: `ggs_ble.py` / sniffer try `utf-8` decode, then fall back to hex                                                                                                                                                                                                                      | R1 `ggs_ble.py` L13–21, sniffer L9–17                                              | INFERRED (UTF-8 not explicitly asserted)                                                                           |
| MTU: the ESP32 requests 517. Typical fragment size not stated                                                                                                                                                                                                                                   | R1 `README.md` L232, `.ino` L143                                                   | INFERRED; fragment size **NOT_MEASURED**                                                                           |
| "v1 header" = 8 bytes `AA AA 00 03 LL LL 00 01` (the "garbage bytes"); later firmware "v2" = 20-byte header (magic, length, version `00 02`, CRC16/MODBUS of whole ciphertext, total length, chunk offset, chunk length) + ciphertext + trailing CRC16/MODBUS, big-endian. Reassemble by offset | R1 **issue #7** (2026-08-18, MarcHard-tech); MarcHard README "Protocol notes (v2)" | COMMUNITY-CLAIM                                                                                                    |
| Newer firmware (reported as 3.14 in Feb 2026; 3.20 built 2026-06-09 in Aug 2026) **encrypts** the payload. Packets start `0xAAAA`, no JSON visible                                                                                                                                              | R1 issues #3, #4 (1am, smurfy), #7                                                 | COMMUNITY-CLAIM                                                                                                    |
| R2 transport framing: MQTT 3.1.1 PUBLISH over TLS. Payload is one JSON object per PUBLISH (no BLE chunking)                                                                                                                                                                                     | R2 `proxy/mqtt_parser.py`; `mitm_proxy.py` L1519–1548 (`json.loads(pkt.message)`)  | INFERRED (different transport)                                                                                     |

### 3.4 `getDevSta` JSON — every field documented or parsed

**Envelope**

| Key      | Meaning per source                                                                    | Type   | Source                                                            | Label                      | Notes                                                                                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `method` | `"getDevSta"` for status                                                              | string | R1 README L91; R2 `mitm_proxy.py` L1519+                          | REPO-MEASURED (R1)         | Other methods named: `getSysSta`, `getConfigField`, `getConfigFile`, `getAlarmLog`, `getDevOpLog` (R2); `setLight`/`setFan`/`setBlower` (R1); `setDevTimezone`, `setDevActive`, `setDevDeactive`, `setMode`, `setOnOff` (R1 issue #4, COMMUNITY-CLAIM) |
| `code`   | 200 in example                                                                        | int    | R1 README L92                                                     | REPO-MEASURED              |                                                                                                                                                                                                                                                        |
| `data`   | payload object                                                                        | object | R1 README L93; R2 `normalizer.py` L343 (`data.get("data", data)`) | REPO-MEASURED              |                                                                                                                                                                                                                                                        |
| `pid`    | Device id. R2 compares it against the MAC; on the wire it **is the device MAC**       | string | R2 `mitm_proxy.py` L1555–1575, L394                               | INFERRED                   | ⚠️ **MAC. Never log/commit.**                                                                                                                                                                                                                          |
| `uid`    | **Account UID** (R2 README L371–373 lists "account UID" among sensitive log contents) | string | R2 `mitm_proxy.py` L395                                           | INFERRED                   | ⚠️ **Account identifier. Never log/commit.**                                                                                                                                                                                                           |
| `msgId`  | ms-epoch string, echoed in replies                                                    | string | R2 `mitm_proxy.py` L393; issue #7                                 | INFERRED / COMMUNITY-CLAIM | Request/response correlation. **Not** a device clock reading                                                                                                                                                                                           |

**`data.sensor`: MEASURED SENSOR values (on their devices)**

| Key              | Meaning                                            | Unit                                                                                                                                               | Type           | Zero valid?                                                                                                                | May be absent?                                                                                      | Source / Label                                                        |
| ---------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `temp`           | Air temperature                                    | **°C on the wire** (R2 `tempunits.py` L3; `normalizer.py` L180). R1 README MQTT table says °C (L215). **No /10 scaling**, already a decimal (23.3) | number (float) | R2 treats an all-zero `temp`/`humi` block as "no probe present" (sensor-less strips report zeros) — `mitm_proxy.py` L58–68 | ✔ Absent during the sensor self-clean cycle (`sensorHeating` present) — R2 `normalizer.py` L404–437 | R1 README L95 (REPO-MEASURED); R2 `normalizer.py` L496–499 (INFERRED) |
| `humi`           | Relative humidity                                  | % (R1 README L216; R2 entity unit `%`)                                                                                                             | number         | same as above                                                                                                              | same as above                                                                                       | R1 L96; R2 L497                                                       |
| `vpd`            | Vapor pressure deficit, **reported by the device** | kPa (R2 `entity_defs.py` L267). R1 README gives **no unit** (L217)                                                                                 | number         | not stated                                                                                                                 | absent during sensor cleaning                                                                       | R1 L97; R2 L498                                                       |
| `co2`            | CO₂                                                | ppm (R2 `entity_defs.py` L260)                                                                                                                     | number         | not stated                                                                                                                 | ✔ only if a CO₂ sensor is present (R2 prunes it when absent)                                        | R2 only (INFERRED). **Not in R1**                                     |
| `ppfd`           | PPFD                                               | µmol/m²/s (R2 `entity_defs.py` L306)                                                                                                               | number         | not stated                                                                                                                 | ✔ only with a PPFD-capable sensor                                                                   | R2 only (INFERRED)                                                    |
| `isDaySensor`    | Day according to the light sensor                  | flag 0/1                                                                                                                                           | int            | ✔ (0 = night)                                                                                                              | ✔                                                                                                   | R2 `normalizer.py` L500–509 (INFERRED)                                |
| `isDayEnvTarget` | Inside the environment day-cycle window            | flag 0/1                                                                                                                                           | int            | ✔                                                                                                                          | ✔                                                                                                   | R2 same (INFERRED) — device state, not a sensor                       |

**`data.sensors[]`: soil probes, MEASURED SENSOR values** (R2 `normalizer.py` L726–745; INFERRED)

- `id`: probe serial, or `"avg"` for the panel average. ⚠️ Serial is an identifier. Redact.
- `tempSoil` (°C on the wire per R2's temp handling; INFERRED), `humiSoil` (water content %, INFERRED from the "WC %" alarm table L194), `ECSoil` (mS/cm per alarm table L195). Each may be absent/None.

**Equipment state blocks: DEVICE-REPORTED STATE, never commands**

| Block.key                                                                               | Meaning                                                                                                                                                 | Unit / range                                       | Source                                                                       | Label                                                                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `fan.on`                                                                                | Circulation fan on/off                                                                                                                                  | 0/1                                                | R1 README L100                                                               | REPO-MEASURED                                                                                     |
| `fan.level`                                                                             | Fan gear                                                                                                                                                | 0–10 (R1 README L218 "0–10"; R2 clamps 0–10, L644) | R1 L101; R2 L635–645                                                         | REPO-MEASURED / INFERRED                                                                          |
| `fan.mOnOff`, `fan.mLevel`                                                              | Alternate names for on/level ("used interchangeably")                                                                                                   | as above                                           | R2 `normalizer.py` L37–43, L639–640; fixture `tests/test_integration.py` L40 | INFERRED — **conflict C3**                                                                        |
| `fan.shakeLevel`                                                                        | Oscillation level                                                                                                                                       | int                                                | R2 L643                                                                      | INFERRED (often only in config responses)                                                         |
| `fan.natural`                                                                           | Natural-wind flag                                                                                                                                       | 0/1                                                | R2 L644                                                                      | INFERRED                                                                                          |
| `fan.modeType`                                                                          | Mode enum (0 Manual, 1 Schedule, 2 Cycle, 3/4/7/8/13 Environment variants)                                                                              | enum                                               | R2 L271–278                                                                  | INFERRED                                                                                          |
| `light.level`                                                                           | Light level                                                                                                                                             | % per R1 MQTT table (L220). R2 clamps 0–100        | R1 README L104; R2 L517–527                                                  | REPO-MEASURED                                                                                     |
| `light.on`                                                                              | Light on/off                                                                                                                                            | 0/1                                                | R1 `.ino` L108 parses it; **not in R1's example payload**                    | INFERRED                                                                                          |
| `light.mOnOff`/`mLevel`, `light.modeType` (0 Manual, 1 Time Slot, 12 PPFD)              | alternates / mode                                                                                                                                       |                                                    | R2 L513–546                                                                  | INFERRED                                                                                          |
| `light2.*`                                                                              | Second light channel                                                                                                                                    | same                                               | R2 L381                                                                      | INFERRED                                                                                          |
| `blower.level` (R1 `.ino` L103), `blower.on`/`mOnOff`/`mLevel`/`modeType` (R2 L588–600) | Exhaust blower                                                                                                                                          | 0–100 %, "25 % floor" (R2 README)                  | R1/R2                                                                        | INFERRED                                                                                          |
| `heater`, `humidifier`, `dehumidifier` `.{on, level, mLevel, mOnOff, modeType, alarm}`  | Climate accessories. `alarm` = water empty / tank full / fault                                                                                          | various                                            | R2 L765–834                                                                  | INFERRED                                                                                          |
| `outlet.O1..O10.{on                                                                     | mOnOff}`, `outlet.psmode`, `outlet.vRms`(V),`outlet.wattP`(W),`outlet.energy`(Wh, R2 shows raw/1000 kWh),`outlet.aRms` (centi-amps, R2 shows raw/100 A) | Power-strip / S-Station outlets & metering         | as noted                                                                     | R2 L691–723                                                                                       | INFERRED — not expected on a controller (R2: "CBs never report an outlet block", `mitm_proxy.py` L44–50) |
| `sensorHeating.{phase, remainTime}`                                                     | Sensor self-clean cycle (phase 1 clean ~2 h, phase 2 cool ~5 min). **While present, air `temp/humi/vpd` are absent**                                    | s                                                  | R2 L404–437                                                                  | INFERRED                                                                                          |
| `sys.{ver, upTime, wifi.{isConnect, rssi}, eth.isConnect}`                              | Firmware version, uptime, link status                                                                                                                   | upTime units not stated                            | R2 L440–466                                                                  | INFERRED. ⚠️ `wifi` block = Wi-Fi status. Do not log beyond the boolean if ever seen; never SSIDs |
| SE-light flat schema (`lightModel`, `brightness`, `mode`, `isForceSlaveMode`)           | Standalone SE light, not a controller                                                                                                                   |                                                    | R2 L348–375                                                                  | INFERRED                                                                                          |

Config-only fields R2 parses from `getConfigField`/`getConfigFile` (`timePeriod`, `cycleTime`, `maxSpeed`, `minSpeed`, `darkTemp`, `offTemp`, `ppfdPeriod`, `target.*`, `alarm.*`, `senConfig`, `calibration`) are **not** `getDevSta` telemetry, and you'd need FF02 writes to request them. They're out of scope.

Data types: R1's example uses JSON numbers (floats for sensors, ints for state). R2 accepts `1/True/"1"/"true"/"on"` as truthy (`normalizer.py` L25), so types may vary by firmware (INFERRED). Exact types on the Pro: **NOT_MEASURED.**

### 3.5 Update rate

- R1: "continuously pushes telemetry" (README L86). **No rate stated** → NOT_MEASURED by R1.
- R2: "GGS controllers report every few seconds" (`mitm_proxy.py` L72), over the MQTT transport. The controller "keeps self-reporting getDevSta on its own heartbeat" (L1227–1228). Default offline timeout 30 s (`const.py` L15–22). INFERRED, no exact number.
- Issue #7 / MarcHard: "Telemetry is entirely unsolicited every ~6 s as getDevSta/getSysSta" over BLE (v2 firmware). COMMUNITY-CLAIM.
- R1 `ggs_ble.py` actively _requests_ `getDevSta` via FF02. We must not, so the unsolicited rate is critical. **NOT_MEASURED on the Pro.**

### 3.6 Device time vs receive time

- No device timestamp field appears in R1's example `getDevSta`, or in any `getDevSta` field R2 parses. INFERRED: **there's no device timestamp in the status payload. Use receive time.**
- Timestamps exist elsewhere: alarm/op-log entries carry `epoch` (R2 converts it as UTC epoch seconds, `normalizer.py` L146–151). `msgId` is a ms-epoch _string_ chosen by the sender.
- Timezone: the controller holds a timezone set via `setDevTimezone {timezone, UTC, gmtoff, POSIX rule}` (R2 `mitm_proxy.py` L1113–1130). A write, so it's out of scope. Pro device-clock behavior: **NOT_MEASURED.**

### 3.7 Device identity fields (names only; no values recorded)

- BLE: advertised name (`SF-GGS-CB` pattern), BLE address. ⚠️ **R1 hard-codes real-looking MAC addresses in `README.md` L46/L205, `.ino` L20, `ggs_ble.py` L89, `ggs_console.py` L5.** I deliberately didn't copy them into this report. Treat them as someone's real identifiers.
- Payload/envelope: `pid` (= device MAC), `uid` (= account UID), soil probe `id` (serial), `sys.ver` (firmware, safe), and the MQTT topic suffix (= MAC, R2 `mitm_proxy.py` L337–340).
- R2 README L371–373 itself warns that logs contain "MAC addresses, account UID, and timezone/locale".
- **Policy:** never commit `pid`, `uid`, BLE address, probe serials, Wi-Fi SSID/password/RSSI-with-SSID, tokens, or certs. Replace them with stable salted hashes or `REDACTED` in any log.

### 3.8 Multiple controllers / tents

- R1: one hard-coded BLE address, one connection, single tent. No multi-controller support. INFERRED.
- R2: multiple devices, one MITM session each, keyed by MAC (`mitm_proxy.py` ProxySession). Logical slots `dp1`, `dp2`, … (README L329–335). INFERRED.
- Single-central limit: "The controller accepts one BLE connection at a time. While Home Assistant is connected, the phone app cannot connect" (MarcHard README) — COMMUNITY-CLAIM. Pro behavior **NOT_MEASURED**.
- **Multi-zone (the Pro's defining feature, up to 8 zones per Spider Farmer):** no reviewed source documents how zones appear in `getDevSta`. **NOT_MEASURED.**

### 3.9 Reconnect / power-cycle

- R1 README L230–234: if BLE connects but there's no data, check the MAC is lowercase, MTU 517, CCCD written; "Power-cycle the GGS controller if needed". REPO-MEASURED (troubleshooting advice).
- R1 `.ino`: on disconnect sets `connected=false`, retries `connectToBLE()` every 10 s (L146–149, L229–235). INFERRED.
- R2: 120 s startup grace, 30 s staleness timeout, devices reconnect themselves after a session is severed (README L349–352; `const.py`). Wi-Fi transport. INFERRED.
- Official FAQ: app BLE drops when the app is closed and reconnects on reopen. Not protocol detail.

### 3.10 GGS vs Pro Controller (and other models)

- **R1 never mentions the Pro Controller.** R1 is about "Spider Farmer GGS Controller", name `SF-GGS-CB`, firmware not stated.
- **R2 never mentions the Pro Controller.** "Pro" in R2 only means **Pro soil probes** (`bus.py` L1876–1884; `entity_defs.py` L973–995) and the SF2000 Pro light. R2's verified-firmware table (README L450–466) lists the display controller (DP-series) fw 3.20, AC5/AC10 3.14, SE4500 1.7, S-Station 1.9. **No Pro Controller.**
- Secondary repos: none mention the Pro Controller. smurfy lists CB / PS5 / PS10 / LC with firmware, and notes the LC data is "quite different" — so schemas do differ by model (COMMUNITY-CLAIM).
- Official Spider Farmer pages (product/marketing, not protocol): the Pro Controller has a touchscreen, supports **up to 8 independent zones, each with its own sensor and up to 20 devices**, and supports Bluetooth & Wi-Fi app control (spider-farmer.com GGS FAQ Q11, Q17; Pro Controller Kit product page). That points to a different, probably per-zone, status structure, but **nobody documents it**.
- **Status: no public reference documents the Pro Controller's BLE service, characteristics, advertised name, framing, encryption, or `getDevSta` schema. All NOT_MEASURED.**

### 3.11 Official API

- R1 README: cloud not required. BLE is "the primary control and telemetry channel" (L58–70). No official API cited.
- R2 README: "No cloud API" (L22). Works by intercepting the device's own cloud TLS.
- Spider Farmer official FAQ Q31–Q32: "GGS is a closed ecosystem … does not integrate with … smart home platforms … operates through the Spider Farmer APP only."
- 1am (issue #4, 2026-05-11): Spider Farmer "were not interested in getting involved." COMMUNITY-CLAIM.
- **Conclusion: no official public API or protocol documentation exists.** All protocol knowledge comes from reverse engineering.

---

## 4. CONFLICTS (both sides; no winner picked)

| #   | Topic                       | Claim A                                                                                    | Claim B                                                                                                                                                              |
| --- | --------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Service UUID                | R1 `README.md` L79 and MarcHard README: **`0000ff00-…` / `0xFF00`**                        | R1 `ggs_ble.py` L6–7: **`000000ff-…` ("0x00FF")**; matthias1232 README: "setup service (`0x00FF`)". R1's code only warns if it's missing                             |
| C2  | Encryption                  | R1 README L21, L111–112 (no firmware version given): plaintext, "No encryption or signing" | R1 issues #3/#4 (fw 3.14, Feb 2026) and #7 (fw 3.20, Aug 2026): payload encrypted, `AA AA` header, no JSON visible                                                   |
| C3  | Equipment key names         | R1 README example / `.ino`: `on`, `level`                                                  | R2 `normalizer.py` L37–43 and fixtures: `mOnOff`, `mLevel` "used interchangeably" with `on`/`level`                                                                  |
| C4  | How status is obtained      | R1 README L86: device "continuously pushes"; issue #7: unsolicited ~6 s                    | R1 `ggs_ble.py` L63–66, L77–79 actively writes `{"method":"getDevSta"}` to FF02 to "pull" status                                                                     |
| C5  | JSON completeness heuristic | R1 `.ino`: wait for `fan"` + `}}` (ASCII-filter all bytes)                                 | R1 `ggs_console.py`: parse each notification from the first `{`. Issue #7: fixed 8/20-byte header with length/offset fields (strip the header, reassemble by offset) |
| C6  | `light.on` presence         | R1 README example `light` has only `level`                                                 | R1 `.ino` L108 and README MQTT table L221 expect `light.on`                                                                                                          |
| C7  | VPD unit                    | R1 README: no unit                                                                         | R2 `entity_defs.py` L267: kPa                                                                                                                                        |

---

## 5. WHAT WE STILL NEED TO MEASURE on Cheek's Pro Controller (plan only, nothing done)

### 5.1 Questions to answer (all currently NOT_MEASURED)

1. **Model identity:** advertised local name (is it `SF-GGS-CB` or something else?), firmware version (`sys.ver` if it appears unsolicited; otherwise read from the device's own touchscreen/About screen, never by writing).
2. **Advertisement:** which service UUIDs (if any) are in the advertisement/scan response, and is FF00 or 00FF present?
3. **GATT layout (discovery only, no writes):** full list of services/characteristics with properties. Does `0000ff01` exist with NOTIFY? Does `0000ff02` exist (record it, never write it)?
4. **FF01 content:** plaintext JSON, or the `AA AA 00 03 … 00 01` (v1) header + JSON, or `… 00 02` (v2) header + ciphertext? If it's v2 ciphertext, **stop.** Decryption would need key material from the vendor app, which is out of bounds. Report it as a blocker.
5. **Fragmentation:** negotiated MTU, notification sizes, how many notifications per message, how a message boundary is recognized (length field vs brace balance).
6. **Unsolicited rate:** do status frames arrive _without_ any FF02 write? Interval (mean/min/max) over at least 30 min. Which `method` values appear (`getDevSta`, `getSysSta`, other)?
7. **Field list:** every JSON key path present, per frame type; JSON types; observed ranges; which keys are sometimes absent.
8. **Zones:** how the 8-zone model appears (per-zone arrays/objects? zone ids?). Which zone the tent's sensor belongs to.
9. **Units:** confirm temp is °C, humidity %, VPD kPa by comparing with the Pro's own touchscreen readings at the same moment (visual cross-check, no app copy).
10. **Device time:** is there any timestamp/epoch field in the status frames? If so, the offset from receive time.
11. **Connection behavior:** does the Pro allow our central while the phone app is connected? What happens on power-cycle and BLE reconnect (time to first frame)?

### 5.2 Receive-only procedure (to run later, with the owner present)

1. Close the Spider Farmer app on all phones (single-central claim).
2. Passive/active **scan** only. Log advertised name, RSSI, service UUIDs, manufacturer-data _length_ (not contents if it could hold identifiers). Address kept in memory only, never written to disk.
3. Connect. Run **GATT discovery** (read-only enumeration). Log UUIDs + properties.
4. Request MTU (e.g. 517). Log the negotiated value.
5. **Enable notifications on FF01 only** (the standard CCCD subscribe). **No write to FF02 or any other characteristic or descriptor.** No reads of characteristics beyond discovery unless explicitly approved.
6. Record notifications for at least 30 minutes, plus one controlled power-cycle and one BLE disconnect/reconnect.
7. Never: write FF02, send `getDevSta`/`set*`, cloud-redirect/DNS/MITM, reflash or downgrade firmware, decompile or copy the official app, or use extracted keys.
8. Process locally: classify each notification (header bytes pattern, length), attempt plain UTF-8 JSON parse only, and produce the redacted summary below.

### 5.3 Safe capture log: MUST contain

- Capture start/end time (CST label), tool + version, OS/adapter model, negotiated MTU.
- Advertised name pattern, service/characteristic UUIDs + properties.
- Per notification: receive timestamp, length, first 8–20 header bytes **only if** they're protocol constants (magic/version/length/offset), and a classification (plaintext-JSON / v1-header-JSON / v2-ciphertext / other).
- Reassembled messages: `method`, key paths, JSON types, value ranges/statistics for sensor fields, absent-key counts, inter-arrival statistics.
- Equipment-state fields labelled **state (read-only)**, never treated as commands.

### 5.4 Safe capture log: MUST NOT contain

- BLE/Wi-Fi MAC addresses, `pid`, `uid`, `msgId` values tied to an account, soil probe serials (replace with `REDACTED` or a salted hash).
- Wi-Fi SSID, password, RSSI-with-SSID, IP addresses, tokens, certificates, cloud credentials, any key/IV.
- Raw ciphertext dumps (no use to us, and they invite decryption attempts).
- Any official-app screenshots, code, assets, or branding.

---

## 6. Completed actions vs facts vs assumptions

**Completed actions (this session):** fetched GitHub repo metadata + license API for R1/R2 and 6 secondary repos/packages. Downloaded public tarballs of R1/R2 at the pinned SHAs into `/workspace/northern-lights/src/` (local reading copies, not reused). Read R1 issues #3, #4, #7 and PR #8 via the public API. Ran web searches on the Pro Controller. Wrote this report. **Not done:** no hardware access, no PRs/issues/comments, no contact with anyone, no private repos, no app decompilation, no key retrieval.

**Facts (as sourced, per labels above):** R1 has no license; R2 is MIT. R1 documents FF01 notify / FF02 write on a standard GGS (`SF-GGS-CB`). R2 is Wi-Fi MITM, not BLE. Neither mentions the Pro Controller.

**Assumptions (flagged, unverified):** that the Pro speaks the same JSON command set as the GGS; that `getDevSta` arrives unsolicited on the Pro; that the Pro's current firmware is plaintext. **All three are NOT_MEASURED.** Given the 2026 encryption reports, plaintext on current Pro firmware is doubtful (inference, not fact).

**Note for owner (observation, no action taken):** R1 has a public pull request **#8 "Cursor/phase1 aaaa frame codec 419e"** from the account `cheekhimself` (branch `cursor/phase1-aaaa-frame-codec-419e`), opened 2026-09-16 and **closed unmerged 2026-11-04 16:13 CST**. If that's the owner's account, it's an existing outbound contribution to an unlicensed repo. I left it alone.

---

## 7. Owner photo and statements (added 2026-11-12, after the literature review)

**MEASURED from the owner's photo of the controller's System Settings screen:**

- Title bar: "GGS Pro Controller". This unit brands itself as GGS Pro. That is a naming fact, not BLE-protocol proof.
- Firmware Update row displays **2.17**.
- Other visible rows: Restore Factory Settings, Bind APP Account, Product Code. The Product Code value is omitted from this report (it looks like a device identifier). It will not be committed, logged, or handed off.
- On-screen clock: **2023-12-20 PM 12:04:53**.
- Bezel: Spider Farmer. Left nav: Basic Settings, System Settings (selected), Planting Template.

**OWNER STATEMENT (not independently measured):** this is a Spider Farmer Pro GGS controller; it has **not** been connected to the internet; firmware has **not** been updated. So 2.17 is the version as found.

**INFERRED:** the 2023-12-20 clock is consistent with a unit that was never online and whose clock was never set. It is **not** a firmware-release date. If a status payload ever includes a device timestamp, do not trust it on this unit until the clock is known to be correct. Prefer receive time, and label which one was used.

**INFERRED, still NOT_MEASURED for this unit:** community reports say BLE payloads became encrypted at firmware **3.14** (reported Feb 2026) and **3.20** (built 2026-06-09, described in R1 issue #7, Aug 2026). Firmware **2.17 is older than those**. Combined with "updates are optional and not automatic" (issue #7, COMMUNITY-CLAIM), this unit is **more likely** to still send plaintext JSON than a current retail unit on 3.14+. That is an inference, not a measurement. The only way to know is a receive-only FF01 listen.

**Hard limits restated:** never write to the controller (no FF02, no `getDevSta` request, no `set*`); never Bind APP Account; never Restore Factory Settings; never connect it to the internet, cloud-redirect, or update/reflash firmware as part of this work. Leaving it on 2.17 is the right call.

Firmware **2.17 itself is not mentioned** in R1, R2, or the secondary repos reviewed. NOT_MEASURED how 2.17 frames or encrypts.

---

## 8. Verdant-OS/verdant-grow-diary (read-only, default branch)

- Repo is public. Default branch: `verdant-grow-diary`.
- Tip SHA **measured** 2026-11-12: `58286d66fb8ed7380977c25d5301ec7e4a882512` (commit 2026-11-12 04:19 AM CST). Docs below were fetched at that SHA (and matched the earlier code-search index SHA `d9fc27721c4a7b0fbebd174c13c4cbc2bd44003c` for these files).

**CSV sensor import path exists.** That is the required output door. Key files:

- `docs/csv-sensor-schema-mapping.md`
- `docs/sensor-ingest-provenance.md`
- `docs/sensor-ingest-payload-contract.md`
- `src/lib/sensorImportSourceApps.ts` — actual import writer
- `src/lib/csvMappingTemplates.ts`, `src/lib/csvRowValidationRules.ts`
- `scripts/audit-csv-source-allow-list.ts`

**Source-label conflict (must follow the repo, not the agent brief's `source = spider_farmer_ble`):**

- Canonical `sensor_readings.source` is locked to `live | manual | csv | demo | stale | invalid` (`docs/sensor-ingest-provenance.md`). `spider_farmer_ble`, `spider_farmer_ggs`, and `ble` are explicitly listed as **non-canonical** — do not write them into `source`.
- The CSV import writer (`sensorImportSourceApps.ts`) emits canonical **`source = "csv"`** and stores vendor identity in `source_app`. Comment in the allow-list audit script: `csv` is the "adapter target — Spider Farmer / Vivosun / new path".
- CSV rows **must never display as `live`**. Freshness/`live` is derived on read.
- Planned mapping, using the existing path with **no schema change**:
  - `source` = `csv`
  - provenance in `raw_payload`: `source_app` / vendor `spider_farmer` (or `spider_farmer_ggs`), `transport` = `ble` (or similar safe token). Display labels for `spider_farmer`, `spider_farmer_ggs`, `ggs_controller`, and `ble` already exist in `sensorProviderLabels.ts` and `sensorSourceDisplayCanon.ts`.
- There is already a **Spider Farmer CSV template** in `sensorImportSourceApps.ts` (`SourceAppId = "spider_farmer"`), which looks for THP-style export headers (`deviceSerialnum`, `temperature(°C)`). That is an official-app-style **CSV export**, not a BLE bridge. Our bridge should emit a clean Verdant CSV (timestamp, temp, humidity, VPD, source, vendor / raw provenance), not mimic those export headers, and must never copy a device serial into the file.

**What the CSV path can carry (measured from contract + import code):**

- Temperature (the writer prefers `temp_f` after conversion; °C on the wire is accepted and converted). Community GGS refs say temp is °C — convert and record provenance.
- Humidity (`humidity` / `humidity_pct`), **VPD** (`vpd_kpa` — supported in the writer, templates, validation, and payload contract; the shorter schema-mapping doc's column table omits it, but the code does not).
- Payload contract: VPD is "computed by the bridge OR by Verdant from temp+RH. **Never both.**" If the controller reports VPD, use that measured value and do not also compute one.
- CO₂ and PPFD if present. PPFD must be a real PPFD reading — **never** synthesize it from a light-level percentage.
- `captured_at`: ISO 8601 with timezone. On this unit, use **receive time** and label it (device clock is wrong).

**What the CSV path cannot carry:**

- Fan level, light level, blower, and other **equipment state**. No CSV sensor columns for them. Record them in a local receive-only log as device-reported state, never as commands, and never as sensor readings. If they need to appear in Verdant, that would be a new path — **stop and ask** rather than invent a schema.
- `source = spider_farmer_ble` as the `source` column.

**Not in Verdant today:** no BLE listener, no Spider Farmer controller ingest, no FF01 parser. EcoWitt live ingest (#2717 / #2750) is a separate job (Sour Tangie). Shelly H&T is retired. Issue #2788 is a tent-brand typo ("Spider Far,er"), unrelated to protocol.

**No official GGS API** is assumed; provenance docs mention a hypothetical "Spider Farmer GGS API" as an example only. That is not a measured API.

---

## 9. Revised next step

1. Do **not** build or open a PR until a receive-only measurement exists, or the owner explicitly accepts a clean-room scaffold with all Pro behavior still labeled NOT_MEASURED.
2. Next measurement: on a computer in Bluetooth range, with the owner's go-ahead for that session. Subscribe to FF01 only (CCCD notify). Never write FF02. Close the vendor app first (single-central claim is COMMUNITY-CLAIM). Capture a redacted field list, framing, rate, and whether the payload is plaintext. Never record MACs, Product Code, `pid`, `uid`, or Wi-Fi.
3. If the payload is v2 ciphertext, **stop**. Do not decrypt with vendor-app keys.
4. If plaintext `getDevSta` arrives unsolicited, write a clean-room bridge (no R1 code) that emits Verdant CSV as mapped in §8, plus tests, as a **draft PR**. Independent review required. Never merge.
