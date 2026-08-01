@echo off
cd /d "%~dp0"
echo Refreshing the Pangasinan infrastructure report...
echo.
call npm run report
echo.
echo Done. Close this window, or press any key to close it now.
pause >nul
