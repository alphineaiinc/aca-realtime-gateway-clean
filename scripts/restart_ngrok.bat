@echo off
for /f "tokens=2" %%P in ('tasklist | findstr /i ngrok.exe') do taskkill /PID %%P /F
timeout /t 1 >nul
call "C:\Alphine\Projects\aca-realtime-gateway\scripts\start_ngrok.bat"
