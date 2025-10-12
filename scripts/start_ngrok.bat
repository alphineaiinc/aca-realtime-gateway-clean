@echo off
set PORT=8080
start "ngrok http %PORT%" cmd /k ngrok http http://localhost:%PORT%
