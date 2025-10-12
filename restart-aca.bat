@echo off
setlocal

echo ===================================
echo 🔄 Restarting ACA Gateway + ngrok...
echo ===================================

REM 1. Kill old ngrok processes
taskkill /IM ngrok.exe /F >nul 2>&1

REM 2. Kill anything using port 8080
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8080 ^| findstr LISTENING') do (
  echo Killing PID %%a on port 8080...
  taskkill /PID %%a /F >nul 2>&1
)

REM 3. Start Node.js server
start "ACA-Server" cmd /k "cd /d C:\Alphine\Projects\aca-realtime-gateway && npm run dev"

REM 4. Start ngrok tunnel
start "ngrok" cmd /k "ngrok http 8080"

REM 5. Open ngrok Web UI
start http://127.0.0.1:4040

echo ===================================
echo ✅ ACA Gateway + ngrok restarted!
echo Check http://127.0.0.1:4040 for logs
echo ===================================

endlocal
