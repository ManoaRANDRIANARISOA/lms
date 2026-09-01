@echo off
:: ==============================================================================
# Script lanceur pour l'installation automatique de l'imprimante thermique
# ==============================================================================
title Installation Imprimante POS-80 - LMS Manjary Soa

echo.
echo ============================================================
echo   INSTALLATION IMPRIMANTE THERMIQUE POS-80 (XPRINTER)
echo ============================================================
echo.

:: Verifier les privileges Admin
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Execution avec droits Administrateur.
) else (
    echo [INFO] Elevation des privileges administrateur en cours...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~dp0installer-xprinter.bat\"' -Verb RunAs"
    exit /b
)

:: Executer le script PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer-xprinter.ps1"

echo.
pause
