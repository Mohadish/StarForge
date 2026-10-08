@echo off
title Forge 4X
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo First run: installing Electron...
  call npm install
)
start "" "node_modules\electron\dist\electron.exe" .
