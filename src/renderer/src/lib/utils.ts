import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeStationCode(raw?: string | null): string {
  if (!raw) return 'C1'
  const trimmed = String(raw).trim().toUpperCase()
  const match = trimmed.match(/^C?(\d+)$/i)
  if (match) {
    return `C${match[1]}`
  }
  const numMatch = trimmed.match(/(\d+)/)
  if (numMatch) {
    return `C${numMatch[1]}`
  }
  const clean = trimmed.replace(/[^A-Z0-9]/g, '')
  return clean || 'C1'
}
