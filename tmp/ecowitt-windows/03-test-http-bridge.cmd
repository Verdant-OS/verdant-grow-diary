@echo off
chcp 65001 >nul
echo FAKE LOCAL TEST PAYLOAD -- not live data
curl.exe -X POST "http://127.0.0.1:8080/data/report" -d "temp1f=77.4&humidity1=58&soilmoisture1=33&co2=721"

pause
