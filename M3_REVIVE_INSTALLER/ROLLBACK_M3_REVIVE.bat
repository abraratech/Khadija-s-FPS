@echo off
setlocal
cd /d "%~dp0\.."
python "%~dp0rollback_patch.py"
if errorlevel 1 (echo. & echo ROLLBACK FAILED. & pause & exit /b 1)
echo. & echo ROLLBACK COMPLETE. & pause
