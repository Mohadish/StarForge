@echo off
cd /d "%~dp0"
set FORGE_PAGE=paint.html
start "" "node_modules\electron\dist\electron.exe" .
