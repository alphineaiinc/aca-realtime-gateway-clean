@echo off
REM === Kill any Node process on port 8080 ===
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :8080 ^| findstr LISTENING') do taskkill /PID %%P /F >nul 2>&1
timeout /t 1 >nul

REM === Clear read-only ===
attrib -R app.js >nul 2>&1
attrib -R server.js >nul 2>&1

REM === Backup old files ===
if exist app.js del /F /Q app.old.js >nul 2>&1
if exist app.js ren app.js app.old.js
if exist server.js del /F /Q server.old.js >nul 2>&1
if exist server.js ren server.js server.old.js

REM === Write new app.js ===
(
echo require^('dotenv'^).config^();
echo const express = require^('express'^);
echo const twilio = require^('twilio'^);
echo.
echo const app = express^();
echo app.use^(
echo   express.urlencoded^{ extended: false }^
echo ^);
echo app.use^(
echo   express.json^{ }^
echo ^);
echo.
echo const twilioWebhook = twilio.webhook^{ validate: true }^;
echo.
echo app.post^('/twilio/voice', twilioWebhook, (req, res) =^> {^
echo   const wsHost = req.headers['host'];^
echo   const secret = process.env.WS_SHARED_SECRET;^
echo   const twiml = new twilio.twiml.VoiceResponse^();^
echo   twiml.connect^().stream^{ url: ^`wss://^${wsHost}/media-stream?secret=^${secret}^` };^
echo   res.type^('text/xml'^).send^(twiml.toString^());^
echo }^); 
echo.
echo module.exports = app;
) > app.js

REM === Write new server.js ===
(
echo const http = require^('http'^);
echo const app = require^('./app'^);
echo const { attachWSS } = require^('./src/ws'^);
echo.
echo const port = process.env.APP_PORT ^|^| 8080;
echo const server = http.createServer^(app^);
echo.
echo attachWSS^(server^);
echo.
echo server.listen^(port, () =^> {^
echo   console.log^(`HTTP+WS server listening on ${port}`^);^
echo }^);
) > server.js
