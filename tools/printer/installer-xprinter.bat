@echo off
:: ==============================================================================
:: Script lanceur pour l'installation automatique de l'imprimante thermique
:: LMS - Lycée Privé Manjary Soa (v1.1.1)
:: ==============================================================================
title Verification et Installation Imprimante POS-80 - LMS Manjary Soa

echo.
echo ============================================================
echo   INSTALLATION / VERIFICATION IMPRIMANTE POS-80 (XPRINTER)
echo ============================================================
echo.

:: Verifier les privileges Admin
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Execution avec droits Administrateur confirmes.
) else (
    echo [INFO] Demande d'elevation des privileges administrateur Windows...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~dp0installer-xprinter.bat\" %*' -Verb RunAs"
    exit /b
)

:: Executer le script PowerShell avec les arguments passes
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer-xprinter.ps1" %*

echo.
if "%1"=="--no-pause" goto end
pause
:end
exit /b %errorLevel%
