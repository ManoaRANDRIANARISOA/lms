/**
 * thermal-printer.service.ts — Thermal POS 80mm Receipt Printer Service
 *
 * Implements ESC/POS thermal printing for Xprinter XP-80U (and compatible 80mm printers).
 * Features:
 *   - School Logo printing (monochrome raster bitmap conversion using Electron nativeImage)
 *   - Clean 80mm receipt layout with CP850/IBM437 French character encoding
 *   - Systematic 2-copy printing: Parent Copy and Cashier/School Copy
 *   - Automatic paper cutting (massicot) between copies
 *   - Raw Windows Spooler dispatch via winspool API
 *
 * @module ThermalPrinterService
 */

import { nativeImage, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { SettingsRepository } from '../database/repositories/settings.repository'

export interface ReceiptItem {
  label: string
  amount: number
  detail?: string
  payment_type?: string
  month?: string
}

export interface ReceiptData {
  student_name?: string
  student_id?: string
  student_number?: string
  class_name?: string
  amount?: number
  payment_type?: string
  payment_date?: string
  month?: string
  receipt_number?: string
  payment_method?: string
  department?: string
  description?: string
  cashier_name?: string
  school_year?: string
  items?: ReceiptItem[]
}

export class ThermalPrinterService {
  /**
   * Get configured or default printer name
   */
  static getPrinterName(): string {
    const configured = SettingsRepository.get('printer_name') as string | null
    return (configured && configured.trim()) || 'POS-80'
  }

  /**
   * Helper: format a line with left text and right text totaling exactly 'width' characters (default 48)
   */
  static formatLine(left: string, right: string, width = 48): string {
    const leftLen = left.length
    const rightLen = right.length
    if (leftLen + rightLen >= width) {
      const maxLeft = Math.max(1, width - rightLen - 1)
      return left.slice(0, maxLeft) + ' ' + right + '\n'
    }
    const spaces = ' '.repeat(width - leftLen - rightLen)
    return left + spaces + right + '\n'
  }

  /**
   * Helper: generate a separator line
   */
  static separatorLine(char = '-', width = 48): string {
    return char.repeat(width) + '\n'
  }

  /**
   * Convert school logo PNG to ESC/POS raster bit image (GS v 0)
   */
  static generateLogoEscPos(targetWidth = 192): Buffer | null {
    try {
      const isDev = !app.isPackaged
      let logoPath = isDev
        ? path.join(process.cwd(), 'resources', 'logo.png')
        : path.join(process.resourcesPath, 'logo.png')

      // Check if custom logo exists in settings
      const customLogo = SettingsRepository.get('school_logo') as string | null
      if (customLogo && fs.existsSync(customLogo)) {
        logoPath = customLogo
      }

      if (!fs.existsSync(logoPath)) {
        return null
      }

      const img = nativeImage.createFromPath(logoPath)
      const size = img.getSize()
      if (!size.width || !size.height) return null

      // Target width must be divisible by 8 for ESC/POS raster bit image
      const width = Math.round(targetWidth / 8) * 8
      const height = Math.round((size.height * width) / size.width)

      const resized = img.resize({ width, height, quality: 'best' })
      const rawBitmap = resized.toBitmap() // BGRA 4 bytes per pixel

      const bytesWidth = width / 8
      const rasterData = Buffer.alloc(bytesWidth * height, 0)

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixelIndex = (y * width + x) * 4
          const b = rawBitmap[pixelIndex]
          const g = rawBitmap[pixelIndex + 1]
          const r = rawBitmap[pixelIndex + 2]
          const a = rawBitmap[pixelIndex + 3]

          // Treat transparent as white; if opaque, calculate grayscale luminance
          let isBlack = false
          if (a > 64) {
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b
            isBlack = luminance < 170
          }

          if (isBlack) {
            const byteIndex = y * bytesWidth + Math.floor(x / 8)
            const bitPosition = 7 - (x % 8)
            rasterData[byteIndex] |= 1 << bitPosition
          }
        }
      }

      // GS v 0 m xL xH yL yH d1...dk
      const header = Buffer.from([
        0x1b,
        0x61,
        0x01, // Center align
        0x1d,
        0x76,
        0x30,
        0x00, // GS v 0 0
        bytesWidth & 0xff,
        (bytesWidth >> 8) & 0xff,
        height & 0xff,
        (height >> 8) & 0xff
      ])

      return Buffer.concat([header, rasterData, Buffer.from([0x0a])])
    } catch (e) {
      console.warn('Could not generate ESC/POS logo:', e)
      return null
    }
  }

  /**
   * Convert string to Windows-1252 / CP850 single bytes for French accents.
   * Combined with FS . (disable Chinese mode), this guarantees accents print properly.
   */
  static encodeText(text: string): Buffer {
    const map1252: Record<string, number> = {
      é: 0xe9,
      É: 0xc9,
      è: 0xe8,
      È: 0xc8,
      ê: 0xea,
      Ê: 0xca,
      ë: 0xeb,
      Ë: 0xcb,
      à: 0xe0,
      À: 0xc0,
      â: 0xe2,
      Â: 0xc2,
      ä: 0xe4,
      Ä: 0xc4,
      î: 0xee,
      Î: 0xce,
      ï: 0xef,
      Ï: 0xcf,
      ô: 0xf4,
      Ô: 0xd4,
      ö: 0xf6,
      Ö: 0xd6,
      ù: 0xf9,
      Ù: 0xd9,
      û: 0xfb,
      Û: 0xdb,
      ü: 0xfc,
      Ü: 0xdc,
      ç: 0xe7,
      Ç: 0xc7,
      '°': 0xb0,
      '€': 0x80,
      '’': 0x27,
      '‘': 0x27,
      '“': 0x22,
      '”': 0x22,
      '–': 0x2d,
      '—': 0x2d,
      '«': 0xab,
      '»': 0xbb
    }

    const bytes: number[] = []
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (map1252[ch] !== undefined) {
        bytes.push(map1252[ch])
      } else {
        const code = ch.charCodeAt(0)
        if (code < 128) {
          bytes.push(code)
        } else {
          // Normalize to closest ASCII character (e.g. œ -> oe)
          const normalized = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          if (normalized.length > 0 && normalized.charCodeAt(0) < 128) {
            bytes.push(normalized.charCodeAt(0))
          } else {
            bytes.push(0x20)
          }
        }
      }
    }
    return Buffer.from(bytes)
  }

  /**
   * Format human friendly payment type label
   */
  static formatPaymentType(type: string): string {
    const map: Record<string, string> = {
      tuition: 'Écolage mensuel',
      enrollment: "Droit d'inscription",
      reenrollment: 'Droit de réinscription',
      bus: 'Transport scolaire (Bus)',
      canteen: 'Restauration (Cantine)',
      uniform: 'Uniforme & Fournitures',
      event: 'Événement / Sortie',
      fram: 'Cotisation FRAM',
      other: 'Divers'
    }
    return map[type] || type
  }

  /**
   * Format human friendly payment method
   */
  static formatPaymentMethod(method?: string): string {
    if (!method) return 'Espèces'
    if (method === 'cash') return 'Espèces'
    if (method === 'check') return 'Chèque'
    if (method === 'transfer') return 'Virement bancaire'
    if (method === 'mobile_money') return 'Mobile Money'
    if (method === 'discount') return 'Remise exceptionnelle'
    return method
  }

  /**
   * Build ESC/POS bytes for a single receipt copy
   */
  static buildSingleReceiptBytes(data: ReceiptData, copyType: 'PARENT' | 'CAISSE'): Buffer {
    const buffers: Buffer[] = []

    // 1. ESC @: Initialize printer
    buffers.push(Buffer.from([0x1b, 0x40]))

    // 2. FS . : Cancel Chinese / Kanji character mode (Crucial on Xprinter to avoid Chinese characters on accents!)
    buffers.push(Buffer.from([0x1c, 0x2e]))

    // 3. ESC t 16 (0x10): Select Character Code Table WPC1252 (Windows-1252 / Western European)
    buffers.push(Buffer.from([0x1b, 0x74, 0x10]))

    // 4. Logo (Centered)
    const logoBytes = this.generateLogoEscPos(192)
    if (logoBytes) {
      buffers.push(logoBytes)
    }

    // 5. Header: School Name (Centered, Bold, Double Height)
    const schoolName =
      (SettingsRepository.get('school_name') as string) || 'LYCÉE PRIVÉ MANJARY SOA'
    buffers.push(Buffer.from([0x1b, 0x61, 0x01])) // Center
    buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
    buffers.push(Buffer.from([0x1d, 0x21, 0x01])) // Double height
    buffers.push(this.encodeText(`${schoolName.toUpperCase()}\n`))

    // Subheader: Address & contact
    buffers.push(Buffer.from([0x1d, 0x21, 0x00])) // Normal size
    buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    buffers.push(this.encodeText('Lot H 61 Miadana Alasora\n'))
    buffers.push(this.encodeText('Antananarivo, Madagascar\n'))
    buffers.push(this.encodeText(this.separatorLine('=')))

    // Copy Badge
    buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
    if (copyType === 'PARENT') {
      buffers.push(this.encodeText('*** REÇU — EXEMPLAIRE PARENT / ÉLÈVE ***\n'))
    } else {
      buffers.push(this.encodeText('*** REÇU — EXEMPLAIRE ÉTABLISSEMENT / CAISSE ***\n'))
    }
    buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    buffers.push(this.encodeText(this.separatorLine('=')))

    // Metadata: Receipt number, Date, Cashier (Left aligned)
    buffers.push(Buffer.from([0x1b, 0x61, 0x00])) // Left align

    const receiptNum = data.receipt_number || `REC-${Date.now().toString().slice(-6)}`
    const now = new Date()
    const paymentDateObj = data.payment_date ? new Date(data.payment_date) : now
    const dateFormatted = paymentDateObj.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
    const timeFormatted = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

    buffers.push(this.encodeText(this.formatLine(`N° Reçu  : ${receiptNum}`, '')))
    buffers.push(this.encodeText(this.formatLine(`Date     : ${dateFormatted} à ${timeFormatted}`, '')))
    if (data.cashier_name) {
      buffers.push(this.encodeText(this.formatLine(`Caissier : ${data.cashier_name}`, '')))
    }
    buffers.push(this.encodeText(this.separatorLine('-')))

    // Student Information
    if (data.student_name && data.student_name !== '—') {
      buffers.push(this.encodeText(`Élève    : ${data.student_name}\n`))
      const studentClass = data.class_name && data.class_name !== '-' ? `Classe: ${data.class_name}` : ''
      const studentMatr = data.student_number ? `Matr. : ${data.student_number}` : ''
      if (studentMatr || studentClass) {
        buffers.push(this.encodeText(this.formatLine(studentMatr, studentClass)))
      }
    } else if (data.description) {
      buffers.push(this.encodeText(`Libellé  : ${data.description}\n`))
    }
    buffers.push(this.encodeText(this.separatorLine('-')))

    // Payment Items Breakdown
    const hasMultipleItems = Array.isArray(data.items) && data.items.length > 0

    if (hasMultipleItems) {
      buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
      buffers.push(this.encodeText(this.formatLine('DÉSIGNATION DES PAIEMENTS', 'MONTANT')))
      buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
      buffers.push(this.encodeText(this.separatorLine('-')))

      data.items!.forEach((item, idx) => {
        const itemLabel =
          item.label ||
          (item.payment_type ? this.formatPaymentType(item.payment_type) : `Article ${idx + 1}`)
        const itemAmtStr = `${(item.amount || 0).toLocaleString('fr-FR').replace(/\s/g, ' ')} Ar`
        buffers.push(this.encodeText(this.formatLine(itemLabel, itemAmtStr)))
        if (item.detail && item.detail !== itemLabel) {
          buffers.push(this.encodeText(`  (${item.detail})\n`))
        }
      })
    } else {
      const typeLabel = this.formatPaymentType(data.payment_type || 'other')
      buffers.push(this.encodeText(`Motif    : ${typeLabel}\n`))
      if (data.month) {
        buffers.push(this.encodeText(`Mois     : ${data.month}\n`))
      }
      if (data.description && data.student_name && data.description !== data.student_name) {
        buffers.push(this.encodeText(`Détail   : ${data.description}\n`))
      }
    }

    buffers.push(this.encodeText(this.separatorLine('-')))
    buffers.push(
      this.encodeText(
        this.formatLine(`Règlement: ${this.formatPaymentMethod(data.payment_method)}`, '')
      )
    )
    buffers.push(this.encodeText(this.separatorLine('=')))

    // Grand Total (Centered, Large Bold)
    const grandTotal =
      data.amount !== undefined
        ? data.amount
        : hasMultipleItems
          ? data.items!.reduce((sum, it) => sum + (Number(it.amount) || 0), 0)
          : 0

    const formattedTotal = grandTotal.toLocaleString('fr-FR').replace(/\s/g, ' ')
    buffers.push(Buffer.from([0x1b, 0x61, 0x01])) // Center
    buffers.push(this.encodeText('TOTAL ENCAISSÉ\n'))
    buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
    buffers.push(Buffer.from([0x1d, 0x21, 0x11])) // Double height + width
    buffers.push(this.encodeText(`${formattedTotal} Ar\n`))
    buffers.push(Buffer.from([0x1d, 0x21, 0x00])) // Normal size
    buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    buffers.push(this.encodeText(this.separatorLine('=')))

    // Footer Signature Box
    buffers.push(Buffer.from([0x1b, 0x61, 0x00])) // Left align
    buffers.push(this.encodeText('Conservez ce reçu pour tout contrôle.\n\n'))
    buffers.push(Buffer.from([0x1b, 0x61, 0x02])) // Right align
    buffers.push(this.encodeText('Signature & Cachet Caisse :\n\n\n'))
    buffers.push(this.encodeText('............................\n\n\n'))

    // Auto-cutter: GS V A 3 (Feed 3 lines and cut paper)
    buffers.push(Buffer.from([0x1d, 0x56, 0x41, 0x03]))

    return Buffer.concat(buffers)
  }

  /**
   * Send raw byte buffer to Windows printer using winspool
   */
  static async sendBytesToPrinter(
    printerName: string,
    bytes: Buffer,
    docName = 'Ticket de Caisse'
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      // Temporary base64 storage for script execution
      const b64 = bytes.toString('base64')
      const psScript = `
$code = @'
using System;
using System.Runtime.InteropServices;

public class RawSpooler {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytes(string szPrinterName, byte[] pBytes, string docName) {
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = docName;
        di.pDataType = "RAW";

        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(pBytes.Length);
                    Marshal.Copy(pBytes, 0, pUnmanagedBytes, pBytes.Length);
                    int dwWritten = 0;
                    bool success = WritePrinter(hPrinter, pUnmanagedBytes, pBytes.Length, out dwWritten);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                    EndDocPrinter(hPrinter);
                    ClosePrinter(hPrinter);
                    return success;
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return false;
    }
}
'@

try {
    Add-Type -TypeDefinition $code -ErrorAction Stop
} catch {
    # Already loaded in session
}

$bytes = [Convert]::FromBase64String("${b64}")
$res = [RawSpooler]::SendBytes("${printerName.replace(/"/g, '')}", $bytes, "${docName.replace(/"/g, '')}")
if ($res) {
    Write-Output "SUCCESS"
} else {
    Write-Output "FAILED"
}
`

      const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        psScript
      ])

      let stdout = ''
      let stderr = ''

      ps.stdout.on('data', (d) => {
        stdout += d.toString()
      })
      ps.stderr.on('data', (d) => {
        stderr += d.toString()
      })

      ps.on('close', (code) => {
        if (code === 0 && stdout.includes('SUCCESS')) {
          resolve({ success: true })
        } else {
          resolve({
            success: false,
            error: stderr || `Échec d'impression sur '${printerName}'. Vérifiez que l'imprimante est allumée et branchée.`
          })
        }
      })

      ps.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })
  }

  /**
   * Print a complete payment receipt with 2 copies (Parent + Cashier)
   */
  static async printReceipt(
    data: ReceiptData,
    copies = 2,
    customPrinterName?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const printerName = customPrinterName || this.getPrinterName()

      const buffers: Buffer[] = []

      // Copy 1: Parent Copy
      buffers.push(this.buildSingleReceiptBytes(data, 'PARENT'))

      // Copy 2: School / Cashier Copy (if requested)
      if (copies >= 2) {
        buffers.push(this.buildSingleReceiptBytes(data, 'CAISSE'))
      }

      const allBytes = Buffer.concat(buffers)
      return await this.sendBytesToPrinter(printerName, allBytes, `Reçu ${data.receipt_number || ''}`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur impression thermique'
      return { success: false, error: message }
    }
  }

  /**
   * Get list of all installed Windows printers
   */
  static async getInstalledPrinters(): Promise<Array<{ name: string; isDefault: boolean; status: string }>> {
    return new Promise((resolve) => {
      const psScript = `Get-Printer | Select-Object Name, Type, DriverName, PortName, PrinterStatus | ConvertTo-Json -Compress`
      const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        psScript
      ])

      let stdout = ''
      ps.stdout.on('data', (d) => {
        stdout += d.toString()
      })

      ps.on('close', () => {
        try {
          if (!stdout.trim()) {
            resolve([{ name: 'POS-80', isDefault: true, status: 'Normal' }])
            return
          }
          const parsed = JSON.parse(stdout)
          const list = Array.isArray(parsed) ? parsed : [parsed]
          const defaultPrinter = ThermalPrinterService.getPrinterName()
          const result = list.map((p: any) => ({
            name: p.Name || 'Inconnu',
            isDefault: (p.Name || '').toLowerCase() === defaultPrinter.toLowerCase(),
            status: p.PrinterStatus || 'Normal'
          }))
          resolve(result)
        } catch {
          resolve([{ name: 'POS-80', isDefault: true, status: 'Normal' }])
        }
      })

      ps.on('error', () => {
        resolve([{ name: 'POS-80', isDefault: true, status: 'Normal' }])
      })
    })
  }

  /**
   * Send a diagnostic test receipt
   */
  static async printTestReceipt(
    targetPrinter?: string
  ): Promise<{ success: boolean; error?: string }> {
    const printer = targetPrinter || this.getPrinterName()
    const dummyData: ReceiptData = {
      student_name: 'TEST ÉLÈVE — RAKOTO Jean',
      student_number: 'MAT-2026-001',
      class_name: 'Terminale S',
      amount: 145000,
      payment_type: 'enrollment',
      payment_date: new Date().toISOString().split('T')[0],
      month: 'Septembre 2026',
      receipt_number: 'TEST-001',
      payment_method: 'cash',
      cashier_name: 'Administrateur Test'
    }
    return await this.printReceipt(dummyData, 1, printer)
  }
}
