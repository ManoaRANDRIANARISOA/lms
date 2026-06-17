/**
 * SubjectManager.tsx — Gestion des matières par classe
 *
 * Vue unifiée : catalogue + assignation par classe dans une seule grille.
 * Toutes les données sont centralisées et dynamiques.
 *
 * @module pages/grades/SubjectManager
 */

import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGradeStore } from '@/store/useGradeStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useClasses } from '@/lib/useClasses'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Plus, Trash2, Settings, Layers, Filter, BookOpen, X, Check } from 'lucide-react'
import type { Subject, ClassSubject } from '@shared/types'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'

function groupClasses(classes: string[]): { label: string; classes: string[] }[] {
  const groups: { label: string; classes: string[] }[] = []
  const prescolaire = classes.filter((c) => ['PS', 'MS', 'GS'].includes(c))
  const primaire = classes.filter((c) => /^CP|CE|CM/.test(c))
  const college = classes.filter((c) => /^[3456]ème$/.test(c))
  const lycee = classes.filter((c) =>
    ['2nde', '1ère', 'TA', 'TD', 'Seconde', 'Première', 'Terminale'].includes(c)
  )
  const other = classes.filter(
    (c) =>
      !prescolaire.includes(c) &&
      !primaire.includes(c) &&
      !college.includes(c) &&
      !lycee.includes(c)
  )
  if (prescolaire.length) groups.push({ label: 'Préscolaire', classes: prescolaire })
  if (primaire.length) groups.push({ label: 'Primaire', classes: primaire })
  if (college.length) groups.push({ label: 'Collège', classes: college })
  if (lycee.length) groups.push({ label: 'Lycée', classes: lycee })
  if (other.length) groups.push({ label: 'Autres', classes: other })
  return groups
}

export default function SubjectManager(): React.JSX.Element {
  const navigate = useNavigate()
  const canWrite = useAuthStore((s) => s.canWrite)
  const { classes: ALL_CLASSES } = useClasses()
  const {
    subjects,
    fetchSubjects,
    createSubject,
    deleteSubject,
    allClassSubjects,
    fetchAllClassSubjects,
    createClassSubject,
    updateClassSubject,
    deleteClassSubject,
    loading,
    error
  } = useGradeStore()

  const [activeClass, setActiveClass] = useState<string>('')
  const [newName, setNewName] = useState('')
  const [newCoef, setNewCoef] = useState('1')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetchSubjects()
    fetchAllClassSubjects()
  }, [])

  // Build a lookup: subjectId → ClassSubject for the active class
  const activeAssignments = useMemo(() => {
    if (!activeClass) return new Map<string, ClassSubject>()
    const map = new Map<string, ClassSubject>()
    allClassSubjects
      .filter((cs) => cs.class_name === activeClass)
      .forEach((cs) => map.set(cs.subject_id, cs))
    return map
  }, [allClassSubjects, activeClass])

  // Assigned classes per subject (across all classes)
  const assignedClassesMap = useMemo(() => {
    const map = new Map<string, string[]>()
    allClassSubjects.forEach((cs) => {
      const arr = map.get(cs.subject_id) || []
      arr.push(cs.class_name)
      map.set(cs.subject_id, arr)
    })
    return map
  }, [allClassSubjects])

  // Filtered subjects based on active class
  const filteredSubjects = useMemo(() => {
    if (!activeClass) return subjects
    return subjects.filter((s) => activeAssignments.has(s.id))
  }, [subjects, activeAssignments, activeClass])

  const handleCreateSubject = async () => {
    if (!newName.trim()) {
      setMsg('Le nom de la matière est requis.')
      return
    }
    const coef = parseFloat(newCoef) || 1
    const ok = await createSubject({ name: newName.trim(), default_coefficient: coef })
    if (ok) {
      setNewName('')
      setNewCoef('1')
      setMsg('Matière ajoutée au catalogue.')
    } else {
      setMsg('Erreur lors de la création.')
    }
  }

  const handleAssignToClass = async (subject: Subject) => {
    if (!activeClass) return
    const ok = await createClassSubject({
      class_name: activeClass,
      subject_id: subject.id,
      coefficient: subject.default_coefficient ?? 1
    })
    if (ok) {
      setMsg(`"${subject.name}" assigné(e) à ${activeClass}.`)
    } else {
      setMsg('Erreur : matière déjà assignée ou problème.')
    }
  }

  const handleUnassignFromClass = async (cs: ClassSubject) => {
    if (!confirm(`Retirer "${cs.subject_name}" de ${cs.class_name} ?`)) return
    const ok = await deleteClassSubject(cs.id)
    if (ok) {
      setMsg(`"${cs.subject_name}" retiré(e) de ${cs.class_name}.`)
    } else {
      setMsg('Erreur lors du retrait.')
    }
  }

  const handleUpdateCoefficient = async (cs: ClassSubject, newCoef: number) => {
    await updateClassSubject(cs.id, { coefficient: newCoef })
  }

  const handleDeleteSubject = async (id: string, name: string) => {
    if (
      !confirm(`Supprimer "${name}" du catalogue ?\nLes notes associées ne seront plus visibles.`)
    )
      return
    const ok = await deleteSubject(id)
    if (ok) setMsg(`"${name}" supprimée du catalogue.`)
    else setMsg('Erreur lors de la suppression.')
  }

  const getClassSubjectById = (subjectId: string): ClassSubject | undefined => {
    return activeAssignments.get(subjectId)
  }

  return (
    <div className="space-y-4">
      <ReadOnlyBanner resource="grades" />

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/grades')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Gestion des matières
        </h1>
      </div>

      {error && <p className="text-red-600 bg-red-50 p-3 rounded">{error}</p>}
      {msg && (
        <p
          className={`p-3 rounded ${msg.includes('Erreur') ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}
        >
          {msg}
        </p>
      )}

      {/* ── Catalogue & Assignation unifiés ── */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Layers className="w-5 h-5" />
          Catalogue des matières
        </h2>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filtrer par classe :</span>
          <Button
            size="sm"
            variant={activeClass === '' ? 'default' : 'outline'}
            onClick={() => setActiveClass('')}
          >
            Toutes
          </Button>
          {groupClasses(ALL_CLASSES).map((group) => (
            <div key={group.label} className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground font-medium mr-1">{group.label}:</span>
              {group.classes.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={activeClass === c ? 'default' : 'outline'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setActiveClass(activeClass === c ? '' : c)}
                >
                  {c}
                </Button>
              ))}
            </div>
          ))}
          {activeClass && (
            <span className="text-xs text-muted-foreground ml-2">
              — {filteredSubjects.length} matière{filteredSubjects.length > 1 ? 's' : ''} assignée
              {filteredSubjects.length > 1 ? 's' : ''} à {activeClass}
            </span>
          )}
        </div>

        {/* Create subject form */}
        {canWrite('grades') && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4 p-3 bg-gray-50 rounded-lg">
            <div>
              <Label>Nom de la matière</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="ex: Mathématiques"
              />
            </div>
            <div>
              <Label>Coefficient par défaut</Label>
              <Input
                type="number"
                step="0.5"
                min={0.5}
                value={newCoef}
                onChange={(e) => setNewCoef(e.target.value)}
                placeholder="1"
              />
            </div>
            <div>
              <Button onClick={handleCreateSubject} disabled={loading}>
                <Plus className="w-4 h-4 mr-2" />
                Ajouter au catalogue
              </Button>
            </div>
          </div>
        )}

        {/* Unified subject grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredSubjects.length === 0 && (
            <div className="col-span-full py-8 text-center text-muted-foreground">
              {activeClass ? (
                <>
                  Aucune matière assignée à {activeClass}.<br />
                  <span className="text-sm">
                    Cliquez sur "Toutes" puis "Ajouter à {activeClass}" sur une matière.
                  </span>
                </>
              ) : (
                'Aucune matière dans le catalogue.'
              )}
            </div>
          )}
          {filteredSubjects.map((s) => {
            const assigned = assignedClassesMap.get(s.id) || []
            const classSubject = getClassSubjectById(s.id)
            const isAssignedToActive = !!classSubject

            return (
              <div
                key={s.id}
                className={`relative bg-white border rounded-lg p-3 transition-shadow group ${
                  activeClass
                    ? isAssignedToActive
                      ? 'border-green-300 bg-green-50/30'
                      : 'border-orange-200 bg-orange-50/20 hover:shadow-md'
                    : 'hover:shadow-md'
                }`}
              >
                {/* Delete subject (global) */}
                {canWrite('grades') && (
                  <button
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                    onClick={() => handleDeleteSubject(s.id, s.name)}
                    title="Supprimer du catalogue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Subject name */}
                <div className="flex items-center gap-1.5 mb-2 pr-5">
                  <BookOpen className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="font-medium text-sm leading-tight">{s.name}</span>
                </div>

                {/* Default coefficient */}
                <div className="text-xs text-muted-foreground mb-2">
                  Coef. défaut :{' '}
                  <span className="font-semibold text-foreground">
                    {s.default_coefficient ?? 1}
                  </span>
                </div>

                {/* Active class controls */}
                {activeClass && canWrite('grades') && (
                  <div className="mb-2">
                    {isAssignedToActive ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                          <Check className="w-3 h-3" /> Assigné à {activeClass}
                        </span>
                        <Input
                          type="number"
                          step="0.5"
                          min={0.5}
                          defaultValue={classSubject!.coefficient}
                          className="w-16 h-7 text-xs"
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value) || 1
                            if (val !== classSubject!.coefficient) {
                              handleUpdateCoefficient(classSubject!, val)
                            }
                          }}
                          title="Coefficient pour cette classe"
                        />
                        <button
                          className="text-red-400 hover:text-red-600 ml-auto"
                          onClick={() => handleUnassignFromClass(classSubject!)}
                          title={`Retirer de ${activeClass}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs"
                        onClick={() => handleAssignToClass(s)}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Ajouter à {activeClass}
                      </Button>
                    )}
                  </div>
                )}

                {/* Assigned classes badges (always visible) */}
                {assigned.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {assigned.map((c) => (
                      <span
                        key={c}
                        className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                          c === activeClass
                            ? 'bg-primary text-primary-foreground font-semibold'
                            : canWrite('grades')
                              ? 'bg-primary/10 text-primary hover:bg-red-100 hover:text-red-700'
                              : 'bg-primary/10 text-primary'
                        }`}
                        onClick={() => {
                          if (canWrite('grades') && c !== activeClass) {
                            const cs = allClassSubjects.find(
                              (cs) => cs.subject_id === s.id && cs.class_name === c
                            )
                            if (cs) handleUnassignFromClass(cs)
                          }
                        }}
                        title={
                          canWrite('grades') && c !== activeClass
                            ? `Cliquer pour retirer de ${c}`
                            : undefined
                        }
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
