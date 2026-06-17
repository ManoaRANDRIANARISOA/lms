/**
 * ReadOnlyBanner.tsx — Read-Only Mode Indicator
 *
 * Displays a banner at the top of a page when the current user
 * has read-only access to the page's resource. Informs the user
 * that they can view data but cannot make changes.
 *
 * Usage:
 *   <ReadOnlyBanner resource="payments" />
 *
 * @module ReadOnlyBanner
 */

import React from 'react'
import { usePermissions } from '@/lib/usePermissions'
import type { Resource } from '@shared/types'

interface ReadOnlyBannerProps {
  /** The resource to check write access for */
  resource: Resource
}

export default function ReadOnlyBanner({
  resource
}: ReadOnlyBannerProps): React.JSX.Element | null {
  const { isReadOnly } = usePermissions()

  if (!isReadOnly(resource)) {
    return null
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md px-4 py-2 text-sm mb-4 flex items-center gap-2">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4 flex-shrink-0"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
      <span>
        <strong>Mode lecture seule</strong> — Vous pouvez consulter les données mais pas les
        modifier.
      </span>
    </div>
  )
}
