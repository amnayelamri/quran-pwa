@echo off
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║       Quran PWA - Serveur local          ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  PWA      : http://localhost:3001/pwa
echo  Dashboard: http://localhost:3001/dashboard
echo.

cd /d "%~dp0dashboard"

IF NOT EXIST node_modules (
  echo  Installation des dependances...
  npm install
  echo.
)

echo  Lancement du serveur...
start "" "http://localhost:3001/pwa"
start "" "http://localhost:3001/dashboard"
node server.js
pause
