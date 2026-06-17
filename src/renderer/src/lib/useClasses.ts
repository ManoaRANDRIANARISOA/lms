/**
 * useClasses.ts — Shared hook for class list (single source of truth)
 *
 * Reads classes from settings table. All modules (Finance, Students, Grades)
 * must use this hook instead of hardcoding class lists.
 */

import { useState, useEffect, useCallback } from 'react'

const DEFAULT_CLASSES = [
  'PS',
  'MS',
  'GS',
  'CP1',
  'CP2',
  'CE1',
  'CE2',
  'CM1',
  'CM2',
  '6ème',
  '5ème',
  '4ème',
  '3ème',
  '2nde',
  '1ère',
  'TA',
  'TD'
]

export function useClasses() {
  const [classes, setClasses] = useState<string[]>(DEFAULT_CLASSES)
  const [loading, setLoading] = useState(true)

  const fetchClasses = useCallback(async () => {
    try {
      const stored = await window.api.settings.get('classes')
      if (stored && Array.isArray(stored) && stored.length > 0) {
        setClasses(stored as string[])
      } else {
        setClasses(DEFAULT_CLASSES)
      }
    } catch {
      setClasses(DEFAULT_CLASSES)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchClasses()
  }, [fetchClasses])

  const saveClasses = useCallback(async (newClasses: string[]) => {
    await window.api.settings.set('classes', newClasses)
    setClasses(newClasses)
  }, [])

  const addClass = useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed || classes.includes(trimmed)) return false
      const updated = [...classes, trimmed]
      await saveClasses(updated)
      return true
    },
    [classes, saveClasses]
  )

  const removeClass = useCallback(
    async (name: string) => {
      const updated = classes.filter((c) => c !== name)
      await saveClasses(updated)
    },
    [classes, saveClasses]
  )

  const reorderClasses = useCallback(
    async (fromIndex: number, toIndex: number) => {
      const updated = [...classes]
      const [moved] = updated.splice(fromIndex, 1)
      updated.splice(toIndex, 0, moved)
      await saveClasses(updated)
    },
    [classes, saveClasses]
  )

  const renameClass = useCallback(
    async (oldName: string, newName: string) => {
      const trimmed = newName.trim()
      if (!trimmed || trimmed === oldName || classes.includes(trimmed)) return false
      const updated = classes.map((c) => (c === oldName ? trimmed : c))
      await saveClasses(updated)
      return true
    },
    [classes, saveClasses]
  )

  return {
    classes,
    loading,
    fetchClasses,
    saveClasses,
    addClass,
    removeClass,
    reorderClasses,
    renameClass
  }
}
