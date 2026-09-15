/**
 * telemetry.service.ts — Workstation Telemetry & Error Monitor ("Mouchard")
 *
 * Automatically captures sync failures, database errors, and system blockages
 * on local workstations (PC1, PC2, etc.) and uploads them to Supabase `audit_logs`.
 * Allows the Superadmin to inspect workstation health, error logs, and pending queue counts.
 *
 * @module TelemetryService
 */

import os from 'os'
import db from '../database/db'
import { supabase } from './sync.service'
import { LoggerService } from './logger.service'

export interface WorkstationTelemetryReport {
  station: string
  hostname: string
  platform: string
  context: string
  message: string
  table_name?: string
  record_id?: string
  pending_count?: number
  error_details?: any
  timestamp: string
}

export function isNetworkOrOfflineError(error: any): boolean {
  if (!error) return false
  const msg = (
    typeof error === 'string'
      ? error
      : `${error.message || ''} ${error.code || ''} ${error.details || ''}`
  ).toLowerCase()

  return (
    msg.includes('enotfound') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('délai d’attente') ||
    msg.includes('délai d\'attente') ||
    msg.includes('offline') ||
    msg.includes('hors ligne') ||
    msg.includes('hors-ligne') ||
    msg.includes('socket hang up') ||
    msg.includes('supabase non configuré')
  )
}

export class TelemetryService {
  /**
   * Retrieves the current station code (e.g. 'C1', 'C2') or fallback to hostname
   */
  static getStationCode(): string {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'pos_station_code'").get() as
        | { value?: string }
        | undefined
      if (row?.value) {
        let val = row.value
        try {
          val = JSON.parse(val)
        } catch {
          // not json
        }
        if (typeof val === 'string' && val.trim()) {
          return val.trim().toUpperCase()
        }
      }
    } catch {
      // ignore
    }
    return os.hostname() || 'PC-INCONNU'
  }

  /**
   * Reports a critical error or sync failure to local SQLite and attempts transmission to Supabase
   */
  static async reportError(
    context: string,
    message: string,
    details?: any,
    extra?: { tableName?: string; recordId?: string; pendingCount?: number }
  ): Promise<boolean> {
    const extraDetails = extra ? { ...(typeof details === 'object' ? details : { details }), ...extra } : details

    // SAFEGUARD: Do not spam cloud telemetry with normal offline network disconnections
    if (isNetworkOrOfflineError(message) || isNetworkOrOfflineError(details) || isNetworkOrOfflineError(extra)) {
      LoggerService.log('info', context, `[Hors-ligne] ${message}`, extraDetails)
      return false
    }

    // 1. Log locally to SQLite app_logs (persisted with resolved = 0)
    LoggerService.log('error', context, message, extraDetails)

    // 2. Attempt to flush pending logs (including this one) to Supabase audit_logs
    const flushResult = await this.flushPendingLogs()
    return flushResult.success
  }

  /**
   * Flushes all un-transmitted local logs (resolved = 0) from SQLite `app_logs` to Supabase `audit_logs`.
   * Preserves all logs in local SQLite forever (never deletes), and marks resolved = 1 on success.
   */
  static async flushPendingLogs(): Promise<{ success: boolean; count: number }> {
    try {
      const rows = db
        .prepare('SELECT * FROM app_logs WHERE resolved = 0 ORDER BY id ASC LIMIT 50')
        .all() as Array<{
        id: number
        level: string
        context: string
        message: string
        details: string | null
        created_at: string
      }>

      if (!rows || rows.length === 0) {
        return { success: true, count: 0 }
      }

      const stationCode = this.getStationCode()
      const hostname = os.hostname()
      let sentCount = 0

      for (const row of rows) {
        // Ignore info/debug logs and network disconnects from cloud station_error telemetry
        if (row.level !== 'error') {
          db.prepare('UPDATE app_logs SET resolved = 1 WHERE id = ?').run(row.id)
          continue
        }

        let parsedDetails: any = null
        try {
          parsedDetails = row.details ? JSON.parse(row.details) : null
        } catch {
          parsedDetails = row.details
        }

        if (isNetworkOrOfflineError(row.message) || isNetworkOrOfflineError(parsedDetails)) {
          db.prepare('UPDATE app_logs SET resolved = 1 WHERE id = ?').run(row.id)
          continue
        }

        const payload: WorkstationTelemetryReport = {
          station: stationCode,
          hostname,
          platform: `${process.platform} ${os.release()}`,
          context: row.context || 'app',
          message: row.message,
          error_details: parsedDetails,
          timestamp: row.created_at || new Date().toISOString()
        }

        const { error } = await supabase.from('audit_logs').insert({
          action: 'station_error',
          table_name: 'telemetry',
          record_id: stationCode,
          new_value: JSON.stringify(payload)
        })

        if (!error) {
          db.prepare('UPDATE app_logs SET resolved = 1 WHERE id = ?').run(row.id)
          sentCount++
        } else {
          // If transmission fails due to network, stop loop without error spam
          if (isNetworkOrOfflineError(error.message)) {
            return { success: false, count: sentCount }
          }
          console.warn('Could not transmit queued telemetry to Supabase:', error.message)
          return { success: false, count: sentCount }
        }
      }

      return { success: true, count: sentCount }
    } catch (err) {
      if (!isNetworkOrOfflineError(err)) {
        console.warn('Telemetry flush exception:', err)
      }
      return { success: false, count: 0 }
    }
  }

  /**
   * Reports a sync blockage specifically (e.g., failed item blocking the queue)
   */
  static async reportSyncBlockage(
    tableName: string,
    recordId: string,
    errorMessage: string,
    pendingCount: number
  ): Promise<boolean> {
    if (isNetworkOrOfflineError(errorMessage)) {
      return false
    }
    return this.reportError(
      'sync_blockage',
      `Blocage d'envoi cloud sur ${tableName} (ID: ${recordId}) : ${errorMessage}`,
      { error: errorMessage },
      { tableName, recordId, pendingCount }
    )
  }

  /**
   * Fetches remote error telemetry for Superadmin dashboard
   */
  static async fetchWorkstationTelemetry(limit = 50): Promise<{
    success: boolean
    reports?: Array<{
      id: number
      station: string
      hostname: string
      context: string
      message: string
      table_name?: string
      record_id?: string
      pending_count?: number
      error_details?: string
      timestamp: string
    }>
    error?: string
  }> {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('table_name', 'telemetry')
        .order('timestamp', { ascending: false })
        .limit(limit)

      if (error) {
        return { success: false, error: error.message }
      }

      const reports = (data || []).map((row: any) => {
        let parsed: any = {}
        try {
          parsed = JSON.parse(row.new_value)
        } catch {
          parsed = { message: row.new_value }
        }

        return {
          id: row.id,
          station: parsed.station || row.record_id || 'Inconnu',
          hostname: parsed.hostname || '',
          context: parsed.context || row.action,
          message: parsed.message || 'Erreur non spécifiée',
          table_name: parsed.table_name,
          record_id: parsed.record_id,
          pending_count: parsed.pending_count,
          error_details: parsed.error_details,
          timestamp: parsed.timestamp || row.timestamp
        }
      })

      return { success: true, reports }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }

  /**
   * Purges all remote telemetry error logs from Supabase audit_logs
   */
  static async clearCloudTelemetry(): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('audit_logs')
        .delete()
        .eq('table_name', 'telemetry')

      if (error) {
        return { success: false, error: error.message }
      }
      return { success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }
}
