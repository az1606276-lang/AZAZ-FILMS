@echo off
title AZ FILMS - Free Hosting Deployment
echo ============================================
echo   AZ FILMS - Free Deploy to Firebase Hosting
echo ============================================
echo.
call npm install
if errorlevel 1 pause & exit /b 1
call npx -y firebase-tools login
if errorlevel 1 pause & exit /b 1
call npm run deploy:free
echo.
echo Done! Live URL: https://gen-lang-client-0286519577.web.app
pause
