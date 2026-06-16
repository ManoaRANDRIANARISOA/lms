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
  LogOut,
  type LucideIcon
} from 'lucide-react'
import type { Resource } from '@shared/types'

// --------------------------------------------
// Types
// --------------------------------------------
interface NavLeafProps {
  to: string
  label: string
  resource?: Resource
  indent?: boolean
  icon?: LucideIcon
  exact?: boolean
}

interface SubItem {
  to: string
  label: string
  resource?: Resource
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
function NavLeaf({ to, label, resource, indent = false, icon: Icon, exact = false }: NavLeafProps) {
  const location = useLocation()
  const canRead = useAuthStore((s) => s.canRead)
  const isActive = exact 
    ? location.pathname === to 
    : location.pathname === to || (to !== '/' && location.pathname.startsWith(to + '/'))

  if (resource && !canRead(resource)) {
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

  // Filter items by RBAC — hide entire module if no items visible
  const visibleItems = items.filter((item) => !item.resource || canRead(item.resource))
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
            <NavLeaf key={item.to} to={item.to} label={item.label} resource={item.resource} indent exact={item.exact} />
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
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const location = useLocation()

  // Determine initial open module
  const getInitialModule = () => {
    if (location.pathname.startsWith('/finance')) return 'Finance'
    if (location.pathname.startsWith('/personnel')) return 'Personnel'
    if (location.pathname.startsWith('/grades')) return 'Notes & Bulletins'
    if (['/settings', '/users', '/audit'].some(p => location.pathname.startsWith(p))) return 'Administration'
    return null
  }

  const [openModule, setOpenModule] = useState<string | null>(getInitialModule())

  const handleToggle = (moduleName: string) => {
    setOpenModule(prev => prev === moduleName ? null : moduleName)
  }

  const roleLabels: Record<string, string> = {
    admin: 'Administrateur',
    secretariat: 'Secrétariat',
    accounting: 'Comptabilité',
    direction: 'Direction'
  }

  return (
    <aside className="w-64 bg-primary text-primary-foreground p-4 flex flex-col shadow-xl z-10">
      {/* Nom de l'école */}
      <div className="flex items-center gap-3 mb-6 pl-2">
        <img src={logo} alt="Logo Manjary Soa" className="w-10 h-10 object-contain bg-white rounded-md p-0.5" />
        <div className="text-xl font-bold tracking-wide leading-tight">Lycée<br/>Manjary Soa</div>
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
            { to: '/finance', label: 'Journal', resource: 'payments', exact: true },
            { to: '/finance/alertes', label: 'Alertes impayés', resource: 'payments' },
            { to: '/finance/config', label: 'Configuration', resource: 'settings' }
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
        <NavLeaf to="/attendance" label="Pointage Bus/Cantine" resource="attendance" icon={ClipboardCheck} />

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
            { to: '/audit', label: 'Journal d\'audit', resource: 'audit' }
          ]}
        />
      </nav>

      {/* Infos utilisateur + Déconnexion */}
      <div className="border-t border-primary-foreground/20 pt-4 mt-4">
        <div className="px-2 mb-3">
          <div className="text-sm font-medium truncate">
            {user?.full_name || user?.username || 'Utilisateur'}
          </div>
          <div className="text-xs text-primary-foreground/60">
            {user ? roleLabels[user.role] || user.role : ''}
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 py-2 px-4 rounded-md transition-colors text-sm hover:bg-primary-foreground/10 text-primary-foreground/90 hover:text-primary-foreground"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-left">Déconnexion</span>
        </button>
      </div>

      {/* Version */}
      <div className="text-xs text-primary-foreground/40 text-center mt-2">v1.0.0</div>
    </aside>
  )
}
