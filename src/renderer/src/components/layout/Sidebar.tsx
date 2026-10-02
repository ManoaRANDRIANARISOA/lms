/**
 * Sidebar.tsx — Main Navigation Sidebar
 *
 * Displays role-based navigation links organized by modules.
 * Modules with sub-pages use collapsible sections.
 * Filters nav items based on RBAC read permissions.
 *
 * @module components/layout/Sidebar
 */

import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/useAuthStore'
import {
  Wallet,
  UserCog,
  BookOpen,
  Shield,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Users,
  ClipboardCheck,
  CalendarDays,
  FileText,
  Sparkles,
  type LucideIcon
} from 'lucide-react'
import type { Resource, UserRole } from '@shared/types'
import { toast } from 'sonner'
import { SyncStatusWidget } from '@/components/sync/SyncStatusWidget'
import { SyncProgressModal } from '@/components/sync/SyncProgressModal'
import { ReconciliationModal } from '@/components/sync/ReconciliationModal'
import { useSyncStore } from '@/store/useSyncStore'

// --------------------------------------------
// Types
// --------------------------------------------
interface NavLeafProps {
  to: string
  label: string
  resource?: Resource
  allowedRoles?: UserRole[]
  indent?: boolean
  icon?: LucideIcon
  exact?: boolean
}

interface SubItem {
  to: string
  label: string
  resource?: Resource
  allowedRoles?: UserRole[]
  exact?: boolean
}

interface NavModuleProps {
  label: string
  icon: LucideIcon
  items: SubItem[]
  isOpen: boolean
  onToggle: () => void
}

// --------------------------------------------
// Simple link (leaf node)
// --------------------------------------------
function NavLeaf({ to, label, resource, allowedRoles, indent = false, icon: Icon, exact = false }: NavLeafProps) {
  const location = useLocation()
  const canRead = useAuthStore((s) => s.canRead)
  const user = useAuthStore((s) => s.user)
  const isActive = exact
    ? location.pathname === to
    : location.pathname === to || (to !== '/' && location.pathname.startsWith(to + '/'))

  if (resource && !canRead(resource)) {
    return null
  }

  if (allowedRoles && (!user?.role || !allowedRoles.includes(user.role))) {
    return null
  }

  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 py-2 rounded-md transition-colors text-sm mb-1',
        indent ? 'px-4 pl-10' : 'px-4',
        isActive
          ? 'bg-secondary text-secondary-foreground shadow-sm font-medium'
          : 'hover:bg-secondary/30 text-primary-foreground/90'
      )}
    >
      {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
      <span className="flex-1">{label}</span>
    </Link>
  )
}

// --------------------------------------------
// Collapsible module section
function NavModule({ label, icon: Icon, items, isOpen, onToggle }: NavModuleProps) {
  const location = useLocation()
  const canRead = useAuthStore((s) => s.canRead)
  const user = useAuthStore((s) => s.user)

  // Filter items by RBAC & allowedRoles — hide entire module if no items visible
  const visibleItems = items.filter((item) => {
    if (item.resource && !canRead(item.resource)) return false
    if (item.allowedRoles && (!user?.role || !item.allowedRoles.includes(user.role))) return false
    return true
  })
  if (visibleItems.length === 0) return null

  // Highlight parent if any child route is active
  const hasActiveChild = visibleItems.some((item) =>
    item.exact
      ? location.pathname === item.to
      : location.pathname === item.to || location.pathname.startsWith(item.to + '/')
  )

  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-3 py-2 px-4 rounded-md mb-1 transition-colors text-left',
          hasActiveChild
            ? 'bg-secondary/40 text-secondary-foreground font-medium'
            : 'hover:bg-secondary/30 text-primary-foreground/90'
        )}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">{label}</span>
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 opacity-60" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 opacity-60" />
        )}
      </button>
      {isOpen && (
        <div className="ml-2 border-l border-primary-foreground/10 pl-1 mb-1">
          {visibleItems.map((item) => (
            <NavLeaf
              key={item.to}
              to={item.to}
              label={item.label}
              resource={item.resource}
              allowedRoles={item.allowedRoles}
              indent
              exact={item.exact}
            />
          ))}
        </div>
      )}
    </div>
  )
}

import logo from '@/assets/logo.png'

// --------------------------------------------
// Sidebar Component
// --------------------------------------------
export default function Sidebar(): React.JSX.Element {
  const location = useLocation()
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  const handleCheckUpdate = async () => {
    if (!window.api?.updater?.check) return
    setCheckingUpdate(true)
    const toastId = toast.loading('Recherche de mise à jour...')
    try {
      const res = await window.api.updater.check()
      if (res.isDev) {
        toast.info('Mode développement (pas de mise à jour distante).', { id: toastId })
      } else if (!res.success) {
        toast.error(`Vérification impossible : ${res.error || 'Connexion réseau requise'}`, { id: toastId })
      } else {
        setTimeout(() => {
          toast.dismiss(toastId)
        }, 1500)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur : ${msg}`, { id: toastId })
    } finally {
      setCheckingUpdate(false)
    }
  }

  // CRITICAL: We must subscribe to permissions to trigger a re-render
  // when fetchPermissions() completes after login/refresh.
  useAuthStore((s) => s.permissions)

  // Determine initial open module
  const getInitialModule = () => {
    if (location.pathname.startsWith('/finance')) return 'Finance'
    if (location.pathname.startsWith('/personnel')) return 'Personnel'
    if (location.pathname.startsWith('/grades')) return 'Notes & Bulletins'
    if (['/settings', '/users', '/audit'].some((p) => location.pathname.startsWith(p)))
      return 'Administration'
    return null
  }

  const [openModule, setOpenModule] = useState<string | null>(getInitialModule())

  const handleToggle = (moduleName: string) => {
    setOpenModule((prev) => (prev === moduleName ? null : moduleName))
  }

  const appVersion = useSyncStore((s) => s.appVersion)

  return (
    <aside className="w-64 bg-primary text-primary-foreground p-4 flex flex-col shadow-xl z-10">
      {/* Nom de l'école */}
      <div className="flex items-center gap-3 mb-6 pl-2">
        <img
          src={logo}
          alt="Logo Manjary Soa"
          className="w-10 h-10 object-contain bg-white rounded-md p-0.5"
        />
        <div className="text-xl font-bold tracking-wide leading-tight">
          Lycée
          <br />
          Manjary Soa
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto custom-scrollbar">
        {/* Dashboard — standalone */}
        <NavLeaf to="/" label="Tableau de bord" icon={LayoutDashboard} exact={true} />

        {/* Élèves — standalone */}
        <NavLeaf to="/students" label="Élèves" resource="students" icon={Users} />

        {/* Finance — module collapsible */}
        <NavModule
          label="Finance"
          icon={Wallet}
          isOpen={openModule === 'Finance'}
          onToggle={() => handleToggle('Finance')}
          items={[
            { to: '/finance', label: 'Journal', resource: 'cash_journal', exact: true },
            { to: '/finance/alertes', label: 'Alertes impayés', resource: 'payments' },
            { to: '/finance/config', label: 'Configuration', resource: 'payments', allowedRoles: ['admin', 'direction'] }
          ]}
        />

        {/* Personnel — module collapsible */}
        <NavModule
          label="Personnel"
          icon={UserCog}
          isOpen={openModule === 'Personnel'}
          onToggle={() => handleToggle('Personnel')}
          items={[
            { to: '/personnel', label: 'Liste du personnel', resource: 'personnel', exact: true },
            { to: '/personnel/payroll', label: 'Paie globale', resource: 'personnel', exact: true }
          ]}
        />

        {/* Notes — module collapsible */}
        <NavModule
          label="Notes & Bulletins"
          icon={BookOpen}
          isOpen={openModule === 'Notes & Bulletins'}
          onToggle={() => handleToggle('Notes & Bulletins')}
          items={[
            { to: '/grades/entry', label: 'Saisie des notes', resource: 'grades' },
            { to: '/grades/book', label: 'Carnet de notes', resource: 'grades' },
            { to: '/grades/subjects', label: 'Matières', resource: 'grades' }
          ]}
        />

        {/* Pointage Bus/Cantine — standalone */}
        <NavLeaf
          to="/attendance"
          label="Pointage Bus/Cantine"
          resource="attendance"
          icon={ClipboardCheck}
        />

        {/* Événements — standalone */}
        <NavLeaf to="/events" label="Événements" resource="events" icon={CalendarDays} />

        {/* Rapports — standalone */}
        <NavLeaf to="/reports" label="Rapports" resource="reports" icon={FileText} />

        {/* Administration — module collapsible (admin + direction) */}
        <NavModule
          label="Administration"
          icon={Shield}
          isOpen={openModule === 'Administration'}
          onToggle={() => handleToggle('Administration')}
          items={[
            { to: '/settings', label: 'Paramètres', resource: 'settings', exact: true },
            { to: '/users', label: 'Utilisateurs', resource: 'users' },
            { to: '/audit', label: "Journal d'audit", resource: 'audit' }
          ]}
        />
      </nav>

      {/* Widget unifié : Profil Utilisateur, Statut Cloud & Actions Rapides */}
      <SyncStatusWidget />

      {/* Version dynamique & Bouton simple de mise à jour */}
      <div className="flex items-center justify-center gap-2 mt-1.5 px-2">
        <span className="text-[11px] text-primary-foreground/50 font-mono">v{appVersion}</span>
        <button
          onClick={handleCheckUpdate}
          disabled={checkingUpdate}
          className="text-[10px] text-primary-foreground/80 hover:text-white bg-primary-foreground/10 hover:bg-primary-foreground/20 px-2 py-0.5 rounded-full transition-all flex items-center gap-1 active:scale-95 disabled:opacity-50"
          title="Rechercher et installer les nouvelles mises à jour"
        >
          <Sparkles className={`w-2.5 h-2.5 text-amber-300 ${checkingUpdate ? 'animate-spin' : ''}`} />
          <span>{checkingUpdate ? 'Vérification...' : 'Mettre à jour'}</span>
        </button>
      </div>

      {/* Modal de progression et détails de synchronisation */}
      <SyncProgressModal />

      {/* Assistant de réconciliation des écritures orphelines */}
      <ReconciliationModal />
    </aside>
  )
}
