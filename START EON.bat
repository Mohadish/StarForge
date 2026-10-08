@echo off
title Forge - Eon
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo First run: installing Electron...
  call npm install
)
set FORGE_PAGE=eon.html
start "" "node_modules\electron\dist\electron.exe" .
