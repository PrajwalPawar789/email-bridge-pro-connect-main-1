@echo off
echo Deploying check-email-replies function...
call npx supabase functions deploy check-email-replies --project-ref lyerkyijpavilyufcrgb --no-verify-jwt
pause
