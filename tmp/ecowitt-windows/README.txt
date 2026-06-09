EcoWitt Windows local pipeline
==============================

1. Confirm Mosquitto is running.
2. Run 01-watch-mqtt.cmd
3. Run 02-start-http-bridge.cmd
4. Run 03-test-http-bridge.cmd
5. Confirm a message appears on topic 'ecowitt/grow'.
6. Point the Ecowitt app to the RECOMMENDED IPv4 / port 8080 / path /data/report.
7. Run 04-run-mqtt-dry-run.cmd
8. Review the dry-run report BEFORE any live send.

WARNINGS
  - Never paste bridge tokens into these launchers.
  - Never paste service-role keys anywhere.
  - Live send is NOT part of this fast path.
