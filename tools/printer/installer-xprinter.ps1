# ==============================================================================
# Script d'installation / vérification automatique - Imprimante POS-80 (Xprinter)
# LMS - Lycée Privé Manjary Soa (v1.1.1)
# ==============================================================================

param (
    [switch]$Quiet = $false
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VERIFICATION / INITIALISATION IMPRIMANTE POS-80" -ForegroundColor Cyan
Write-Host "  LMS Lycee Prive Manjary Soa (v1.1.1)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Vérification des droits administrateur
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERREUR] Ce script necessite les droits d'administration Windows !" -ForegroundColor Red
    Write-Host "Veuillez relancer le script en tant qu'Administrateur." -ForegroundColor Yellow
    if (-not $Quiet) {
        Pause
    }
    Exit 1
}

# 2. Vérification de l'état actuel de l'imprimante POS-80
Write-Host "[1/3] Verification de la configuration actuelle de POS-80..." -ForegroundColor Yellow
$existingPrinter = Get-Printer -Name "POS-80" -ErrorAction SilentlyContinue

if ($existingPrinter) {
    Write-Host "  -> [INFO] L'imprimante 'POS-80' est DEJA INSTALLEE." -ForegroundColor Green
    Write-Host "     * Port actuel   : $($existingPrinter.PortName)" -ForegroundColor Cyan
    Write-Host "     * Pilote actuel : $($existingPrinter.DriverName)" -ForegroundColor Cyan
} else {
    Write-Host "  -> [INFO] L'imprimante 'POS-80' n'est pas encore enregistree." -ForegroundColor Yellow
}

# 3. Installation / Vérification du pilote générique
Write-Host "[2/3] Verification du pilote d'impression generique (Generic / Text Only)..." -ForegroundColor Yellow
$existingDriver = Get-PrinterDriver -Name "Generic / Text Only" -ErrorAction SilentlyContinue
if ($existingDriver) {
    Write-Host "  -> Pilote 'Generic / Text Only' deja present." -ForegroundColor Green
} else {
    try {
        Add-PrinterDriver -Name "Generic / Text Only" -ErrorAction Stop
        Write-Host "  -> Pilote 'Generic / Text Only' installe avec succes." -ForegroundColor Green
    } catch {
        Write-Host "  -> [Attention] Impossible d'ajouter le pilote : $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# 4. Détection du port USB
Write-Host "[3/3] Detection du port USB pour l'imprimante thermique..." -ForegroundColor Yellow
$printerPort = "USB001"
try {
    $usbPrint = Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { 
        $_.Service -eq "usbprint" -or $_.Name -like "*POS*" -or $_.Name -like "*Printer*" 
    }
    if ($usbPrint) {
        $pName = if ($usbPrint -is [array]) { $usbPrint[0].Name } else { $usbPrint.Name }
        Write-Host "  -> Peripherique USB detecte : $pName" -ForegroundColor Green
    } else {
        Write-Host "  -> Aucun periph USB specifique detecte. Utilisation du port par defaut : $printerPort" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  -> Utilisation du port par defaut : $printerPort" -ForegroundColor Yellow
}

# 5. Création ou Mise à jour de l'imprimante POS-80
if ($existingPrinter) {
    Write-Host ""
    Write-Host "Mise a jour de l'imprimante existante..." -ForegroundColor Yellow
    try {
        if ($existingPrinter.PortName -ne $printerPort) {
            Set-Printer -Name "POS-80" -PortName $printerPort -ErrorAction Stop
            Write-Host "  -> Port mis a jour avec succes vers $printerPort." -ForegroundColor Green
        } else {
            Write-Host "  -> L'imprimante est deja correctement associee au port $printerPort." -ForegroundColor Green
        }
    } catch {
        Write-Host "  -> Note: Conservation du port existant ($($existingPrinter.PortName))." -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "Creation de la nouvelle imprimante 'POS-80'..." -ForegroundColor Yellow
    try {
        Add-Printer -Name "POS-80" -DriverName "Generic / Text Only" -PortName $printerPort -ErrorAction Stop
        Write-Host "  -> Imprimante 'POS-80' creee avec succes sur $printerPort !" -ForegroundColor Green
    } catch {
        Write-Host "  -> Essai avec port USB001 alternatif..." -ForegroundColor Yellow
        try {
            Add-Printer -Name "POS-80" -DriverName "Generic / Text Only" -PortName "USB001" -ErrorAction Stop
            Write-Host "  -> Imprimante 'POS-80' creee avec succes sur USB001 !" -ForegroundColor Green
        } catch {
            Write-Host "  -> [ERREUR] Impossible de creer l'imprimante : $($_.Exception.Message)" -ForegroundColor Red
            Exit 1
        }
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  CONFIGURATION TERMINEE AVEC SUCCES !" -ForegroundColor Green
Write-Host "  L'imprimante 'POS-80' est operationnelle pour le LMS." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Exit 0
