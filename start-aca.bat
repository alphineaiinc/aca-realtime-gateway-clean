@echo off
setlocal

REM ===================================
REM 0. Kill old ngrok processes
REM ===================================
echo Killing any old ngrok processes...
taskkill /IM ngrok.exe /F >nul 2>&1

REM ===================================
REM 1. Kill any process using port 3000 or 8080
REM ===================================
for %%p in (3000 8080) do (
  echo Checking port %%p...
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%%p ^| findstr LISTENING') do (
    echo Killing PID %%a on port %%p...
    taskkill /PID %%a /F >nul 2>&1
  )
)

REM ===================================
REM 2. Start Node.js ACA Gateway server
REM ===================================
echo Starting ACA Gateway server...
start "ACA-Gateway-Server" cmd /k "cd /d C:\Alphine\Projects\aca-realtime-gateway && npm run dev"

REM ===================================
REM 3. Start ngrok tunnel on port 8080
REM ===================================
echo Starting ngrok tunnel for port 8080...
start "ngrok" cmd /k "ngrok http 8080"

REM ===================================
REM 4. Open ngrok Web UI in browser
REM ===================================
start http://127.0.0.1:4040

REM ===================================
REM 5. Print sanity-check instructions
REM ===================================
echo ============================================
echo ? Next steps:
echo   1. In ngrok window, copy the HTTPS Forwarding URL (e.g. https://abcd1234.ngrok-free.app).
echo   2. In cmd.exe, test TwiML with:
echo      curl -i https://YOUR_NGROK_URL/twilio/voice
echo   3. Must return XML (^<?xml ... ^<Response^>...^</Response^>).
echo   4. Update Twilio webhook with:
echo      https://YOUR_NGROK_URL/twilio/voice
echo   5. Then make your test call.
echo   6. For live logs, check your browser at:
echo      http://127.0.0.1:4040
echo ============================================

endlocal
