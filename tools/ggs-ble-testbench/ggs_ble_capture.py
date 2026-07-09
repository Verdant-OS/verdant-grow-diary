#!/usr/bin/env python3
"""
Spider Farmer GGS — read-only BLE capture testbench (transport-ladder RUNG 1).

Purpose (from docs/integrations/spider-farmer-ggs-transport-ladder.md):
    "observe the real payload shape on a confirmed controller model, in a real
     tent, before any code path treats the data as truthful."

This tool connects to a Spider Farmer GGS controller over Bluetooth Low
Energy, subscribes to the STATUS NOTIFICATION characteristic ONLY, reassembles
the plain-JSON telemetry frames, and writes each observed frame to a capture
log for inspection. Optionally (`--emit-demo`) it also prints the Verdant
demo-labeled mapping of each frame for eyeballing — it NEVER sends anything to
Verdant's ingest (that is rung 2+, a separate slice).

=========================  HARD SAFETY CONSTRAINTS  =========================
  * READ-ONLY. Subscribes to notifications on 0000ff01 only.
  * NEVER writes the command characteristic 0000ff02 (or any characteristic).
    The write UUID is recorded here solely so the tool can REFUSE it.
  * No setpoints, no commands, no light/fan control, no pairing writes.
  * BLE device address (MAC) is REDACTED to a short salted hash in the shared
    capture log — capture files are meant to be shareable evidence, and a MAC
    is a device identifier we do not paste into shared artifacts (same lesson
    as the EcoWitt kit-fix PASSKEY/MAC redaction).
============================================================================

BLE protocol (reverse-engineered by the community project referenced in
README.md — Spider-Farmer-GGS-Controller-MQTT):
    Service              0000ff00-0000-1000-8000-00805f9b34fb
    Status  (notify)     0000ff01-0000-1000-8000-00805f9b34fb   <- we read this
    Command (write)      0000ff02-0000-1000-8000-00805f9b34fb   <- FORBIDDEN here
    Framing: plain JSON, possibly prefixed by binary garbage and/or split
             across notification packets (see ggs_ble_frame.py).

Requires: Python 3.11+, `bleak` (pip install -r requirements.txt).
Works on Windows / macOS / Linux wherever bleak has a backend.

Examples:
    # Scan for nearby BLE devices (no connection, no writes):
    python ggs_ble_capture.py --scan

    # Capture for 120s from the first device advertising the GGS service:
    python ggs_ble_capture.py --duration 120

    # Target a specific device by name substring, print demo mapping too:
    python ggs_ble_capture.py --name GGS --emit-demo
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

from ggs_ble_frame import GgsFrameReassembler
from ggs_ble_map import map_ble_frame_to_verdant_demo

# Vendor UUIDs (16-bit ff00/ff01/ff02 expanded to the BLE base UUID).
GGS_SERVICE_UUID = "0000ff00-0000-1000-8000-00805f9b34fb"
GGS_STATUS_NOTIFY_UUID = "0000ff01-0000-1000-8000-00805f9b34fb"
# Present ONLY so the tool can assert it is never used. Do not write it.
GGS_COMMAND_WRITE_UUID_FORBIDDEN = "0000ff02-0000-1000-8000-00805f9b34fb"

DEFAULT_CAPTURE_DIR = os.path.join(os.path.dirname(__file__), "captures")


def redact_address(address: str) -> str:
    """MAC -> short salted hash. Stable per-run so frames correlate, but the
    real address never lands in a shareable capture file."""
    if not address:
        return "unknown"
    digest = hashlib.sha256(("ggs-ble:" + address).encode("utf-8")).hexdigest()
    return "dev-" + digest[:10]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _print(msg: str) -> None:
    print(msg, flush=True)


async def scan(timeout: float) -> int:
    from bleak import BleakScanner

    _print(f"Scanning {timeout:.0f}s for BLE devices (read-only, no connection)…")
    devices = await BleakScanner.discover(timeout=timeout, return_adv=True)
    if not devices:
        _print("No BLE devices found.")
        return 0
    for _addr, (dev, adv) in devices.items():
        uuids = [u.lower() for u in (adv.service_uuids or [])]
        is_ggs = GGS_SERVICE_UUID in uuids
        marker = "  <-- advertises GGS service" if is_ggs else ""
        _print(
            f"  {redact_address(dev.address)}  "
            f"name={dev.name or '(none)'}  rssi={adv.rssi}{marker}"
        )
    _print("Done. (Addresses are redacted; use the same host to reconnect.)")
    return 0


async def _pick_device(name: str | None, address: str | None, timeout: float):
    from bleak import BleakScanner

    if address:
        dev = await BleakScanner.find_device_by_address(address, timeout=timeout)
        if dev is None:
            _print(f"No device with that address responded in {timeout:.0f}s.")
        return dev

    _print(f"Discovering a GGS controller ({timeout:.0f}s)…")
    devices = await BleakScanner.discover(timeout=timeout, return_adv=True)
    fallback = None
    for _addr, (dev, adv) in devices.items():
        uuids = [u.lower() for u in (adv.service_uuids or [])]
        if GGS_SERVICE_UUID in uuids:
            return dev
        if name and dev.name and name.lower() in dev.name.lower():
            fallback = fallback or dev
    if fallback is not None:
        _print("No device advertised the GGS service UUID; using name match.")
    return fallback


async def capture(args: argparse.Namespace) -> int:
    from bleak import BleakClient

    dev = await _pick_device(args.name, args.address, args.scan_timeout)
    if dev is None:
        _print(
            "No GGS controller found. Make sure it is powered, in range, and "
            "not currently connected in the Spider Farmer app (BLE is 1:1)."
        )
        return 2

    red = redact_address(dev.address)
    os.makedirs(args.out_dir, exist_ok=True)
    out_path = os.path.join(
        args.out_dir,
        f"ggs-capture-{red}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.jsonl",
    )
    reassembler = GgsFrameReassembler()
    stats = {"frames": 0, "packets": 0}
    stop = asyncio.Event()

    def handle(_char, data: bytearray) -> None:
        stats["packets"] += 1
        for frame in reassembler.feed(bytes(data)):
            stats["frames"] += 1
            record = {
                "received_at": _now_iso(),
                "device": red,  # redacted, never the real MAC
                "frame": frame,
            }
            with open(out_path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(record) + "\n")
            _print(f"[frame {stats['frames']}] {json.dumps(frame)}")
            if args.emit_demo:
                mapped = map_ble_frame_to_verdant_demo(frame, units=args.units)
                _print(f"           demo-mapping -> {json.dumps(mapped)}")
            if args.max_frames and stats["frames"] >= args.max_frames:
                stop.set()

    _print(f"Connecting to {red} (read-only)…")
    async with BleakClient(dev) as client:
        # Defensive: confirm the status characteristic exists and that we are
        # NOT about to touch the command-write characteristic.
        assert GGS_STATUS_NOTIFY_UUID != GGS_COMMAND_WRITE_UUID_FORBIDDEN
        _print(
            f"Subscribing to status notifications {GGS_STATUS_NOTIFY_UUID}.\n"
            f"Command characteristic {GGS_COMMAND_WRITE_UUID_FORBIDDEN} is "
            f"NEVER written by this tool.\n"
            f"Capturing to {out_path}\n"
            f"Press Ctrl+C to stop."
        )
        await client.start_notify(GGS_STATUS_NOTIFY_UUID, handle)
        try:
            if args.duration:
                await asyncio.wait_for(stop.wait(), timeout=args.duration)
            else:
                await stop.wait()
        except asyncio.TimeoutError:
            pass
        except (KeyboardInterrupt, asyncio.CancelledError):
            pass
        finally:
            try:
                await client.stop_notify(GGS_STATUS_NOTIFY_UUID)
            except Exception:
                pass

    _print(
        f"\nCaptured {stats['frames']} JSON frame(s) from {stats['packets']} "
        f"BLE packet(s). Reassembler resets={reassembler.reset_count}, "
        f"dropped_prefix_bytes={reassembler.dropped_prefix_bytes}, "
        f"parse_errors={reassembler.parse_error_count}.\n"
        f"Capture log: {out_path}"
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Read-only Spider Farmer GGS BLE capture (rung 1).",
    )
    p.add_argument("--scan", action="store_true", help="List BLE devices and exit.")
    p.add_argument("--name", default="GGS", help="Device-name substring to match.")
    p.add_argument("--address", default=None, help="Exact BLE address to target.")
    p.add_argument("--duration", type=float, default=0.0,
                   help="Seconds to capture (0 = until Ctrl+C).")
    p.add_argument("--scan-timeout", type=float, default=12.0,
                   help="Seconds to scan while locating the controller.")
    p.add_argument("--max-frames", type=int, default=0,
                   help="Stop after N frames (0 = unlimited).")
    p.add_argument("--emit-demo", action="store_true",
                   help="Also print the Verdant demo-labeled mapping per frame.")
    p.add_argument("--units", choices=["C", "F"], default="C",
                   help="Controller display unit for temperature (default C).")
    p.add_argument("--out-dir", default=DEFAULT_CAPTURE_DIR,
                   help="Directory for capture .jsonl logs.")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        import bleak  # noqa: F401
    except ImportError:
        _print(
            "This tool needs the 'bleak' BLE library.\n"
            "  pip install -r requirements.txt"
        )
        return 3

    try:
        if args.scan:
            return asyncio.run(scan(args.scan_timeout))
        return asyncio.run(capture(args))
    except KeyboardInterrupt:
        _print("\nStopped.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
