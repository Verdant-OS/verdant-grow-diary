# Spider Farmer GGS — read-only BLE capture testbench

**Transport-ladder rung 1.** This kit connects to a Spider Farmer GGS grow-room
controller over **Bluetooth Low Energy (BLE)**, subscribes to its status
notifications, reassembles the JSON telemetry frames, and writes each observed
frame to a capture log — so we can **observe the real payload shape on a
confirmed controller in a real tent before any Verdant code path treats the
data as truthful.**

It is the hardware-facing companion to the already-locked ADR
[`docs/integrations/spider-farmer-ggs-transport-ladder.md`](../../docs/integrations/spider-farmer-ggs-transport-ladder.md)
and inherits every one of its read-only constraints. Nothing here implies a
Spider Farmer partnership; the GGS integration is experimental research.

## Read-only, always

- Subscribes to the **status-notify** characteristic only.
- **Never** writes any characteristic. The command-write UUID exists in the
  code solely so the tool can refuse it. No setpoints, no commands, no
  light/fan control, no pairing writes.
- The BLE device address (MAC) is **redacted** to a short salted hash in the
  capture log — captures are shareable evidence, and a MAC is a device
  identifier we don't paste into shared artifacts (same discipline as the
  EcoWitt kit-fix redaction).
- BLE-derived data is **`source=demo`** in the mapping helper — always. A
  `source=live` adapter is a separate, gated slice (ladder rung 3) that must
  first validate the controller model, units, and freshness.

`test_ggs_ble_readonly_safety.py` pins all of the above so a future edit can't
quietly introduce a write path.

## BLE protocol

Reverse-engineered by the community project
[**cr0ssn0tice/Spider-Farmer-GGS-Controller-MQTT**](https://github.com/cr0ssn0tice/Spider-Farmer-GGS-Controller-MQTT)
("Local BLE Reverse Engineering & Cloud-Free Integration"), validated there
with Python + [`bleak`]. Confirm the details against **your own** controller
and firmware before trusting them — that is the entire point of rung 1.

| UUID                                   | Role                                   | This tool                 |
| -------------------------------------- | -------------------------------------- | ------------------------- |
| `0000ff00-0000-1000-8000-00805f9b34fb` | Primary GGS service                    | discover / filter         |
| `0000ff01-0000-1000-8000-00805f9b34fb` | Status notifications (device → client) | **subscribe (read-only)** |
| `0000ff02-0000-1000-8000-00805f9b34fb` | Command write (client → device)        | **never touched**         |

**Framing.** Notifications carry _plain JSON_, but the raw stream is messy in
two ways the parser must handle (see `ggs_ble_frame.py`):

- binary/garbage bytes may **precede** a valid object, and
- a single JSON object may **span multiple** notification packets.

No encryption, no signing, no auth handshake are documented. Observed frame:

```json
{
  "sensor": { "temp": 23.3, "humi": 37.7, "vpd": 1.78 },
  "fan": { "on": 1, "level": 5 },
  "light": { "level": 26 }
}
```

## How it maps to Verdant

Verdant's normalizer (`src/lib/spiderFarmerGgsMappingRules.ts`) reads a **flat**
draft input. `ggs_ble_map.py` bridges the nested BLE frame to it:

| BLE frame        | Verdant draft key                       | Notes                                                            |
| ---------------- | --------------------------------------- | ---------------------------------------------------------------- |
| `sensor.temp`    | `temp_c` (or `temp_f` with `--units F`) | **Verify the app's display unit**                                |
| `sensor.humi`    | `humidity`                              | percent RH                                                       |
| `sensor.vpd`     | `vpd_kpa`                               | kPa                                                              |
| `fan.{on,level}` | `fan_state` (string context)            | e.g. `"on, level 5"` — context only, never a command             |
| `light.level`    | `light_state` (string context)          | e.g. `"level 26"`                                                |
| —                | `_verdant_source: "demo"`               | always; no timestamp emitted, so freshness can't read it as live |

## Usage

```bash
pip install -r requirements.txt          # bleak

python ggs_ble_capture.py --scan                     # list BLE devices, exit
python ggs_ble_capture.py --duration 120             # capture 120s to captures/
python ggs_ble_capture.py --name GGS --emit-demo     # + print the demo mapping
python ggs_ble_capture.py --address AA:BB:.. --max-frames 5
```

Works on Windows / macOS / Linux wherever `bleak` has a backend. On Windows,
`start-capture-windows.ps1` wraps the venv + scan + capture. The controller is
BLE 1:1 — **close the Spider Farmer app first** or it will hold the connection.

Capture logs land in `captures/*.jsonl` (git-ignored; addresses redacted).

## Tests (offline, no hardware)

```bash
pytest                     # 27 tests
```

- `test_ggs_ble_frame.py` — reassembler: leading garbage, multi-packet spans,
  brace-in-string safety, multiple frames per chunk, size guards, recovery.
- `test_ggs_ble_map.py` — BLE → Verdant demo mapping, always-demo labeling,
  unit routing, fan/light flattening.
- `test_ggs_ble_readonly_safety.py` — the read-only contract (no gatt writes,
  ff02 only ever refused, single notify target, address redaction).

## Rung 2+ (not in this kit)

Forwarding captured/demo frames into Verdant's ingest, queueing, and any
`source=live` promotion are later, separately-approved slices per the ADR.
This kit stops at **observe + reassemble + map-for-inspection**.

[`bleak`]: https://github.com/hbldh/bleak
