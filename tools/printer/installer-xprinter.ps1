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

# 4. Détection intelligente du port USB actif (PnP matériel réel)
Write-Host "[3/3] Detection materielle reelle du port USB de l'imprimante thermique..." -ForegroundColor Yellow

$printerPort = ""
try {
    $activeDev = Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object {
        ($_.InstanceId -like '*USBPRINT*' -or $_.Service -eq 'usbprint') -and $_.Present -eq $true
    } | Select-Object -First 1

    if ($activeDev -and $activeDev.InstanceId -match '(USB\d+)') {
        $printerPort = $matches[1]
        Write-Host "  -> Port USB physique actif detecte via PnP : $printerPort" -ForegroundColor Green
    }
} catch {}

if (-not $printerPort) {
    try {
        $regPorts = Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Enum\USBPRINT' -Recurse -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.PortName -like 'USB*' }
        if ($regPorts) {
            $printerPort = ($regPorts | Select-Object -First 1).PortName
            Write-Host "  -> Port USB retrouve via le registre Windows : $printerPort" -ForegroundColor Green
        }
    } catch {}
}

if (-not $printerPort) {
    $printerPort = "USB001"
    Write-Host "  -> [Attention] Aucun port USB actif detecte (imprimante hors-tension ?). Port par defaut : $printerPort" -ForegroundColor Yellow
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

# 6. Forcer la désactivation de la communication bidirectionnelle (BiDi)
try {
    Set-Printer -Name "POS-80" -EnableBidi $false -ErrorAction SilentlyContinue
    $wmi = Get-WmiObject -Query "Select * from Win32_Printer where Name='POS-80'" -ErrorAction SilentlyContinue
    if ($wmi) {
        if ($wmi.EnableBIDI) {
            $wmi.EnableBIDI = $false
            $wmi.Put() | Out-Null
        }
        if ($wmi.WorkOffline) {
            $wmi.WorkOffline = $false
            $wmi.Put() | Out-Null
            Write-Host "  -> Statut 'Hors-connexion' desactive : l'imprimante est desormais EN LIGNE." -ForegroundColor Green
        }
    }
} catch {}

# 7. S'assurer que POS-80 n'est PAS l'imprimante Windows par défaut (évite que Word/PDF sortent dessus)
try {
    $def = Get-CimInstance Win32_Printer -Filter "Default=True" -ErrorAction SilentlyContinue
    if ($def -and $def.Name -eq 'POS-80') {
        $pdf = Get-WmiObject -Query "Select * from Win32_Printer where Name='Microsoft Print to PDF'" -ErrorAction SilentlyContinue
        if ($pdf) {
            $pdf.SetDefaultPrinter() | Out-Null
            Write-Host "  -> Imprimante par defaut Windows preservee (seul le LMS utilisera POS-80)." -ForegroundColor Green
        }
    }
} catch {}

# 8. Nettoyer les éventuels travaux d'impression bloqués
try {
    $wmiCancel = Get-WmiObject -Query "Select * from Win32_Printer where Name='POS-80'" -ErrorAction SilentlyContinue
    if ($wmiCancel) {
        $wmiCancel.CancelAllJobs() | Out-Null
    }
    Get-PrintJob -PrinterName 'POS-80' -ErrorAction SilentlyContinue | Remove-PrintJob -ErrorAction SilentlyContinue
} catch {}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  CONFIGURATION TERMINEE AVEC SUCCES !" -ForegroundColor Green
Write-Host "  L'imprimante 'POS-80' est operationnelle pour le LMS." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Exit 0
