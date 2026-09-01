/**
 * export.service.ts — Multi-Format Export Service
 *
 * Supports exporting data to Excel (.xls/.xlsx SpreadsheetML), CSV (UTF-8 BOM),
 * PDF (Landscape Table with Headers & Footers), and JSON.
 *
 * @module ExportService
 */

import { dialog } from 'electron'
import fs from 'fs'
import { jsPDF } from 'jspdf'

export interface ExportColumn {
  key: string
  label: string
  width?: number
}

export interface ExportOptions {
  format: 'xlsx' | 'xls' | 'csv' | 'json' | 'pdf'
  data: Record<string, unknown>[]
  columns: ExportColumn[]
  defaultFilename?: string
  title?: string
  subtitle?: string
  schoolName?: string
  schoolYear?: string
  csvDelimiter?: ';' | ','
}

export class ExportService {
  /**
   * Main entry point to export data to the specified format.
   */
  static async exportData(
    options: ExportOptions
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const {
        format = 'xlsx',
        data,
        columns,
        defaultFilename,
        title = 'Export des données',
        subtitle = '',
        schoolName = 'LMS - Lycée Manjary Soa',
        schoolYear = '',
        csvDelimiter = ';'
      } = options

      if (!data || data.length === 0) {
        return { success: false, error: 'Aucune donnée à exporter' }
      }

      if (!columns || columns.length === 0) {
        return { success: false, error: 'Aucune colonne sélectionnée' }
      }

      const timestamp = new Date().toISOString().split('T')[0]
      let ext = 'xlsx'
      let filterName = 'Excel'
      let baseFilename = defaultFilename || `export_${timestamp}`

      if (format === 'csv') {
        ext = 'csv'
        filterName = 'CSV (Séparateur point-virgule/virgule)'
      } else if (format === 'pdf') {
        ext = 'pdf'
        filterName = 'Document PDF'
      } else if (format === 'json') {
        ext = 'json'
        filterName = 'Fichier JSON'
      } else if (format === 'xls' || format === 'xlsx') {
        ext = 'xls'
        filterName = 'Feuille de calcul Excel'
      }

      if (!baseFilename.toLowerCase().endsWith(`.${ext}`)) {
        baseFilename = `${baseFilename}.${ext}`
      }

      const result = await dialog.showSaveDialog({
        title: `Exporter (${filterName})`,
        defaultPath: baseFilename,
        filters: [{ name: filterName, extensions: [ext] }]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Export annulé par l’utilisateur' }
      }

      const targetPath = result.filePath

      switch (format) {
        case 'csv': {
          const csvContent = this.generateCSV(data, columns, csvDelimiter)
          fs.writeFileSync(targetPath, '\uFEFF' + csvContent, 'utf-8')
          break
        }
        case 'json': {
          const jsonContent = JSON.stringify(data, null, 2)
          fs.writeFileSync(targetPath, jsonContent, 'utf-8')
          break
        }
        case 'xls':
        case 'xlsx': {
          const excelXml = this.generateExcelXML({
            data,
            columns,
            title,
            subtitle,
            schoolName,
            schoolYear
          })
          fs.writeFileSync(targetPath, excelXml, 'utf-8')
          break
        }
        case 'pdf': {
          await this.generatePDF({
            data,
            columns,
            targetPath,
            title,
            subtitle,
            schoolName,
            schoolYear
          })
          break
        }
        default:
          return { success: false, error: `Format non supporté: ${format}` }
      }

      return { success: true, filePath: targetPath }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors de l’export'
      console.error('[ExportService] Export error:', error)
      return { success: false, error: message }
    }
  }

  /**
   * Backward compatible helper for CSV export.
   */
  static async exportToCSV(
    data: Record<string, unknown>[],
    columns: ExportColumn[],
    defaultFilename: string
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    return this.exportData({
      format: 'csv',
      data,
      columns,
      defaultFilename
    })
  }

  /**
   * Generates CSV content with proper quoting and delimiter.
   */
  private static generateCSV(
    data: Record<string, unknown>[],
    columns: ExportColumn[],
    delimiter: string = ';'
  ): string {
    const header = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(delimiter)
    const rows = data.map((row) =>
      columns
        .map((c) => {
          let val = row[c.key]
          if (val === null || val === undefined) return '""'
          if (typeof val === 'boolean') val = val ? 'Oui' : 'Non'
          if (Array.isArray(val)) val = val.join(', ')
          const str = String(val).replace(/"/g, '""')
          return `"${str}"`
        })
        .join(delimiter)
    )

    return [header, ...rows].join('\r\n')
  }

  /**
   * Generates Microsoft Excel XML Spreadsheet (SpreadsheetML) standard document.
   */
  private static generateExcelXML(opts: {
    data: Record<string, unknown>[]
    columns: ExportColumn[]
    title: string
    subtitle: string
    schoolName: string
    schoolYear: string
  }): string {
    const { data, columns, title, subtitle, schoolName, schoolYear } = opts

    const escapeXml = (str: unknown): string => {
      if (str === null || str === undefined) return ''
      if (typeof str === 'boolean') return str ? 'Oui' : 'Non'
      if (Array.isArray(str)) return str.join(', ')
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
    }

    const columnDefs = columns
      .map((c) => {
        const width = Math.max((c.label.length || 10) * 10, 110)
        return `<Column ss:Width="${width}"/>`
      })
      .join('\n      ')

    const headerCells = columns
      .map(
        (c) =>
          `<Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${escapeXml(c.label)}</Data></Cell>`
      )
      .join('\n        ')

    const dataRows = data
      .map((row, idx) => {
        const styleId = idx % 2 === 0 ? 'DataStyleEven' : 'DataStyleOdd'
        const cells = columns
          .map((c) => {
            const rawVal = row[c.key]
            let val = escapeXml(rawVal)
            let type = 'String'

            if (
              typeof rawVal === 'number' &&
              !isNaN(rawVal) &&
              !c.key.includes('contact') &&
              !c.key.includes('phone')
            ) {
              type = 'Number'
              val = String(rawVal)
            }

            return `<Cell ss:StyleID="${styleId}"><Data ss:Type="${type}">${val}</Data></Cell>`
          })
          .join('\n        ')

        return `      <Row ss:Height="20">\n        ${cells}\n      </Row>`
      })
      .join('\n')

    const nowFormatted = new Date().toLocaleString('fr-FR')
    const colSpan = Math.max(columns.length - 1, 1)

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>${escapeXml(title)}</Title>
  <Author>${escapeXml(schoolName)}</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1F2937"/>
  </Style>
  <Style ss:ID="TitleStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="16" ss:Bold="1" ss:Color="#1E3A8A"/>
  </Style>
  <Style ss:ID="SchoolStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="12" ss:Bold="1" ss:Color="#4B5563"/>
  </Style>
  <Style ss:ID="SubtitleStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Italic="1" ss:Color="#6B7280"/>
  </Style>
  <Style ss:ID="MetaStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="9" ss:Color="#9CA3AF"/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E40AF" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataStyleEven">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataStyleOdd">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Export">
  <Table ss:ExpandedColumnCount="${columns.length + 2}" ss:ExpandedRowCount="${data.length + 10}" x:FullColumns="1" x:FullRows="1">
      ${columnDefs}
      <Row ss:Height="24">
        <Cell ss:MergeAcross="${colSpan}" ss:StyleID="SchoolStyle"><Data ss:Type="String">${escapeXml(schoolName)}</Data></Cell>
      </Row>
      <Row ss:Height="28">
        <Cell ss:MergeAcross="${colSpan}" ss:StyleID="TitleStyle"><Data ss:Type="String">${escapeXml(title)}</Data></Cell>
      </Row>
      ${
        subtitle || schoolYear
          ? `<Row ss:Height="18">
        <Cell ss:MergeAcross="${colSpan}" ss:StyleID="SubtitleStyle"><Data ss:Type="String">${escapeXml([schoolYear ? `Année scolaire : ${schoolYear}` : '', subtitle].filter(Boolean).join('  |  '))}</Data></Cell>
      </Row>`
          : ''
      }
      <Row ss:Height="16">
        <Cell ss:MergeAcross="${colSpan}" ss:StyleID="MetaStyle"><Data ss:Type="String">Exporté le ${nowFormatted} — Total : ${data.length} enregistrement(s)</Data></Cell>
      </Row>
      <Row ss:Height="10"/>
      <Row ss:Height="26">
        ${headerCells}
      </Row>
${dataRows}
  </Table>
 </Worksheet>
</Workbook>`
  }

  /**
   * Generates a Landscape PDF document with formatted table and pagination.
   */
  private static async generatePDF(opts: {
    data: Record<string, unknown>[]
    columns: ExportColumn[]
    targetPath: string
    title: string
    subtitle: string
    schoolName: string
    schoolYear: string
  }): Promise<void> {
    const { data, columns, targetPath, title, subtitle, schoolName, schoolYear } = opts

    // A4 Landscape: 297mm x 210mm
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    })

    const pageWidth = doc.internal.pageSize.getWidth() // 297mm
    const pageHeight = doc.internal.pageSize.getHeight() // 210mm
    const margin = 12
    const contentWidth = pageWidth - margin * 2 // 273mm

    // Header function
    const renderHeader = () => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(30, 58, 138) // Deep Blue
      doc.text(schoolName, margin, margin + 4)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(17, 24, 39) // Dark Gray
      doc.text(title, margin, margin + 12)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(107, 114, 128)
      const sub = [schoolYear ? `Année : ${schoolYear}` : '', subtitle, `Total : ${data.length} élèves`]
        .filter(Boolean)
        .join('  •  ')
      doc.text(sub, margin, margin + 18)

      const dateStr = `Date d'export : ${new Date().toLocaleDateString('fr-FR')}`
      doc.text(dateStr, pageWidth - margin - doc.getTextWidth(dateStr), margin + 18)

      // Thin separator line
      doc.setDrawColor(203, 213, 225)
      doc.setLineWidth(0.4)
      doc.line(margin, margin + 21, pageWidth - margin, margin + 21)
    }

    const renderFooter = (pageNumber: number, totalPages: number) => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(156, 163, 175)
      doc.text(
        `LMS — Lycée Manjary Soa • Page ${pageNumber} sur ${totalPages}`,
        pageWidth / 2,
        pageHeight - 6,
        { align: 'center' }
      )
    }

    // Calculate column widths proportionally
    const totalCols = columns.length
    const colWidth = contentWidth / totalCols
    const colWidths = columns.map(() => colWidth)

    let startY = margin + 26
    const rowHeight = 7.5
    const headerHeight = 9

    const renderTableHeader = (currentY: number) => {
      doc.setFillColor(30, 64, 175) // Header Background Blue
      doc.rect(margin, currentY, contentWidth, headerHeight, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(255, 255, 255)

      let currentX = margin
      columns.forEach((col, idx) => {
        const text = col.label
        const truncated = doc.splitTextToSize(text, colWidths[idx] - 2)[0] || text
        doc.text(truncated, currentX + 2, currentY + 6)
        currentX += colWidths[idx]
      })

      return currentY + headerHeight
    }

    let currentPage = 1
    renderHeader()
    startY = renderTableHeader(startY)

    for (let rIdx = 0; rIdx < data.length; rIdx++) {
      // Check if row fits on current page
      if (startY + rowHeight > pageHeight - 15) {
        doc.addPage()
        currentPage++
        renderHeader()
        startY = renderTableHeader(margin + 26)
      }

      const row = data[rIdx]
      const isEven = rIdx % 2 === 0

      // Zebra background
      if (isEven) {
        doc.setFillColor(248, 250, 252) // #F8FAFC
        doc.rect(margin, startY, contentWidth, rowHeight, 'F')
      }

      // Bottom border
      doc.setDrawColor(226, 232, 240)
      doc.setLineWidth(0.2)
      doc.line(margin, startY + rowHeight, margin + contentWidth, startY + rowHeight)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(31, 41, 55)

      let currentX = margin
      columns.forEach((col, cIdx) => {
        let val = row[col.key]
        if (val === null || val === undefined) val = '-'
        if (typeof val === 'boolean') val = val ? 'Oui' : 'Non'
        if (Array.isArray(val)) val = val.join(', ')

        const strVal = String(val)
        const cellWidth = colWidths[cIdx] - 4
        const truncated = doc.splitTextToSize(strVal, cellWidth)[0] || strVal

        doc.text(truncated, currentX + 2, startY + 5)
        currentX += colWidths[cIdx]
      })

      startY += rowHeight
    }

    // Add page numbers
    const totalPages = doc.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      renderFooter(i, totalPages)
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    fs.writeFileSync(targetPath, pdfBuffer)
  }
}
