@echo off
setlocal enabledelayedexpansion

REM ============================================
REM Alphine AI - Fetch Google Speech API Protos
REM ============================================
REM Root path
set ROOT=%~dp0protos

REM Create required directories
mkdir "%ROOT%\google\api"
mkdir "%ROOT%\google\cloud\speech\v1"
mkdir "%ROOT%\google\longrunning"
mkdir "%ROOT%\google\rpc"

echo.
echo 📥 Downloading Google API protos...

REM ---- google/api ----
curl -L https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/annotations.proto -o "%ROOT%\google\api\annotations.proto"
curl -L https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/http.proto -o "%ROOT%\google\api\http.proto"
curl -L https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/client.proto -o "%ROOT%\google\api\client.proto"
curl -L https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/field_behavior.proto -o "%ROOT%\google\api\field_behavior.proto"
curl -L https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/resource.proto -o "%ROOT%\google\api\resource.proto"
curl -L https://raw.githubusercontent.com/googleapis/googleapis/master/google/api/launch_stage.proto -o "%ROOT%\google\api\launch_stage.proto"

REM ---- google/cloud/speech/v1 ----
curl -L https://raw.githubusercontent.com/googleapis/googleapis/master/google/cloud/speech/v1/cloud_speech.proto -o "%ROOT%\google\cloud\speech\v1\cloud_speech.proto"
curl -L https://raw.githubusercontent.com/googleapis/googleapis/master/google/cloud/speech/v1/resource.proto -o "%ROOT%\google\cloud\speech\v1\resource.proto"

REM ---- google/longrunning ----
curl -L https://raw.githubusercontent.com/googleapis/googleapis/master/google/longrunning/operations.proto -o "%ROOT%\google\longrunning\operations.proto"

REM ---- google/rpc ----
curl -L https://raw.githubusercontent.com/googleapis/googleapis/master/google/rpc/status.proto -o "%ROOT%\google\rpc\status.proto"
curl -L https://raw.githubusercontent.com/googleapis/googleapis/master/google/rpc/error_details.proto -o "%ROOT%\google\rpc\error_details.proto"

echo.
echo ✅ All protos downloaded into %ROOT%
pause
