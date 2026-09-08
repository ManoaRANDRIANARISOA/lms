param (
    [string]$TargetPrinter = 'POS-80',
    [switch]$AutoFix = $true
)

$output = @{
    installed = $false
    connected = $false
    activePort = ""
    currentPort = ""
    availablePorts = @()
    isOffline = $false
    fixed = $false
    message = ""
    error = ""
}

# 1. Retrieve all virtual USB printer ports defined in Windows
$usbPorts = @(Get-PrinterPort -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'USB*' } | Select-Object -ExpandProperty Name | Sort-Object)
if ($usbPorts.Count -eq 0) {
    $usbPorts = @('USB001', 'USB002', 'USB003')
}
$output.availablePorts = $usbPorts

# 2. Check if TargetPrinter is registered in Windows
$existingPrinter = Get-Printer -Name $TargetPrinter -ErrorAction SilentlyContinue
if ($existingPrinter) {
    $output.installed = $true
    $output.currentPort = $existingPrinter.PortName
}

# 3. Query active PnP devices for usbprint (Xprinter, POS-80, etc.)
# NOTE: Do NOT filter with -Status 'OK' because Windows often marks thermal printers with status 'Unknown'
$detectedPort = ""
$activePnp = Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object {
    ($_.InstanceId -like '*USBPRINT*' -or $_.Service -eq 'usbprint') -and $_.Present -eq $true
}

if ($activePnp) {
    # 3a. Extract port directly from InstanceId if present (e.g. &0&USB002)
    foreach ($dev in $activePnp) {
        if ($dev.InstanceId -match '(USB\d+)') {
            $detectedPort = $matches[1]
            break
        }
    }

    # 3b. If not in InstanceId, look up the active instance in USBPRINT registry Device Parameters
    if (-not $detectedPort) {
        foreach ($dev in $activePnp) {
            try {
                $regPath = "HKLM:\SYSTEM\CurrentControlSet\Enum\$($dev.InstanceId)\Device Parameters"
                $p = (Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue).PortName
                if ($p -and $p -like 'USB*') {
                    $detectedPort = $p
                    break
                }
            } catch {}
        }
    }
}

if ($detectedPort) {
    $output.connected = $true
    $output.activePort = $detectedPort
} else {
    # No actively connected USBPRINT hardware found (printer unplugged or powered off)
    $output.connected = $false
}

# 4. Auto-fix / Self-heal if requested and printer is installed
if ($existingPrinter -and $AutoFix) {
    # Rebind port if an active physical port was detected and differs from current
    if ($detectedPort -and $existingPrinter.PortName -ne $detectedPort) {
        try {
            Set-Printer -Name $TargetPrinter -PortName $detectedPort -ErrorAction Stop
            $output.currentPort = $detectedPort
            $output.fixed = $true
        } catch {}
    }

    # Always disable BiDi (Bidirectional communication) on POS-80 to prevent ESC/POS spooler errors
    try {
        Set-Printer -Name $TargetPrinter -EnableBidi $false -ErrorAction SilentlyContinue
        $wmi = Get-WmiObject -Query "Select * from Win32_Printer where Name='$TargetPrinter'" -ErrorAction SilentlyContinue
        if ($wmi) {
            if ($wmi.EnableBIDI) {
                $wmi.EnableBIDI = $false
                $wmi.Put() | Out-Null
            }
            if ($wmi.WorkOffline) {
                $wmi.WorkOffline = $false
                $wmi.Put() | Out-Null
                $output.fixed = $true
            }
        }
    } catch {}

    # Ensure TargetPrinter is never default Windows printer
    try {
        $def = Get-CimInstance Win32_Printer -Filter "Default=True" -ErrorAction SilentlyContinue
        if ($def -and $def.Name -eq $TargetPrinter) {
            $pdf = Get-WmiObject -Query "Select * from Win32_Printer where Name='Microsoft Print to PDF'" -ErrorAction SilentlyContinue
            if ($pdf) { $pdf.SetDefaultPrinter() | Out-Null }
        }
    } catch {}

    # Check updated offline status
    try {
        $wmiCheck = Get-CimInstance Win32_Printer -Filter "Name='$TargetPrinter'" -ErrorAction SilentlyContinue
        $output.isOffline = [bool]$wmiCheck.WorkOffline
    } catch {}

    # Cancel any stuck error jobs in the queue
    try {
        $wmiCancel = Get-WmiObject -Query "Select * from Win32_Printer where Name='$TargetPrinter'" -ErrorAction SilentlyContinue
        if ($wmiCancel) {
            Get-PrintJob -PrinterName $TargetPrinter -ErrorAction SilentlyContinue | 
                Where-Object { $_.JobStatus -like '*Error*' -or $_.JobStatus -like '*Blocked*' -or $_.JobStatus -like '*PaperOut*' } | 
                Remove-PrintJob -ErrorAction SilentlyContinue
        }
    } catch {}
}

# Update currentPort after any fixes
if ($existingPrinter) {
    $refreshed = Get-Printer -Name $TargetPrinter -ErrorAction SilentlyContinue
    if ($refreshed) {
        $output.currentPort = $refreshed.PortName
    }
}

# Format human message
if (-not $output.installed) {
    $output.error = "L'imprimante '$TargetPrinter' n'est pas encore enregistrée dans Windows."
    $output.message = "Imprimante non installée."
} elseif (-not $output.connected) {
    $output.error = "Aucune imprimante thermique USB active détectée. Vérifiez que la Xprinter est allumée et branchée sur une prise USB."
    $output.message = "Imprimante débranchée ou éteinte (Port actuel configuré : $($output.currentPort))."
} else {
    $output.message = "Imprimante POS-80 connectée et prête sur le port $($output.currentPort) (En ligne)."
}

$output | ConvertTo-Json -Compress
