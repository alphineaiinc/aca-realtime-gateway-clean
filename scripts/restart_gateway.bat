@echo off
rem Kill process on port 8080 if any
for /f "tokens=5" %%P in ('netstat -ano | findstr :8080 | findstr LISTENING') do   echo   taskkill /PID %%P /F >nul 2>&1
timeout /t 1 >nul
call "C:\Alphine\Projects\aca-realtime-gateway\scripts\start_gateway.bat"
