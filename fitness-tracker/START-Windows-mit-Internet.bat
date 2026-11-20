@echo off
cd /d "%~dp0"
title Familien-Fitness-Tracker (Internet)
if not exist cloudflared.exe (
  echo Bitte cloudflared.exe in DIESEN Ordner legen und nochmal starten.
  pause
  exit /b
)
start "Tracker-Server" cmd /k node server.js
timeout /t 2 >nul
echo Suche die Adresse https://....trycloudflare.com in den Zeilen unten und schicke sie der Familie.
cloudflared.exe tunnel --url http://localhost:3000
pause
