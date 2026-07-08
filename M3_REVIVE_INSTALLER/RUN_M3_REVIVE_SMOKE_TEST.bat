@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (echo ERROR: Node.js not found. & pause & exit /b 1)
node smoke_test.mjs
if errorlevel 1 (echo. & echo SMOKE TEST FAILED. & pause & exit /b 1)
echo. & echo SMOKE TEST PASSED. & pause
