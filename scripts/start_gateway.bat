(
  echo @echo off
  echo cd /d C:\Alphine\Projects\aca-realtime-gateway
  echo rem Ensure .env is writable
  echo attrib -R .env ^>nul 2^>^&1
  echo rem Install deps if missing
  echo if not exist node_modules npm ci
  echo rem Start server (prefers dev script, else start)
  echo call npm run dev ^|^| call npm start
) > scripts\start_gateway.bat