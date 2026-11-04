@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing editor dependencies...
  call npm.cmd install
  if errorlevel 1 exit /b 1
)
echo Open http://127.0.0.1:5173 in Chrome or Edge.
call npm.cmd run dev
