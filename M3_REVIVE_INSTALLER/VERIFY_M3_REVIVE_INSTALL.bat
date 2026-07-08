@echo off
setlocal
cd /d "%~dp0\.."
python "%~dp0verify_install.py"
if errorlevel 1 (echo. & echo VERIFICATION FAILED. & pause & exit /b 1)
echo. & echo VERIFICATION PASSED. & pause
