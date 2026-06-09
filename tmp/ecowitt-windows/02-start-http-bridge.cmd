@echo off
chcp 65001 >nul
cd /d "/dev-server"
bun run dev:ecowitt-http-bridge

pause
