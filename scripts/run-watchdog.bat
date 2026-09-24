@echo off
REM BedaanWaves — watchdog runner for the scheduled task (avoids quoting issues).
"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Administrator\Documents\BedaanWaves_Alpha\scripts\watchdog-auto-refresh.ps1"
