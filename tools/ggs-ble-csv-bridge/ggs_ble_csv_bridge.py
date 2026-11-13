"""Receive-only status listener.

Scans by advertised name, connects, and subscribes to notifications on the
status characteristic. It does not send a status poll or a setting change, and
it does not touch any other characteristic. Duration is required so the process
stops on its own.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import datetime, timezone

from bleak import BleakClient, BleakScanner

from ggs_status_csv import ControllerMap, StatusCsvSession, load_controller_map, save_csv

# 16-bit FF01 expanded. The service UUID is the one measured on this unit.
STATUS_SERVICE = "000000ff-0000-1000-8000-00805f9b34fb"
STATUS_NOTIFY = "0000ff01-0000-1000-8000-00805f9b34fb"
MAX_DURATION_SECONDS = 3600.0


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.duration <= 0 or args.duration > MAX_DURATION_SECONDS:
        print("duration must be between 0 and 3600 seconds", file=sys.stderr)
        return 2
    if args.scan_seconds <= 0:
        print("scan-seconds must be greater than 0", file=sys.stderr)
        return 2
    with open(args.map, encoding="utf-8") as handle:
        mapping = load_controller_map(json.load(handle))
    session = StatusCsvSession(mapping)
    try:
        asyncio.run(
            _listen(
                mapping,
                session,
                duration=args.duration,
                scan_seconds=args.scan_seconds,
            )
        )
    except KeyboardInterrupt:
        print("stopped", file=sys.stderr)
    text = session.render_csv()
    save_csv(args.out, text)
    row_count = max(0, text.count("\n") - 1)
    print(f"saved {row_count} rows to {args.out}", file=sys.stderr)
    for warning in session.warnings:
        print(warning, file=sys.stderr)
    return 0


async def _listen(
    mapping: ControllerMap,
    session: StatusCsvSession,
    *,
    duration: float,
    scan_seconds: float,
) -> None:
    found = await BleakScanner.discover(timeout=scan_seconds)
    chosen: list[tuple[str, str, object]] = []
    for entry in mapping.entries:
        matches = [device for device in found if (device.name or "") == entry.advertised_name]
        if not matches:
            print(f"{entry.alias} was not found during the scan", file=sys.stderr)
            continue
        matches.sort(key=_signal, reverse=True)
        if len(matches) > 1:
            print(
                f"more than one advertisement matched {entry.alias}; using the strongest signal",
                file=sys.stderr,
            )
        chosen.append((entry.alias, entry.advertised_name, matches[0]))
    if not chosen:
        print("no mapped controller was found", file=sys.stderr)
        return
    stop_at = time.monotonic() + duration
    await asyncio.gather(
        *(_hold(alias, name, device, session, stop_at) for alias, name, device in chosen)
    )


async def _hold(
    alias: str,
    advertised_name: str,
    device: object,
    session: StatusCsvSession,
    stop_at: float,
) -> None:
    print(f"listening for {alias}", file=sys.stderr)
    while time.monotonic() < stop_at:
        try:
            async with BleakClient(device) as client:
                services = getattr(client, "services", None)
                if services:
                    service_ids = {str(service.uuid).lower() for service in services}
                    if STATUS_SERVICE not in service_ids:
                        print(
                            f"{alias} did not offer the measured status service",
                            file=sys.stderr,
                        )
                        return

                def on_notification(_characteristic: object, data: bytearray) -> None:
                    session.feed_notification(
                        advertised_name,
                        bytes(data),
                        received_at=datetime.now(timezone.utc),
                    )

                await client.start_notify(STATUS_NOTIFY, on_notification)
                try:
                    while time.monotonic() < stop_at and client.is_connected:
                        await asyncio.sleep(0.5)
                finally:
                    if client.is_connected:
                        await client.stop_notify(STATUS_NOTIFY)
        except Exception:
            session.note_reconnect(alias)
            print(f"{alias} connection ended; listening again", file=sys.stderr)
            await asyncio.sleep(1)


def _signal(device: object) -> int:
    advertisement = getattr(device, "advertisement", None)
    value = getattr(advertisement, "rssi", None) if advertisement is not None else None
    if value is None:
        value = getattr(device, "rssi", None)
    if isinstance(value, (int, float)):
        return int(value)
    return -999


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Listen for status notifications and save a CSV for the existing import."
    )
    parser.add_argument("--map", required=True, help="controller-to-tent mapping JSON")
    parser.add_argument("--out", required=True, help="CSV path to save")
    parser.add_argument("--duration", required=True, type=float, help="seconds to listen, max 3600")
    parser.add_argument("--scan-seconds", type=float, default=8.0)
    return parser


if __name__ == "__main__":
    raise SystemExit(main())
