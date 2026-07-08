@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$url='https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev/health?cacheBust=' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();" ^
  "$h=Invoke-RestMethod -Uri $url -Headers @{'Cache-Control'='no-cache';'Pragma'='no-cache'};" ^
  "Write-Host ('Worker service: ' + $h.service);" ^
  "Write-Host ('Worker protocol: ' + $h.protocol);" ^
  "Write-Host ('Worker build: ' + $h.build);" ^
  "if ($h.protocol -ne 4 -or $h.build -ne 'm3-revive-r1') { exit 1 }"
if errorlevel 1 (echo. & echo WORKER HEALTH CHECK FAILED. Expected protocol 4 and build m3-revive-r1. & pause & exit /b 1)
echo. & echo WORKER HEALTH CHECK PASSED. & pause
