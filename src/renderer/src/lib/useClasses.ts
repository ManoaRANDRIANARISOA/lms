import { useState, useEffect, useCallback, useMemo } from 'react'

export type ClassSections = Record<string, string[]>

const DEFAULT_SECTIONS: ClassSections = {
  Préscolaire: ['PS', 'MS', 'GS'],
  Primaire: ['CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2'],
  Collège: ['6ème', '5ème', '4ème', '3ème'],
  Lycée: ['2nde', '1ère', 'TA', 'TD'],
  Autres: []
}

export function useClasses() {
  const [sections, setSections] = useState<ClassSections>(DEFAULT_SECTIONS)
  const [loading, setLoading] = useState(true)

  // Derive flat classes array
  const classes = useMemo(() => {
    const flat: string[] = []
    Object.values(sections).forEach((arr) => flat.push(...arr))
    return flat
  }, [sections])

  const fetchClasses = useCallback(async () => {
    try {
      const stored = (await window.api.settings.get('class_sections')) as ClassSections | null
      if (stored && typeof stored === 'object' && Object.keys(stored).length > 0) {
        // Ensure all default keys exist
        const merged = { ...DEFAULT_SECTIONS, ...stored }
        setSections(merged)
      } else {
        // Fallback to legacy 'classes' if sections don't exist yet
        const legacy = (await window.api.settings.get('classes')) as string[] | null
        if (legacy && Array.isArray(legacy) && legacy.length > 0) {
          // Auto-migrate legacy to 'Autres' to not lose them, or group them
          const migrated: ClassSections = {
            ...DEFAULT_SECTIONS,
            Autres: legacy.filter((c) => {
              return !Object.values(DEFAULT_SECTIONS).flat().includes(c)
            })
          }
          setSections(migrated)
          await window.api.settings.set('class_sections', migrated)
        } else {
          setSections(DEFAULT_SECTIONS)
        }
      }
    } catch {
      setSections(DEFAULT_SECTIONS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchClasses()
  }, [fetchClasses])

  const saveSections = useCallback(async (newSections: ClassSections) => {
    await window.api.settings.set('class_sections', newSections)

    // Also save legacy flat list for any backend systems directly reading 'classes'
    const flat: string[] = []
    Object.values(newSections).forEach((arr) => flat.push(...arr))
    await window.api.settings.set('classes', flat)

    setSections(newSections)
  }, [])

  const addClass = useCallback(
    async (name: string, sectionKey: string = 'Autres') => {
      const trimmed = name.trim()
      if (!trimmed || classes.includes(trimmed)) return false

      const newSections = { ...sections }
      if (!newSections[sectionKey]) newSections[sectionKey] = []
      newSections[sectionKey] = [...newSections[sectionKey], trimmed]

      await saveSections(newSections)
      return true
    },
    [classes, sections, saveSections]
  )

  const removeClass = useCallback(
    async (name: string) => {
      const newSections = { ...sections }
      Object.keys(newSections).forEach((key) => {
        newSections[key] = newSections[key].filter((c) => c !== name)
      })
      await saveSections(newSections)
    },
    [sections, saveSections]
  )

  const renameClass = useCallback(
    async (oldName: string, newName: string) => {
      const trimmed = newName.trim()
      if (!trimmed || trimmed === oldName || classes.includes(trimmed)) return false

      const newSections = { ...sections }
      Object.keys(newSections).forEach((key) => {
        newSections[key] = newSections[key].map((c) => (c === oldName ? trimmed : c))
      })
      await saveSections(newSections)
      return true
    },
    [classes, sections, saveSections]
  )

  // New method for Drag and Drop reorganization
  const moveClass = useCallback(
    async (className: string, targetSection: string, targetIndex?: number) => {
      const newSections = { ...sections }
      // Remove from all sections
      Object.keys(newSections).forEach((key) => {
        newSections[key] = newSections[key].filter((c) => c !== className)
      })

      // Add to target
      if (!newSections[targetSection]) newSections[targetSection] = []

      if (targetIndex !== undefined && targetIndex >= 0) {
        newSections[targetSection].splice(targetIndex, 0, className)
      } else {
        newSections[targetSection].push(className)
      }

      await saveSections(newSections)
    },
    [sections, saveSections]
  )

  return {
    classes,
    sections,
    loading,
    fetchClasses,
    saveSections,
    addClass,
    removeClass,
    renameClass,
    moveClass
  }
}
