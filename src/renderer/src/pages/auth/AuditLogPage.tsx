/**
 * AuditLogPage.tsx — Audit Log Viewer
 *
 * Displays the audit trail for admin and direction users.
 * Supports filtering by action, user, and date range.
 *
 * Permission resource: 'audit'
 *   - admin:      full read access
 *   - direction:  read access
 *
 * @module AuditLogPage
 */

import React, { useState, useEffect } from 'react'
import type { AuditLog } from '@shared/types'

// --------------------------------------------
// Action display helpers
// --------------------------------------------
const ACTION_LABELS: Record<string, string> = {
  login: 'Connexion',
  logout: 'Déconnexion',
  login_failed: 'Échec connexion',
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  deactivate: 'Désactivation',
  change_password: 'Changement mot de passe',
  reset_password: 'Réinitialisation mot de passe',
  recordBus: 'Pointage bus',
  recordCanteen: 'Pointage cantine',
  addParticipants: 'Ajout participants',
  recordPayment: 'Enregistrement paiement',
  reEnroll: 'Réinscription',
  repair: 'Réparation'
}

const ACTION_COLORS: Record<string, string> = {
  login: 'bg-green-100 text-green-800',
  logout: 'bg-gray-100 text-gray-800',
  login_failed: 'bg-red-100 text-red-800',
  create: 'bg-blue-100 text-blue-800',
  update: 'bg-yellow-100 text-yellow-800',
  delete: 'bg-red-100 text-red-800',
  deactivate: 'bg-red-100 text-red-800',
  change_password: 'bg-purple-100 text-purple-800',
  reset_password: 'bg-orange-100 text-orange-800'
}

// --------------------------------------------
// Main Component
// --------------------------------------------
export default function AuditLogPage(): React.JSX.Element {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const pageSize = 50

  // Filters
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // --------------------------------------------
  // Fetch Logs
  // --------------------------------------------
  const fetchLogs = async () => {
    setLoading(true)
    try {
      const filters: Record<string, unknown> = {
        limit: pageSize,
        offset: page * pageSize
      }
      if (actionFilter) filters.action = actionFilter
      if (dateFrom) filters.startDate = dateFrom
      if (dateTo) filters.endDate = dateTo

      const result = await window.api.auth.getAuditLogs(filters)
      if (result.success) {
        setLogs(result.logs || [])
        setTotal(result.total || 0)
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error('Failed to fetch audit logs:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [page])

  const handleFilter = () => {
    setPage(0)
    fetchLogs()
  }

  // --------------------------------------------
  // Render
  // --------------------------------------------
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Journal d'Audit</h1>

      {/* Filters */}
      <div className="bg-card rounded-lg border shadow-sm p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Action</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 py-2 border rounded-md bg-background text-sm"
            >
              <option value="">Toutes</option>
              <option value="login">Connexion</option>
              <option value="logout">Déconnexion</option>
              <option value="login_failed">Échec connexion</option>
              <option value="create">Création</option>
              <option value="update">Modification</option>
              <option value="delete">Suppression</option>
              <option value="deactivate">Désactivation</option>
              <option value="change_password">Changement MDP</option>
              <option value="reset_password">Réinitialisation MDP</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Du</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 border rounded-md bg-background text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Au</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 border rounded-md bg-background text-sm"
            />
          </div>

          <button
            onClick={handleFilter}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm"
          >
            Filtrer
          </button>
        </div>
      </div>

      {/* Total count */}
      <div className="text-sm text-muted-foreground mb-3">
        {total} entrée(s) trouvée(s)
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Chargement...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">Aucune entrée trouvée</div>
      ) : (
        <>
          <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium">Date/Heure</th>
                  <th className="text-left px-4 py-3 text-sm font-medium">Action</th>
                  <th className="text-left px-4 py-3 text-sm font-medium">Table</th>
                  <th className="text-left px-4 py-3 text-sm font-medium">Enregistrement</th>
                  <th className="text-left px-4 py-3 text-sm font-medium">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-800'}`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{log.table_name || '—'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-xs">{log.record_id || '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
                      {log.new_value ? (
                        <span title={log.new_value}>{log.new_value.substring(0, 80)}{log.new_value.length > 80 ? '...' : ''}</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > pageSize && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1 border rounded-md text-sm hover:bg-muted transition-colors disabled:opacity-50"
              >
                Précédent
              </button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} / {Math.ceil(total / pageSize)}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={(page + 1) * pageSize >= total}
                className="px-3 py-1 border rounded-md text-sm hover:bg-muted transition-colors disabled:opacity-50"
              >
                Suivant
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
