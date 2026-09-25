@echo off
REM Relays the laser ESP32 to the stock server. Keep this window open.
cd /d "%~dp0"
py esp_relay.py 10.72.3.68
if errorlevel 1 python esp_relay.py 10.72.3.68
pause
