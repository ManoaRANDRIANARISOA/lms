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
   * Reports a critical error or sync failure to Supabase audit_logs
   */
  static async reportError(
    context: string,
    message: string,
    details?: any,
    extra?: { tableName?: string; recordId?: string; pendingCount?: number }
  ): Promise<boolean> {
    const stationCode = this.getStationCode()
    const hostname = os.hostname()

    // 1. Log locally
    LoggerService.log('error', context, message, details)

    // 2. Transmit to Supabase audit_logs asynchronously
    try {
      const payload: WorkstationTelemetryReport = {
        station: stationCode,
        hostname,
        platform: `${process.platform} ${os.release()}`,
        context,
        message,
        table_name: extra?.tableName,
        record_id: extra?.recordId,
        pending_count: extra?.pendingCount,
        error_details: details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
        timestamp: new Date().toISOString()
      }

      const { error } = await supabase.from('audit_logs').insert({
        action: 'station_error',
        table_name: 'telemetry',
        record_id: stationCode,
        new_value: JSON.stringify(payload)
      })

      if (error) {
        console.warn('Could not transmit telemetry to Supabase:', error.message)
        return false
      }
      return true
    } catch (err) {
      console.warn('Telemetry transmission exception:', err)
      return false
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
}
