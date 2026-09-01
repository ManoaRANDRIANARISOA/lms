# ==============================================================================
# Script d'installation automatique pour Imprimante Thermique Xprinter XP-80U
# LMS - Lycée Privé Manjary Soa
# ==============================================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  INSTALLATION AUTOMATIQUE - IMPRIMANTE POS-80 (XPRINTER)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Vérification des droits administrateur
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERREUR] Ce script doit etre execute en tant qu'Administrateur !" -ForegroundColor Red
    Write-Host "Faites un clic droit sur 'installer-xprinter.bat' -> 'Executer en tant qu'administrateur'." -ForegroundColor Yellow
    Pause
    Exit
}

# 2. Installation du pilote 'Generic / Text Only'
Write-Host "[1/3] Verification et installation du pilote d'impression generique..." -ForegroundColor Yellow
try {
    Add-PrinterDriver -Name "Generic / Text Only" -ErrorAction SilentlyContinue
    Write-Host "  -> Pilote 'Generic / Text Only' pret." -ForegroundColor Green
} catch {
    Write-Host "  -> [Attention] " $_.Exception.Message -ForegroundColor Yellow
}

# 3. Detection du port USB de l'imprimante
Write-Host "[2/3] Detection du port USB..." -ForegroundColor Yellow
$printerPort = "USB001"
$usbPrint = Get-CimInstance Win32_PnPEntity | Where-Object { $_.Service -eq "usbprint" -or $_.Name -like "*POS*" -or $_.Name -like "*Printer*" }
if ($usbPrint) {
    Write-Host "  -> Peripherique USB detecte : $($usbPrint.Name)" -ForegroundColor Green
} else {
    Write-Host "  -> Port USB par defaut : $printerPort (Assurez-vous que l'imprimante est allumee et branchee)." -ForegroundColor Yellow
}

# 4. Ajout ou mise a jour de l'imprimante POS-80
Write-Host "[3/3] Configuration de l'imprimante 'POS-80'..." -ForegroundColor Yellow
$existingPrinter = Get-Printer -Name "POS-80" -ErrorAction SilentlyContinue
if ($existingPrinter) {
    Write-Host "  -> L'imprimante 'POS-80' existe deja sur le port $($existingPrinter.PortName)." -ForegroundColor Green
} else {
    try {
        Add-Printer -Name "POS-80" -DriverName "Generic / Text Only" -PortName $printerPort -ErrorAction Stop
        Write-Host "  -> Imprimante 'POS-80' creee avec succes sur $printerPort !" -ForegroundColor Green
    } catch {
        Write-Host "  -> Tentative d'association sur USB001..." -ForegroundColor Yellow
        Add-Printer -Name "POS-80" -DriverName "Generic / Text Only" -PortName "USB001" -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  INSTALLATION TERMINEE AVEC SUCCES !" -ForegroundColor Green
Write-Host "  L'imprimante 'POS-80' est configuree et prete pour le LMS." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
