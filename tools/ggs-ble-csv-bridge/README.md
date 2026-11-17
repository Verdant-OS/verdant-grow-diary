# GGS status notifications to CSV

Receive-only local tool. It listens for status notifications and saves one CSV
row per status snapshot per tent. The CSV is for Verdant's existing sensor CSV
import. The `source` cell is `csv`.

This directory is separate from `tools/ggs-ble-testbench`. That kit follows an
older community service UUID. This tool uses the service UUID measured on the
owner's unit: `000000ff-0000-1000-8000-00805f9b34fb`. Notifications are taken
from characteristic `0000ff01-0000-1000-8000-00805f9b34fb` only.

## What it does not do

- It does not send status requests or setting changes.
- It does not write any characteristic.
- It does not decrypt version `00 02` frames. Those frames are counted and dropped.
- It does not open a cloud, MQTT, or firmware session.
- It does not emit fan level or light level. The existing CSV path has no columns for them.
- It does not accept a zone other than zone 1. Zones 2–8 were not measured.

Synthetic fixtures under `fixtures/` are labeled synthetic. They do not prove
behavior on a controller. This code has not been run against hardware.

## Map file

The grower supplies the controller-to-tent map. An advertised name that is not
in the map is skipped. The tool does not guess a tent.

```json
{
  "timezone": "America/Chicago",
  "stale_after_seconds": 30,
  "trust_device_clock": false,
  "controllers": [
    {
      "advertised_name": "SYNTHETIC-CONTROLLER-A",
      "alias": "synthetic-alias-a",
      "tent_id": "synthetic-tent-alpha",
      "zone": "zone1"
    }
  ]
}
```

`alias` is a local name. Do not put a hardware address there. `trust_device_clock`
stays false unless the grower has checked the controller clock. The default
observation time is the time the notification was received. `stale_after_seconds`
defaults to 30.

## Run

```bash
python3 -m pip install -r tools/ggs-ble-csv-bridge/requirements.txt
python3 tools/ggs-ble-csv-bridge/ggs_ble_csv_bridge.py \
  --map controllers.json \
  --out snapshots.csv \
  --duration 120
```

`--duration` is required and must be at most 3600 seconds.

Import `snapshots.csv` with the existing environment CSV import, and choose the
tent that matches `tent_id`. The importer stores the tent the grower selects.
The `tent_id` cell is kept on the raw row; it does not by itself choose the tent.

## Columns

`timestamp`, `temp_c`, `humidity`, `vpd`, `source`, `tent_id`, `timezone`,
`observed_at`, `ingested_at`, `device_alias`, `time_basis`, `source_app`,
`transport`, `reading_flags`, `raw_payload`.

`source` is `csv`. `source_app` is `spider_farmer_ggs`. `transport` is `ble`.
`time_basis` is `receive` or `device`. The snapshot value is the zone average
(`avg1`). A second sensor object in the same notification is not a second row.
Zero is kept. An empty `data` object produces no row. `reading_flags` may
include `stale`, `temp_out_of_range`, `humidity_out_of_range`,
`vpd_out_of_range`, or a `*_non_finite` flag. The tool does not fill gaps, and
it does not add a computed VPD beside the device VPD.

Identifier fields from the notification are not copied into the CSV.
`raw_payload` is a small redacted summary.
