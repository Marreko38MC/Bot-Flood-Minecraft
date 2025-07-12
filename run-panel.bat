@echo off
start "" "C:\tor\tor\tor.exe"
timeout /t 5 >nul
node server.js
