@echo off
setlocal

echo ===================================
echo 🔓 Unlocking .env for update...
echo ===================================
attrib -R .env 2>nul
icacls .env /reset 2>nul

echo ===================================
echo ✍️ Writing new .env values...
echo ===================================
(
  echo APP_ENV=development
  echo APP_PORT=8080
  echo TWILIO_ACCOUNT_SID=ACf4dbc133208282e2a992e4b1ab0d680a
  echo TWILIO_AUTH_TOKEN=e9bad0917b5d65b120450e6bbce66fe0
  echo WS_SHARED_SECRET=change_this_to_a_long_random_value
  echo LOG_LEVEL=info
  echo WS_MAX_PAYLOAD_BYTES=200000
  echo WS_HEARTBEAT_SECONDS=30
  echo GOOGLE_APPLICATION_CREDENTIALS=C:\Alphine\Projects\aca-realtime-gateway\config\gcloud-service-key.json
  echo GOOGLE_PROJECT_ID=your_project_id_here
) > .env

echo ===================================
echo 🔒 Re-locking .env securely...
echo ===================================
icacls .env /inheritance:r
icacls .env /grant %USERNAME%:R
icacls .env /grant SYSTEM:R
attrib +R .env

echo ===================================
echo ✅ .env updated successfully!
echo Current WS_SHARED_SECRET value:
findstr WS_SHARED_SECRET .env
echo ===================================

endlocal
