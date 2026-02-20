@echo off
setlocal enabledelayedexpansion

set "PROJECT_REF="
set "SUPABASE_URL="

for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
  if /i "%%A"=="SUPABASE_PROJECT_REF" set "PROJECT_REF=%%~B"
  if /i "%%A"=="SUPABASE_URL" set "SUPABASE_URL=%%~B"
)

set "PROJECT_REF=%PROJECT_REF:"=%"
set "SUPABASE_URL=%SUPABASE_URL:"=%"

if not defined PROJECT_REF (
  for /f "tokens=3 delims=/." %%R in ("%SUPABASE_URL%") do set "PROJECT_REF=%%R"
)

if not defined PROJECT_REF (
  echo ERROR: Missing SUPABASE_PROJECT_REF or SUPABASE_URL in .env
  pause
  exit /b 1
)

echo Deploying check-email-replies function...
call npx supabase functions deploy check-email-replies --project-ref %PROJECT_REF% --no-verify-jwt
pause
