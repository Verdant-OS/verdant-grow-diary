@echo off
chcp 65001 >nul
cd /d "/dev-server"
set ECOWITT_MQTT_URL=mqtt://127.0.0.1:1883
set ECOWITT_MQTT_TOPIC=ecowitt/grow
bun run dev:ecowitt-mqtt:dry-run -- --once --write-report
start "" tmp\ecowitt-last-ingest-report.json

pause
