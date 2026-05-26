/**
 * ProtectedRoute.tsx — Route Guard Component
 *
 * Wraps routes that require authentication.
 * If the user is not authenticated, redirects to the login page.
 * Optionally checks for specific resource access.
 *
 * @module ProtectedRoute
 */

import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import type { Resource } from '@shared/types'

interface ProtectedRouteProps {
  children: React.ReactNode
  /** Optional: resource to check read access for */
  resource?: Resource
  /** If true, requires write access instead of read */
  requireWrite?: boolean
}

export default function ProtectedRoute({
  children,
  resource,
  requireWrite = false
}: ProtectedRouteProps): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const canRead = useAuthStore((s) => s.canRead)
  const canWrite = useAuthStore((s) => s.canWrite)
  const location = useLocation()

  // Not authenticated → redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // If a resource is specified, check access
  if (resource) {
    const hasAccess = requireWrite ? canWrite(resource) : canRead(resource)
    if (!hasAccess) {
      // User doesn't have access to this resource
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-destructive mb-2">Accès refusé</h2>
            <p className="text-muted-foreground">
              Vous n'avez pas les permissions nécessaires pour accéder à cette page.
            </p>
          </div>
        </div>
      )
    }
  }

  return <>{children}</>
}
