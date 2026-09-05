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
import { normalizeStationCode } from '../database/repositories/payment.repository'

export interface ReceiptItem {
  label: string
  amount: number
  detail?: string
  payment_type?: string
  month?: string
  is_duplicate?: boolean
  duplicate_count?: number
  receipt_number?: string
}

export interface ReceiptData {
  payment_ids?: string[]
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
  printed_by?: string
  school_year?: string
  items?: ReceiptItem[]
  is_duplicate?: boolean
  duplicate_count?: number
  original_date?: string
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
      const customLogo = SettingsRepository.get('school_logo') as string | null
      const candidates = [
        customLogo,
        isDev ? path.join(process.cwd(), 'resources', 'logo.png') : null,
        path.join(app.getAppPath(), 'resources', 'logo.png'),
        path.join(process.resourcesPath, 'resources', 'logo.png'),
        path.join(process.resourcesPath, 'logo.png'),
        path.join(process.cwd(), 'resources', 'logo.png'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'logo.png')
      ].filter(Boolean) as string[]

      let logoPath: string | null = null
      for (const cand of candidates) {
        if (cand && fs.existsSync(cand)) {
          logoPath = cand
          break
        }
      }

      if (!logoPath) {
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
   * Format payment type code to friendly French label
   */
  private static formatPaymentType(type: string): string {
    const labels: Record<string, string> = {
      tuition: 'Écolage',
      enrollment: "Droit d'inscription",
      reenrollment: 'Droit de réinscription',
      bus: 'Transport scolaire (Bus)',
      canteen: 'Cantine scolaire',
      uniform: 'Uniforme & Fournitures',
      fram: 'Cotisation FRAM',
      event: 'Événement / Sortie',
      other: 'Autre versement'
    }
    return labels[type] || type
  }

  /**
   * Format payment method code to friendly French label
   */
  private static formatPaymentMethod(method?: string): string {
    const methods: Record<string, string> = {
      cash: 'Espèces',
      check: 'Chèque',
      transfer: 'Virement bancaire',
      mobile_money: 'Mobile Money',
      discount: 'Remise gracieuse'
    }
    return (method && methods[method]) || 'Espèces'
  }

  /**
   * Build complete ESC/POS buffer for a receipt copy (80mm width / 48 columns)
   */
  static buildSingleReceiptBytes(data: ReceiptData, copyType: 'PARENT' | 'CAISSE'): Buffer {
    const buffers: Buffer[] = []

    // 1. Initialize printer: ESC @ (Initialize)
    buffers.push(Buffer.from([0x1b, 0x40]))

    // 2. DISABLE Chinese/Kanji mode: FS . (0x1C, 0x2E) - CRITICAL for Xprinter POS-80
    buffers.push(Buffer.from([0x1c, 0x2e]))

    // 3. Set character code table: ESC t 16 (Windows-1252 / WPC1252)
    buffers.push(Buffer.from([0x1b, 0x74, 0x10]))

    // 4. Print Logo if available (Centered)
    const logoBytes = this.generateLogoEscPos(192)
    if (logoBytes) {
      buffers.push(logoBytes)
    }

    // 5. Header: School Name (Centered, Double Height, Bold)
    const schoolName =
      (SettingsRepository.get('school_name') as string) || 'LYCÉE PRIVÉ MANJARY SOA'
    buffers.push(Buffer.from([0x1b, 0x61, 0x01])) // Center
    buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
    buffers.push(Buffer.from([0x1d, 0x21, 0x01])) // Double height
    buffers.push(this.encodeText(`${schoolName.toUpperCase()}\n`))

    // Subheader: Address & contact
    buffers.push(Buffer.from([0x1d, 0x21, 0x00])) // Normal size
    buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    buffers.push(this.encodeText('Lot H 81 Miadana Alasora\n'))
    buffers.push(this.encodeText('Antananarivo, Madagascar\n'))
    buffers.push(this.encodeText(this.separatorLine('=')))

    // Copy Badge
    buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
    const dupNum = data.duplicate_count || 1
    const hasMultipleItems = Array.isArray(data.items) && data.items.length > 0
    const hasAnyDuplicateItem =
      hasMultipleItems &&
      data.items!.some((it) => (it.duplicate_count || 0) >= 1 || it.is_duplicate)
    const allDuplicateItems =
      hasMultipleItems &&
      data.items!.every((it) => (it.duplicate_count || 0) >= 1 || it.is_duplicate)

    if (hasMultipleItems) {
      if (data.is_duplicate || allDuplicateItems) {
        if (copyType === 'PARENT') {
          buffers.push(
            this.encodeText(`*** REÇU GROUPÉ (DUPLICATA N° ${dupNum}) — EXEMPLAIRE PARENT ***\n`)
          )
        } else {
          buffers.push(
            this.encodeText(`*** REÇU GROUPÉ (DUPLICATA N° ${dupNum}) — EXEMPLAIRE CAISSE ***\n`)
          )
        }
      } else if (hasAnyDuplicateItem) {
        if (copyType === 'PARENT') {
          buffers.push(
            this.encodeText(
              `*** REÇU GROUPÉ (DUPLICATA PARTIEL N° ${dupNum}) — EXEMPLAIRE PARENT ***\n`
            )
          )
        } else {
          buffers.push(
            this.encodeText(
              `*** REÇU GROUPÉ (DUPLICATA PARTIEL N° ${dupNum}) — EXEMPLAIRE CAISSE ***\n`
            )
          )
        }
      } else {
        if (copyType === 'PARENT') {
          buffers.push(this.encodeText('*** REÇU GROUPÉ ORIGINAL — EXEMPLAIRE PARENT ***\n'))
        } else {
          buffers.push(this.encodeText('*** REÇU GROUPÉ ORIGINAL — EXEMPLAIRE CAISSE ***\n'))
        }
      }
    } else {
      if (data.is_duplicate) {
        if (copyType === 'PARENT') {
          buffers.push(this.encodeText(`*** DUPLICATA N° ${dupNum} — EXEMPLAIRE PARENT ***\n`))
        } else {
          buffers.push(this.encodeText(`*** DUPLICATA N° ${dupNum} — EXEMPLAIRE CAISSE ***\n`))
        }
      } else {
        if (copyType === 'PARENT') {
          buffers.push(this.encodeText('*** REÇU ORIGINAL — EXEMPLAIRE PARENT ***\n'))
        } else {
          buffers.push(this.encodeText('*** REÇU ORIGINAL — EXEMPLAIRE CAISSE ***\n'))
        }
      }
    }
    buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    buffers.push(this.encodeText(this.separatorLine('=')))

    // Metadata: Receipt number, Date, Cashier (Left aligned)
    const now = new Date()
    const paymentDateObj = data.payment_date ? new Date(data.payment_date) : now
    const dateFormatted = paymentDateObj.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
    const timeFormatted = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    const isAnyDup = data.is_duplicate || hasAnyDuplicateItem

    buffers.push(Buffer.from([0x1b, 0x61, 0x00])) // Left align

    const currentYear = new Date().getFullYear().toString()
    const stationCode = normalizeStationCode(
      SettingsRepository.get('pos_station_code') as string
    )
    const fallbackReceiptNum = `REC-${currentYear}-${stationCode}-${Date.now().toString().slice(-5)}`
    let receiptNum = (data.receipt_number || fallbackReceiptNum).trim()
    // Normalize legacy format: REC-2026-00019 -> REC-2026-C1-00019
    receiptNum = receiptNum.replace(/^REC-(\d{4})-(\d{5})$/, `REC-$1-${stationCode}-$2`)
    // Also normalize legacy range: REC-2026-00019 — 00021 -> REC-2026-C1-00019 — 00021
    receiptNum = receiptNum.replace(
      /^REC-(\d{4})-(\d{5}) — (\d{5})$/,
      `REC-$1-${stationCode}-$2 — $3`
    )

    buffers.push(this.encodeText(this.formatLine(`N° Reçu  : ${receiptNum}`, '')))
    buffers.push(this.encodeText(this.formatLine(`Date     : ${dateFormatted} à ${timeFormatted}`, '')))
    buffers.push(this.encodeText(this.formatLine(`Caissier : ${data.cashier_name || data.printed_by || 'Administrateur'}`, '')))
    if (isAnyDup) {
      buffers.push(this.encodeText(this.formatLine(`Mention  : Duplicata certifié N°${dupNum}`, '')))
    }
    buffers.push(this.encodeText(this.separatorLine('-')))

    // Student Information
    const studentName = data.student_name && data.student_name !== '—' ? data.student_name : (data.description || '—')
    buffers.push(this.encodeText(`Élève    : ${studentName}\n`))
    const studentClass = data.class_name && data.class_name !== '-' ? `Classe: ${data.class_name}` : ''
    const studentMatr = data.student_number && data.student_number !== '—' ? `Matr. : ${data.student_number}` : ''
    if (studentMatr || studentClass) {
      buffers.push(this.encodeText(this.formatLine(studentMatr, studentClass)))
    }
    buffers.push(this.encodeText(this.separatorLine('-')))

    // UNIFIED Payment Items Breakdown Table (Always 2 columns)
    buffers.push(Buffer.from([0x1b, 0x45, 0x01])) // Bold ON
    buffers.push(this.encodeText(this.formatLine('DÉSIGNATION DES PAIEMENTS', 'MONTANT')))
    buffers.push(Buffer.from([0x1b, 0x45, 0x00])) // Bold OFF
    buffers.push(this.encodeText(this.separatorLine('-')))

    // Prepare unified items list
    const itemsToPrint: ReceiptItem[] = hasMultipleItems
      ? data.items!
      : [
          {
            label:
              this.formatPaymentType(data.payment_type || 'other') +
              (data.month ? ` (${data.month})` : ''),
            amount: Number(data.amount) || 0,
            detail:
              data.description && data.description !== data.student_name && !data.description.includes(data.student_name || 'xyz')
                ? data.description
                : undefined,
            payment_type: data.payment_type,
            month: data.month,
            is_duplicate: data.is_duplicate,
            duplicate_count: data.duplicate_count
          }
        ]

    itemsToPrint.forEach((item, idx) => {
      const baseLabel =
        item.label ||
        (item.payment_type ? this.formatPaymentType(item.payment_type) + (item.month ? ` (${item.month})` : '') : `Article ${idx + 1}`)
      const itemAmtStr = `${(Number(item.amount) || 0).toLocaleString('fr-FR').replace(/\s/g, ' ')} Ar`
      buffers.push(this.encodeText(this.formatLine(baseLabel, itemAmtStr)))

      if (item.detail && item.detail !== baseLabel && !item.detail.startsWith('Paiement ')) {
        buffers.push(this.encodeText(`  (${item.detail})\n`))
      }

      if (item.is_duplicate && !data.is_duplicate) {
        buffers.push(this.encodeText(`  [Duplicata N°${item.duplicate_count || 1} — Déjà émis]\n`))
      }
    })

    buffers.push(this.encodeText(this.separatorLine('-')))
    buffers.push(
      this.encodeText(
        this.formatLine(`Règlement: ${this.formatPaymentMethod(data.payment_method)}`, '')
      )
    )
    buffers.push(this.encodeText(this.separatorLine('=')))

    // Grand Total (Centered, Large Bold)
    const grandTotal =
      data.amount !== undefined && data.amount > 0
        ? data.amount
        : itemsToPrint.reduce((sum, it) => sum + (Number(it.amount) || 0), 0)

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
    buffers.push(this.encodeText('Signature & Cachet Caisse :\n\n'))
    buffers.push(this.encodeText('............................\n'))

    // Auto-cutter: Feed 4 lines past printhead + Safe Partial Cut (GS V 1)
    buffers.push(Buffer.from([0x1b, 0x64, 0x04])) // ESC d 4 (Feed 4 lines)
    buffers.push(Buffer.from([0x1d, 0x56, 0x01])) // GS V 1 (Partial cut)

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
      const isDev = !app.isPackaged
      const tempFile = path.join(
        app.getPath('temp'),
        `pos_print_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.bin`
      )

      try {
        fs.writeFileSync(tempFile, bytes)
      } catch (err: unknown) {
        resolve({ success: false, error: 'Erreur écriture fichier temporaire: ' + String(err) })
        return
      }

      const scriptCandidates = [
        isDev ? path.join(process.cwd(), 'tools/printer/send-raw.ps1') : null,
        path.join(process.resourcesPath, 'tools/printer/send-raw.ps1'),
        path.join(app.getAppPath(), 'tools/printer/send-raw.ps1'),
        path.join(process.cwd(), 'tools/printer/send-raw.ps1')
      ].filter(Boolean) as string[]

      const scriptPath = scriptCandidates.find((p) => fs.existsSync(p))

      const cleanup = () => {
        try {
          if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
        } catch {}
      }

      let psArgs: string[]
      if (scriptPath) {
        psArgs = [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-PrinterName',
          printerName,
          '-InputFile',
          tempFile,
          '-DocName',
          docName
        ]
      } else {
        const b64 = bytes.toString('base64')
        const psScript = `
$code = @'
using System;
using System.Runtime.InteropServices;
public class RawSpoolerDirectFallback {
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
    public static bool Send(string szPrinterName, byte[] pBytes, string docName) {
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = docName;
        di.pDataType = "RAW";
        if (OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) {
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
try { Add-Type -TypeDefinition $code -ErrorAction Stop } catch {}
$bytes = [Convert]::FromBase64String("${b64}")
$res = [RawSpoolerDirectFallback]::Send("${printerName.replace(/"/g, '')}", $bytes, "${docName.replace(/"/g, '')}")
if ($res) { Write-Output "SUCCESS" } else { Write-Output "FAILED" }
`
        psArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript]
      }

      const ps = spawn('powershell.exe', psArgs)

      let stdout = ''
      let stderr = ''

      ps.stdout.on('data', (d) => {
        stdout += d.toString()
      })
      ps.stderr.on('data', (d) => {
        stderr += d.toString()
      })

      ps.on('close', (code) => {
        cleanup()
        if (code === 0 && stdout.includes('SUCCESS')) {
          resolve({ success: true })
        } else {
          resolve({
            success: false,
            error:
              stderr ||
              `Échec d'impression sur '${printerName}'. Vérifiez que l'imprimante est allumée et branchée.`
          })
        }
      })

      ps.on('error', (err) => {
        cleanup()
        resolve({ success: false, error: err.message })
      })
    })
  }

  /**
   * Print a complete payment receipt with 2 copies (Parent + Cashier)
   * Dispatches copies separately with 750ms cutter cooldown to prevent jams and resets
   */
  static async printReceipt(
    data: ReceiptData,
    copies = 2,
    customPrinterName?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const printerName = customPrinterName || this.getPrinterName()

      // Copy 1: Parent Copy
      const copy1Bytes = this.buildSingleReceiptBytes(data, 'PARENT')
      const res1 = await this.sendBytesToPrinter(
        printerName,
        copy1Bytes,
        `Reçu ${data.receipt_number || ''} - Exemplaire Parent`
      )
      if (!res1.success) return res1

      // Copy 2: School / Cashier Copy (if requested)
      if (copies >= 2) {
        // Cooldown pause so the cutter blade returns home safely before sending copy 2
        await new Promise((resolve) => setTimeout(resolve, 750))
        const copy2Bytes = this.buildSingleReceiptBytes(data, 'CAISSE')
        const res2 = await this.sendBytesToPrinter(
          printerName,
          copy2Bytes,
          `Reçu ${data.receipt_number || ''} - Exemplaire Caisse`
        )
        return res2
      }

      return res1
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

  /**
   * Check if POS-80 printer is currently installed and ready in Windows
   */
  static async checkPrinterStatus(): Promise<{
    isInstalled: boolean
    name?: string
    portName?: string
    driverName?: string
    status?: string
    error?: string
  }> {
    return new Promise((resolve) => {
      const psScript = `Get-Printer -Name 'POS-80' -ErrorAction SilentlyContinue | Select-Object Name, PortName, DriverName, PrinterStatus | ConvertTo-Json -Compress`
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
            resolve({ isInstalled: false })
            return
          }
          const parsed = JSON.parse(stdout)
          if (parsed && parsed.Name) {
            resolve({
              isInstalled: true,
              name: parsed.Name,
              portName: parsed.PortName,
              driverName: parsed.DriverName,
              status: parsed.PrinterStatus === 0 ? 'Normal' : String(parsed.PrinterStatus)
            })
            return
          }
          resolve({ isInstalled: false })
        } catch {
          resolve({ isInstalled: false })
        }
      })

      ps.on('error', (err) => {
        resolve({ isInstalled: false, error: err.message })
      })
    })
  }

  /**
   * Run elevated installation / verification of the POS-80 printer driver
   */
  static async installPrinterDriver(): Promise<{
    success: boolean
    isInstalled: boolean
    message?: string
    error?: string
  }> {
    const isDev = !app.isPackaged
    const scriptDir = isDev
      ? path.join(app.getAppPath(), 'tools', 'printer')
      : path.join(process.resourcesPath, 'tools', 'printer')

    const batPath = path.join(scriptDir, 'installer-xprinter.bat')
    if (!fs.existsSync(batPath)) {
      return {
        success: false,
        isInstalled: false,
        error: `Fichier d'installation introuvable : ${batPath}`
      }
    }

    return new Promise((resolve) => {
      // Execute the batch with admin elevation using PowerShell Start-Process -Verb RunAs -Wait
      const elevateCmd = `Start-Process -FilePath "${batPath}" -ArgumentList "--no-pause" -Verb RunAs -Wait`
      const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        elevateCmd
      ])

      ps.on('close', async (code) => {
        // Wait 1 second for Windows spooler to settle
        await new Promise((r) => setTimeout(r, 1000))
        const status = await ThermalPrinterService.checkPrinterStatus()
        if (status.isInstalled) {
          resolve({
            success: true,
            isInstalled: true,
            message: `Imprimante POS-80 configurée avec succès sur le port ${status.portName || 'USB'} !`
          })
        } else {
          if (code !== 0) {
            resolve({
              success: false,
              isInstalled: false,
              error: "L'installation a été annulée ou l'autorisation administrateur Windows n'a pas été accordée."
            })
          } else {
            resolve({
              success: false,
              isInstalled: false,
              error: "Le script s'est exécuté mais l'imprimante POS-80 n'a pas été détectée. Vérifiez que la Xprinter est allumée et branchée en USB."
            })
          }
        }
      })

      ps.on('error', (err) => {
        resolve({
          success: false,
          isInstalled: false,
          error: `Erreur d'exécution de l'assistant : ${err.message}`
        })
      })
    })
  }

  /**
   * Intelligently auto-detect which USB port is occupied by POS-80 (avoiding conflicts with other printers like Canon/Nicon)
   * and automatically re-binds POS-80 to that port in Windows.
   */
  static async autoDetectAndBindPort(): Promise<{
    success: boolean
    message?: string
    error?: string
    detectedPort?: string
  }> {
    return new Promise((resolve) => {
      const psScript = `
        $occupied = @()
        $otherPrinters = Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'POS-80' -and $_.PortName -like 'USB*' }
        if ($otherPrinters) {
          $occupied = $otherPrinters | ForEach-Object { $_.PortName }
        }
        $candidatePorts = @('USB001', 'USB002', 'USB003', 'USB004', 'USB005')
        $chosenPort = 'USB001'
        foreach ($p in $candidatePorts) {
          if ($occupied -notcontains $p) {
            $chosenPort = $p
            break
          }
        }
        $pos = Get-Printer -Name 'POS-80' -ErrorAction SilentlyContinue
        if ($pos) {
          Set-Printer -Name 'POS-80' -PortName $chosenPort -ErrorAction SilentlyContinue
          Write-Output "BOUND:$chosenPort"
        } else {
          Write-Output "NOT_INSTALLED:$chosenPort"
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

      ps.on('close', () => {
        if (stdout.includes('BOUND:')) {
          const port = stdout.split('BOUND:')[1]?.trim()
          resolve({
            success: true,
            detectedPort: port,
            message: `Imprimante POS-80 reliée avec succès au port ${port} (aucun conflit détecté).`
          })
        } else if (stdout.includes('NOT_INSTALLED:')) {
          const port = stdout.split('NOT_INSTALLED:')[1]?.trim()
          resolve({
            success: false,
            detectedPort: port,
            error: `L'imprimante POS-80 n'est pas encore créée sous Windows. Lancez d'abord l'installation du pilote.`
          })
        } else {
          resolve({
            success: false,
            error: stderr || "Impossible de reconfigurer le port USB de l'imprimante."
          })
        }
      })

      ps.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })
  }

  /**
   * Purge stuck print queue jobs in Windows Spooler
   */
  static async clearSpoolerQueue(printerName = 'POS-80'): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const psScript = `Get-PrintJob -PrinterName '${printerName}' -ErrorAction SilentlyContinue | Remove-PrintJob -ErrorAction SilentlyContinue; Write-Output 'CLEARED'`
      const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        psScript
      ])

      ps.on('close', () => {
        resolve({ success: true })
      })

      ps.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })
  }
}
