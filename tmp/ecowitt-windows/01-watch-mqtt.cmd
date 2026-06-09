@echo off
chcp 65001 >nul
"C:\Program Files\mosquitto\mosquitto_sub.exe" -h 127.0.0.1 -p 1883 -t "ecowitt/#" -v

pause
