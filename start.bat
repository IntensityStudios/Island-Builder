@echo off
REM Island Builder - local launcher for Windows.
REM Starts a tiny static web server in this folder and opens the game in your browser.
REM (Opening index.html directly does not work because browsers block ES modules from file://)
cd /d "%~dp0"
set PORT=8642
echo.
echo   Island Builder is starting at http://localhost:%PORT%/
echo   Keep this window open while you play. Close it to stop the server.
echo.

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/"
  python -m http.server %PORT%
  goto :eof
)
where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/"
  py -m http.server %PORT%
  goto :eof
)
where npx >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/"
  npx --yes serve -l %PORT% .
  goto :eof
)
echo Could not find Python or Node.js.
echo Install Python from https://www.python.org/downloads/ (tick "Add to PATH"), then run this again.
pause
