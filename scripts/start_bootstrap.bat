@echo off
setlocal enabledelayedexpansion
cd /d C:\Alphine\Projects\aca-realtime-gateway
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8080 ^| findstr LISTENING') do taskkill /PID %%a /F
node bootstrap.js
