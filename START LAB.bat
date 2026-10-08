@echo off
cd /d "%~dp0"
set FORGE_PAGE=lab.html
start "" "node_moduleslectron\distlectron.exe" .
