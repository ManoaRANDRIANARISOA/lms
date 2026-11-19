/**
 * PaymentTraceability.tsx — Traçabilité complète des paiements (Direction / Admin)
 *
 * Historique de TOUS les paiements (actifs + supprimés), poste d'origine via le reçu,
 * opérateur, statut de synchronisation + file d'attente, miroir caisse, et piste d'audit.
 * Objectif : distinguer une erreur de manipulation (suppression, antidate, mois décalé)
 * d'une erreur logiciel (sync bloquée, collision de reçu, paiement orphelin).
 *
 * @module pages/finance/PaymentTraceability
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/store/useAppStore'
import { toast } from 'sonner'
import {
  Search,
  ChevronDown,
  ChevronUp,
  Download,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  FileClock,
  Trash2
} from 'lucide-react'

interface TraceRow {
  id: string
  student_id: string
  first_name?: string
  last_name?: string
  registration_number?: string
  class_name?: string
  payment_date: string
  amount: number
  payment_type: string
  month?: string
  description?: string
  payment_method?: string
  school_year?: string
  receipt_number?: string
  origin_station?: string
  created_by?: string
  created_at?: string
  deleted?: number
  sync_status?: string
  print_count?: number
  queue_status?: string
  queue_error?: string
  queue_updated_at?: string
  audit_count?: number
  cash_mirror_count?: number
  cash_mirror_deleted_count?: number
}

interface AuditEntry {
  id: number
  action: string
  user_name?: string
  old_value?: string
  new_value?: string
  timestamp: string
}

const TYPE_LABELS: Record<string, string> = {
  tuition: 'Écolage',
  enrollment: 'Inscription',
  reenrollment: 'Réinscription',
  bus: 'Bus',
  canteen: 'Cantine',
  uniform: 'Uniforme',
  fram: 'FRAM',
  event: 'Événement',
  other: 'Autre'
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  repair: 'Réparation',
  merge_duplicate_student: 'Fusion doublon élève'
}

const PAGE_SIZE = 200

function formatAr(v: unknown): string {
  return `${Math.round(Number(v) || 0).toLocaleString('fr-FR').replace(/\s/g, ' ')} Ar`
}

function dayOf(v?: string): string {
  return String(v || '').slice(0, 10)
}

interface Flags {
  deleted: boolean
  syncBlocked: boolean
  noCashMirror: boolean
  backdated: boolean
  shiftedMonth: boolean
}

function computeFlags(r: TraceRow): Flags {
  const qBlocked = ['error', 'failed', 'quarantined'].includes(String(r.queue_status || ''))
  const backdated =
    !!r.payment_date && !!r.created_at && dayOf(r.payment_date) < dayOf(r.created_at)
  const shiftedMonth =
    !!r.month && !!r.payment_date && String(r.month).slice(0, 7) !== dayOf(r.payment_date).slice(0, 7)
  return {
    deleted: Number(r.deleted) === 1,
    syncBlocked: qBlocked,
    noCashMirror: Number(r.cash_mirror_count || 0) === 0,
    backdated,
    shiftedMonth
  }
}

export default function PaymentTraceability(): React.JSX.Element {
  const currentYear = useAppStore((s) => s.currentYear)

  const [rows, setRows] = useState<TraceRow[]>([])
  const [total, setTotal] = useState(0)
  const [signals, setSignals] = useState({ deleted: 0, blocked: 0, orphan: 0, backdated: 0, shifted: 0 })
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)

  const [search, setSearch] = useState('')
  const [station, setStation] = useState('all')
  const [type, setType] = useState('all')
  const [syncStatus, setSyncStatus] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [includeDeleted, setIncludeDeleted] = useState(true)
  const [schoolYear, setSchoolYear] = useState(currentYear)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  useEffect(() => {
    setSchoolYear(currentYear)
  }, [currentYear])

  const load = useCallback(
    async (pageIndex: number) => {
      if (!window.api?.payment?.getTraceability) return
      setLoading(true)
      try {
        const res = await window.api.payment.getTraceability({
          search: search.trim() || undefined,
          station: station !== 'all' ? station : undefined,
          type: type !== 'all' ? type : undefined,
          syncStatus: syncStatus !== 'all' ? syncStatus : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          includeDeleted,
          schoolYear: schoolYear || undefined,
          limit: PAGE_SIZE,
          offset: pageIndex * PAGE_SIZE
        })
        if (res.success) {
          setRows((res.rows || []) as unknown as TraceRow[])
          setTotal(res.total || 0)
          setSignals(res.signals || { deleted: 0, blocked: 0, orphan: 0, backdated: 0, shifted: 0 })
        } else {
          toast.error(res.error || 'Erreur de chargement de la traçabilité')
        }
      } catch (e) {
        toast.error('Erreur : ' + (e instanceof Error ? e.message : String(e)))
      } finally {
        setLoading(false)
      }
    },
    [search, station, type, syncStatus, startDate, endDate, includeDeleted, schoolYear]
  )

  useEffect(() => {
    setPage(0)
    load(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station, type, syncStatus, includeDeleted, schoolYear])

  const toggleAudit = async (id: string) => {
    if (expanded === id) {
      setExpanded(null)
      return
    }
    setExpanded(id)
    setAudit([])
    setAuditLoading(true)
    try {
      const res = await window.api.payment.getAuditTrail(id)
      if (res.success) setAudit((res.rows || []) as unknown as AuditEntry[])
    } catch {
      // ignore
    } finally {
      setAuditLoading(false)
    }
  }

  // Signaux globaux fournis par le backend sur tout le jeu filtré (pas seulement la page
  // affichée) : le filtre « Tous » reflète désormais les antidatés/mois décalés de toutes les pages.
  const summary = signals

  const exportCsv = () => {
    const headers = [
      'Date',
      'Eleve',
      'Matricule',
      'Classe',
      'Type',
      'Mois',
      'Montant',
      'Recu',
      'Poste origine',
      'Operateur',
      'Cree le',
      'Supprime',
      'Statut sync',
      'File',
      'Miroir caisse',
      'Audit'
    ]
    const lines = rows.map((r) =>
      [
        r.payment_date,
        `${r.last_name || ''} ${r.first_name || ''}`.trim(),
        r.registration_number || '',
        r.class_name || '',
        TYPE_LABELS[r.payment_type] || r.payment_type,
        r.month || '',
        r.amount,
        r.receipt_number || '',
        r.origin_station || '',
        r.created_by || '',
        r.created_at || '',
        Number(r.deleted) === 1 ? 'OUI' : 'non',
        r.sync_status || '',
        r.queue_status || '',
        r.cash_mirror_count || 0,
        r.audit_count || 0
      ]
        .map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    const csv = [headers.join(','), ...lines].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tracabilite-paiements-${schoolYear || 'all'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FileClock className="w-5 h-5 text-indigo-600" />
            Traçabilité des paiements
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Historique complet (actifs + supprimés), poste d'origine, opérateur, synchronisation et
            piste d'audit — pour distinguer erreur de manipulation et erreur logiciel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filtres */}
      <div className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <Label className="text-xs text-gray-600">Recherche (élève, matricule, reçu, opérateur)</Label>
            <div className="relative mt-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPage(0)
                    load(0)
                  }
                }}
                placeholder="Nom, matricule, REC-2026-Cx-xxxxx, opérateur…"
                className="pl-8 h-9 text-xs"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-600">Poste d'origine</Label>
            <select
              value={station}
              onChange={(e) => setStation(e.target.value)}
              className="mt-1 h-9 w-full text-xs rounded-md border border-gray-200 bg-white px-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tous les postes</option>
              <option value="C1">C1</option>
              <option value="C2">C2</option>
              <option value="C3">C3</option>
              <option value="C4">C4</option>
              <option value="C5">C5</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-gray-600">Type</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 h-9 w-full text-xs rounded-md border border-gray-200 bg-white px-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tous</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs text-gray-600">Statut sync</Label>
            <select
              value={syncStatus}
              onChange={(e) => setSyncStatus(e.target.value)}
              className="mt-1 h-9 w-full text-xs rounded-md border border-gray-200 bg-white px-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tous</option>
              <option value="synced">Synchronisé</option>
              <option value="pending">En attente</option>
              <option value="error">Erreur</option>
              <option value="quarantined">Quarantaine</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-gray-600">Du</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 h-9 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-600">Au</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 h-9 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-600">Année scolaire</Label>
            <Input
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              placeholder="2026-2027"
              className="mt-1 h-9 text-xs"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100">
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Inclure les paiements supprimés
          </label>
          <Button
            size="sm"
            onClick={() => {
              setPage(0)
              load(0)
            }}
            disabled={loading}
          >
            <Search className="w-3.5 h-3.5 mr-1.5" />
            Rechercher
          </Button>
        </div>
      </div>

      {/* Synthèse anomalies (globale, sur tout le jeu filtré) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mr-1">
          Signaux (tous les paiements filtrés) :
        </span>
        <Badge icon={<Trash2 className="w-3.5 h-3.5" />} label="Supprimés" value={summary.deleted} tone="red" title="Paiements marqués supprimés (deleted = 1), conservés pour la traçabilité." />
        <Badge icon={<ShieldAlert className="w-3.5 h-3.5" />} label="Sync bloquée" value={summary.blocked} tone="red" title="Dernière écriture de file en erreur / échec / quarantaine : non confirmée par le cloud." />
        <Badge icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Sans miroir caisse" value={summary.orphan} tone="amber" title="Aucune écriture cash_journal rattachée à ce paiement (miroir caisse absent)." />
        <Badge icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Antidatés" value={summary.backdated} tone="amber" title="Date de paiement antérieure à la date de saisie (payment_date < created_at) : saisie rétroactive." />
        <Badge icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Mois ≠ date" value={summary.shifted} tone="amber" title="Le mois facturé (champ « mois ») ne correspond pas au mois de la date de paiement." />
        <span className="ml-auto text-xs text-gray-500 self-center">
          {total} paiement(s) — page {page + 1}/{pageCount}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100/90 border-b border-gray-200 text-gray-700 font-semibold text-[11px]">
              <th className="py-2.5 px-3">Date</th>
              <th className="py-2.5 px-3">Élève</th>
              <th className="py-2.5 px-3">Type / Mois</th>
              <th className="py-2.5 px-3 text-right">Montant</th>
              <th className="py-2.5 px-3">Reçu / Poste</th>
              <th className="py-2.5 px-3">Opérateur</th>
              <th className="py-2.5 px-3 text-center">Sync / File</th>
              <th className="py-2.5 px-3">Signaux</th>
              <th className="py-2.5 px-3 text-center">Audit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-gray-400">
                  {loading ? 'Chargement…' : 'Aucun paiement pour ces filtres.'}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const f = computeFlags(r)
                const isOpen = expanded === r.id
                return (
                  <React.Fragment key={r.id}>
                    <tr className={`hover:bg-gray-50/70 ${f.deleted ? 'bg-red-50/40' : ''}`}>
                      <td className="py-2 px-3 whitespace-nowrap text-gray-700">{r.payment_date}</td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-gray-900">
                          {r.last_name} {r.first_name}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {r.registration_number || '—'} · {r.class_name || '—'}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-gray-700">
                        {TYPE_LABELS[r.payment_type] || r.payment_type}
                        {r.month && <span className="text-gray-400"> · {r.month}</span>}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {formatAr(r.amount)}
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-mono text-[11px] text-gray-800">{r.receipt_number || '—'}</div>
                        <div className="text-[10px] text-gray-400">
                          {r.origin_station ? `Poste ${r.origin_station}` : 'Poste inconnu (legacy)'}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-gray-700">{r.created_by || '—'}</td>
                      <td className="py-2 px-3 text-center">
                        <SyncBadge status={r.sync_status} queue={r.queue_status} />
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex flex-wrap gap-1">
                          {f.deleted && <Flag tone="red" text="Supprimé" />}
                          {f.syncBlocked && <Flag tone="red" text="Sync bloquée" />}
                          {f.noCashMirror && <Flag tone="amber" text="Sans caisse" />}
                          {f.backdated && <Flag tone="amber" text="Antidaté" />}
                          {f.shiftedMonth && <Flag tone="amber" text="Mois ≠ date" />}
                          {!f.deleted && !f.syncBlocked && !f.noCashMirror && !f.backdated && !f.shiftedMonth && (
                            <span className="text-[10px] text-emerald-600">OK</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => toggleAudit(r.id)}
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          {r.audit_count || 0}
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-indigo-50/40">
                        <td colSpan={9} className="px-4 py-3">
                          <AuditPanel row={r} audit={audit} loading={auditLoading} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || loading}
            onClick={() => {
              const p = page - 1
              setPage(p)
              load(p)
            }}
          >
            Précédent
          </Button>
          <span className="text-xs text-gray-600">
            Page {page + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount - 1 || loading}
            onClick={() => {
              const p = page + 1
              setPage(p)
              load(p)
            }}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  )
}

function Badge({
  icon,
  label,
  value,
  tone,
  title
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'red' | 'amber'
  title?: string
}): React.JSX.Element {
  const cls =
    value === 0
      ? 'bg-gray-50 text-gray-400 border-gray-200'
      : tone === 'red'
        ? 'bg-red-50 text-red-700 border-red-200'
        : 'bg-amber-50 text-amber-700 border-amber-200'
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${cls} ${title ? 'cursor-help' : ''}`}
    >
      {icon}
      {label} : <strong>{value}</strong>
    </span>
  )
}

function Flag({ tone, text }: { tone: 'red' | 'amber'; text: string }): React.JSX.Element {
  const cls = tone === 'red' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>{text}</span>
}

function SyncBadge({ status, queue }: { status?: string; queue?: string }): React.JSX.Element {
  const blocked = ['error', 'failed', 'quarantined'].includes(String(queue || ''))
  if (blocked) {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800" title={queue}>
        {queue === 'quarantined' ? 'Quarantaine' : queue === 'failed' ? 'Échec' : 'Erreur'}
      </span>
    )
  }
  if (status === 'synced') {
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">Synced</span>
  }
  if (status === 'pending') {
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700">En attente</span>
  }
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">{status || '—'}</span>
}

function AuditPanel({
  row,
  audit,
  loading
}: {
  row: TraceRow
  audit: AuditEntry[]
  loading: boolean
}): React.JSX.Element {
  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-gray-600">
        <div>
          <span className="text-gray-400">Créé le :</span> {row.created_at || '—'}
        </div>
        <div>
          <span className="text-gray-400">Année :</span> {row.school_year || '—'}
        </div>
        <div>
          <span className="text-gray-400">Méthode :</span> {row.payment_method || '—'}
        </div>
        <div>
          <span className="text-gray-400">Impressions :</span> {row.print_count || 0}
        </div>
        <div className="col-span-2 md:col-span-4">
          <span className="text-gray-400">Description :</span> {row.description || '—'}
        </div>
        <div className="col-span-2 md:col-span-4">
          <span className="text-gray-400">Miroir caisse :</span> {row.cash_mirror_count || 0} entrée(s)
          {Number(row.cash_mirror_deleted_count || 0) > 0 && (
            <span className="text-red-600 font-semibold">
              {' '}
              dont {row.cash_mirror_deleted_count} supprimée(s)
            </span>
          )}
          {row.queue_error && (
            <span className="text-red-600"> · Erreur file : {row.queue_error}</span>
          )}
        </div>
      </div>
      <div>
        <div className="font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
          <FileClock className="w-3.5 h-3.5 text-indigo-500" />
          Piste d'audit ({audit.length})
        </div>
        {loading ? (
          <div className="text-gray-400">Chargement de l'audit…</div>
        ) : audit.length === 0 ? (
          <div className="text-gray-400 italic">
            Aucune entrée d'audit locale pour ce paiement (créé sur un autre poste ou audit purgé).
          </div>
        ) : (
          <div className="space-y-1.5">
            {audit.map((a) => (
              <div key={a.id} className="border border-gray-200 rounded-md bg-white p-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800">
                    {ACTION_LABELS[a.action] || a.action}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {a.user_name || 'système'} · {a.timestamp}
                  </span>
                </div>
                {a.old_value && (
                  <pre className="mt-1 text-[10px] text-red-700 bg-red-50 rounded p-1 overflow-x-auto whitespace-pre-wrap break-all">
                    avant : {a.old_value}
                  </pre>
                )}
                {a.new_value && (
                  <pre className="mt-1 text-[10px] text-emerald-700 bg-emerald-50 rounded p-1 overflow-x-auto whitespace-pre-wrap break-all">
                    après : {a.new_value}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}