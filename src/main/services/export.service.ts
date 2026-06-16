/**
 * export.service.ts — CSV Export Service
 *
 * Generic CSV export utility used from any list page.
 *
 * @module ExportService
 */

import { dialog } from 'electron'
import fs from 'fs'

export class ExportService {
  static async exportToCSV(
    data: Record<string, unknown>[],
    columns: { key: string; label: string }[],
    defaultFilename: string
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      if (!data || data.length === 0) {
        return { success: false, error: 'Aucune donnée à exporter' }
      }

      const result = await dialog.showSaveDialog({
        title: 'Exporter en CSV',
        defaultPath: defaultFilename,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Export annulé' }
      }

      const header = columns.map((c) => `"${c.label}"`).join(';')
      const rows = data.map((row) =>
        columns.map((c) => {
          const val = row[c.key]
          if (val === null || val === undefined) return '""'
          const str = String(val).replace(/"/g, '""')
          return `"${str}"`
        }).join(';')
      )

      const csv = [header, ...rows].join('\n')
      fs.writeFileSync(result.filePath, '\uFEFF' + csv, 'utf-8')

      return { success: true, filePath: result.filePath }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur export CSV'
      return { success: false, error: message }
    }
  }
}
