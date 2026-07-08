@echo off
setlocal
cd /d "%~dp0\..\multiplayer-server"
if not exist "wrangler.jsonc" (echo ERROR: multiplayer-server\wrangler.jsonc not found. & pause & exit /b 1)
call npx wrangler deploy --config wrangler.jsonc
if errorlevel 1 (echo. & echo WORKER DEPLOY FAILED. & pause & exit /b 1)
echo. & echo WORKER DEPLOY COMPLETE. & pause
