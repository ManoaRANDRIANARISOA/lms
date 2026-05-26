/**
 * usePermissions.ts — Permission Hook for React Components
 *
 * Provides a convenient way for React components to check
 * the current user's permissions and adapt the UI accordingly.
 *
 * Usage:
 *   const { canWrite, canRead, isReadOnly } = usePermissions()
 *   // Then conditionally disable buttons, hide forms, etc.
 *
 * @module usePermissions
 */

import { useAuthStore } from '@/store/useAuthStore'
import type { Resource } from '@shared/types'

interface PermissionHelpers {
  /** Check if current user can read a resource */
  canRead: (resource: Resource) => boolean
  /** Check if current user can write to a resource */
  canWrite: (resource: Resource) => boolean
  /** Quick check: is the current page read-only? */
  isReadOnly: (resource: Resource) => boolean
  /** Current user's role */
  role: string | null
}

export function usePermissions(): PermissionHelpers {
  const canReadFn = useAuthStore((s) => s.canRead)
  const canWriteFn = useAuthStore((s) => s.canWrite)
  const user = useAuthStore((s) => s.user)

  return {
    canRead: canReadFn,
    canWrite: canWriteFn,
    isReadOnly: (resource: Resource) => canReadFn(resource) && !canWriteFn(resource),
    role: user?.role || null
  }
}
