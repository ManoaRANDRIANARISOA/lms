/**
 * Sidebar.tsx — Main Navigation Sidebar
 *
 * Displays role-based navigation links.
 * Filters nav items based on RBAC read permissions.
 *
 * @module components/layout/Sidebar
 */

import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/useAuthStore'
import type { Resource } from '@shared/types'

// --------------------------------------------
// Navigation Item
// --------------------------------------------
interface NavItemProps {
  to: string
  resource?: Resource
  children: React.ReactNode
}

function NavItem({ to, resource, children }: NavItemProps) {
  const location = useLocation()
  const canRead = useAuthStore((s) => s.canRead)
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to))

  // Masquer les items inaccessibles
  if (resource && !canRead(resource)) {
    return null
  }

  return (
    <Link
      to={to}
      className={cn(
        'block py-2 px-4 rounded-md mb-1 transition-colors',
        isActive
          ? 'bg-secondary text-secondary-foreground shadow-sm font-medium'
          : 'hover:bg-secondary/50 hover:text-secondary-foreground text-primary-foreground/90'
      )}
    >
      {children}
    </Link>
  )
}

// --------------------------------------------
// Sidebar Component
// --------------------------------------------
export default function Sidebar(): React.JSX.Element {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const roleLabels: Record<string, string> = {
    admin: 'Administrateur',
    secretariat: 'Secrétariat',
    accounting: 'Comptabilité',
    direction: 'Direction'
  }

  return (
    <aside className="w-64 bg-primary text-primary-foreground p-4 flex flex-col shadow-xl z-10">
      {/* Nom de l'école */}
      <div className="text-xl font-bold mb-8 pl-2 tracking-wide">Lycée Manjary Soa</div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        <NavItem to="/">Tableau de bord</NavItem>
        <NavItem to="/students" resource="students">Élèves</NavItem>
        <NavItem to="/attendance" resource="attendance">Pointage</NavItem>
        <NavItem to="/events" resource="events">Événements</NavItem>
        <NavItem to="/finance" resource="payments">Finance</NavItem>
        <NavItem to="/personnel" resource="personnel">Personnel</NavItem>
        <NavItem to="/grades" resource="grades">Notes</NavItem>
        <NavItem to="/settings" resource="settings">Paramètres</NavItem>
        <NavItem to="/users" resource="users">Utilisateurs</NavItem>
        <NavItem to="/audit" resource="audit">Journal d'audit</NavItem>
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
          className="w-full py-2 px-4 text-left rounded-md text-sm hover:bg-primary-foreground/10 transition-colors text-primary-foreground/80 hover:text-primary-foreground"
        >
          Déconnexion
        </button>
      </div>

      {/* Version */}
      <div className="text-xs text-primary-foreground/40 text-center mt-2">v1.0.0</div>
    </aside>
  )
}
