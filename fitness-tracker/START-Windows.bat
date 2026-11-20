@echo off
cd /d "%~dp0"
title Familien-Fitness-Tracker
start "" http://localhost:3000
node server.js
pause
