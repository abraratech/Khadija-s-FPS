@echo off
setlocal
cd /d "%~dp0\.."
echo.
echo Khadija's Arena M3.5-M3.6 Revive Installer
echo Baseline: 5f039c8cd0ac2cc88177f244cdbb68fc0252eb7c
echo.
python "%~dp0apply_patch.py"
if errorlevel 1 (echo. & echo INSTALL FAILED. & pause & exit /b 1)
echo. & echo INSTALL COMPLETE. & pause
