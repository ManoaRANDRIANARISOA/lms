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
import { app } from 'electron'
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
  let msg = ''
  if (typeof error === 'string') {
    msg = error
  } else {
    try {
      const causeMsg = error?.cause ? (error.cause.message || String(error.cause)) : ''
      const detailsMsg = typeof error?.details === 'object' ? JSON.stringify(error.details) : (error?.details || '')
      msg = `${error?.message || ''} ${error?.code || ''} ${detailsMsg} ${causeMsg} ${JSON.stringify(error)}`
    } catch {
      msg = `${error?.message || ''} ${error?.code || ''} ${error?.details || ''}`
    }
  }

  msg = msg.toLowerCase()

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
    msg.includes('supabase non configuré') ||
    msg.includes('aborted') ||
    msg.includes('abort') ||
    msg.includes('the operation was aborted') ||
    msg.includes('undici') ||
    msg.includes('fetch error')
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
  static async fetchWorkstationTelemetry(limit = 250): Promise<{
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
    totalCount?: number
    error?: string
  }> {
    try {
      const { data, count, error } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
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

      return { success: true, reports, totalCount: count ?? reports.length }
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

  /**
   * Publishes a workstation status heartbeat to Supabase with local row counts and queue status
   */
  static async publishWorkstationHeartbeat(): Promise<boolean> {
    try {
      const stationCode = this.getStationCode()
      const hostname = os.hostname()
      const platform = `${process.platform} ${os.release()}`
      let appVersion = '2.2.5'
      try {
        appVersion = app.getVersion() || '2.2.5'
      } catch {}

      // Count local active records
      const counts: Record<string, number> = {
        students: (db.prepare('SELECT count(*) as c FROM students WHERE deleted = 0').get() as any)?.c || 0,
        student_payments: (db.prepare('SELECT count(*) as c FROM student_payments WHERE deleted = 0').get() as any)?.c || 0,
        cash_journal: (db.prepare('SELECT count(*) as c FROM cash_journal WHERE deleted = 0').get() as any)?.c || 0,
        users: (db.prepare('SELECT count(*) as c FROM users WHERE deleted = 0').get() as any)?.c || 0
      }

      // Count sync_queue states
      const queueCounts = db.prepare(`
        SELECT 
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'quarantined' THEN 1 ELSE 0 END) as quarantined
        FROM sync_queue
      `).get() as any

      const queue = {
        pending: queueCounts?.pending || 0,
        errors: queueCounts?.errors || 0,
        failed: queueCounts?.failed || 0,
        quarantined: queueCounts?.quarantined || 0
      }

      const payload = {
        station: stationCode,
        hostname,
        platform,
        app_version: appVersion,
        counts,
        queue,
        last_sync: new Date().toISOString()
      }

      const { error } = await supabase.from('audit_logs').insert({
        action: 'station_heartbeat',
        table_name: 'telemetry',
        record_id: stationCode,
        new_value: JSON.stringify(payload)
      })

      return !error
    } catch {
      return false
    }
  }

  /**
   * Fetches latest heartbeat for all workstations along with cloud row counts for cross-station convergence comparison
   */
  static async fetchWorkstationHeartbeats(): Promise<{
    success: boolean
    cloudCounts?: Record<string, number>
    stations?: Array<{
      station: string
      hostname: string
      platform: string
      app_version: string
      counts: Record<string, number>
      queue: { pending: number; errors: number; failed: number; quarantined: number }
      last_sync: string
    }>
    error?: string
  }> {
    try {
      // 1. Fetch Cloud active counts
      const [stRes, payRes, cjRes, usrRes] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('deleted', false),
        supabase.from('student_payments').select('*', { count: 'exact', head: true }).eq('deleted', false),
        supabase.from('cash_journal').select('*', { count: 'exact', head: true }).eq('deleted', false),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('deleted', false)
      ])

      const cloudCounts: Record<string, number> = {
        students: stRes.count ?? 0,
        student_payments: payRes.count ?? 0,
        cash_journal: cjRes.count ?? 0,
        users: usrRes.count ?? 0
      }

      // 2. Fetch recent station_heartbeat entries from audit_logs
      const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'station_heartbeat')
        .eq('table_name', 'telemetry')
        .order('id', { ascending: false })
        .limit(100)

      if (error) {
        return { success: false, cloudCounts, error: error.message }
      }

      const latestByStation = new Map<string, any>()
      for (const row of logs || []) {
        const stationKey = row.record_id || 'UNKNOWN'
        if (!latestByStation.has(stationKey)) {
          try {
            const parsed = JSON.parse(row.new_value)
            latestByStation.set(stationKey, {
              ...parsed,
              station: parsed.station || stationKey,
              last_seen: parsed.last_sync || row.created_at,
              server_recorded_at: row.created_at
            })
          } catch {
            // ignore malformed
          }
        }
      }

      // 3. Count recent station_error incidents per station
      const { data: errorRows } = await supabase
        .from('audit_logs')
        .select('record_id')
        .eq('action', 'station_error')
        .limit(300)

      const errorCountByStation: Record<string, number> = {}
      for (const eRow of errorRows || []) {
        const st = eRow.record_id || 'UNKNOWN'
        errorCountByStation[st] = (errorCountByStation[st] || 0) + 1
      }

      for (const [st, obj] of latestByStation.entries()) {
        obj.station_error_count = errorCountByStation[st] || 0
      }

      const stations = Array.from(latestByStation.values())

      return { success: true, cloudCounts, stations }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  }
}

