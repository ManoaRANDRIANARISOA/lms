@echo off
title Test d'impression POS-80 - LMS Manjary Soa
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0test-xprinter.ps1"
echo.
pause
