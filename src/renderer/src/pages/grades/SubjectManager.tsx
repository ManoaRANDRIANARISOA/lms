import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGradeStore } from '@/store/useGradeStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useClasses } from '@/lib/useClasses'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Plus, Trash2, Settings, BookOpen, Layers, CheckCircle2, Search } from 'lucide-react'
import type { Subject, ClassSubject } from '@shared/types'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'

export default function SubjectManager(): React.JSX.Element {
  const navigate = useNavigate()
  const canWrite = useAuthStore((s) => s.canWrite)
  const { sections: CLASS_SECTIONS } = useClasses()
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

  const [activeClass, setActiveClass] = useState<string>('') // '' means Global Catalog
  const [searchTerm, setSearchTerm] = useState('')
  const [newName, setNewName] = useState('')
  const [newCoef, setNewCoef] = useState('1')
  const [msg, setMsg] = useState('')
  const [savingCoefId, setSavingCoefId] = useState<string | null>(null)

  useEffect(() => {
    fetchSubjects()
    fetchAllClassSubjects()
  }, [])

  // Lookup class subjects for active class
  const activeAssignments = useMemo(() => {
    if (!activeClass) return new Map<string, ClassSubject>()
    const map = new Map<string, ClassSubject>()
    allClassSubjects
      .filter((cs) => cs.class_name === activeClass)
      .forEach((cs) => map.set(cs.subject_id, cs))
    return map
  }, [allClassSubjects, activeClass])

  // Count how many classes each subject is assigned to
  const subjectClassCounts = useMemo(() => {
    const counts = new Map<string, number>()
    allClassSubjects.forEach((cs) => {
      counts.set(cs.subject_id, (counts.get(cs.subject_id) || 0) + 1)
    })
    return counts
  }, [allClassSubjects])

  const filteredSubjects = useMemo(() => {
    return subjects.filter((s) => {
      if (searchTerm && !s.name.toLowerCase().includes(searchTerm.toLowerCase())) return false
      return true
    }).sort((a, b) => {
      if (activeClass) {
        const aAssigned = activeAssignments.has(a.id)
        const bAssigned = activeAssignments.has(b.id)
        if (aAssigned && !bAssigned) return -1
        if (!aAssigned && bAssigned) return 1
      }
      return a.name.localeCompare(b.name)
    })
  }, [subjects, searchTerm, activeClass, activeAssignments])

  const handleCreateSubject = async () => {
    if (!newName.trim()) {
      setMsg('Le nom de la matière est requis.')
      setTimeout(() => setMsg(''), 3000)
      return
    }
    const coef = parseFloat(newCoef) || 1
    const ok = await createSubject({ name: newName.trim(), default_coefficient: coef })
    if (ok) {
      setNewName('')
      setNewCoef('1')
      setMsg('Matière ajoutée au catalogue.')
      setTimeout(() => setMsg(''), 3000)
    } else {
      setMsg('Erreur lors de la création.')
      setTimeout(() => setMsg(''), 3000)
    }
  }

  const toggleAssignment = async (subject: Subject, isAssigned: boolean, classSubject?: ClassSubject) => {
    if (!activeClass || !canWrite('grades')) return

    if (isAssigned && classSubject) {
      await deleteClassSubject(classSubject.id)
    } else if (!isAssigned) {
      await createClassSubject({
        class_name: activeClass,
        subject_id: subject.id,
        coefficient: subject.default_coefficient ?? 1
      })
    }
  }

  const handleUpdateCoefficient = async (cs: ClassSubject, newCoef: number) => {
    if (newCoef === cs.coefficient) return
    setSavingCoefId(cs.id)
    await updateClassSubject(cs.id, { coefficient: newCoef })
    setTimeout(() => setSavingCoefId(null), 1500)
  }

  const handleDeleteSubject = async (id: string, name: string) => {
    if (!confirm(`Supprimer définitivement "${name}" du catalogue ?\nLes notes associées ne seront plus visibles.`)) return
    const ok = await deleteSubject(id)
    if (ok) {
      setMsg(`"${name}" supprimée du catalogue.`)
      setTimeout(() => setMsg(''), 3000)
    }
  }

  return (
    <div className="space-y-6 flex flex-col">
      <ReadOnlyBanner resource="grades" />

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/grades')} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Settings className="w-7 h-7 text-primary" />
            Gestion des matières
          </h1>
          <p className="text-sm text-gray-500 mt-1">Configurez le catalogue global et les programmes par classe.</p>
        </div>
      </div>

      {error && <p className="text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}
      {msg && (
        <div className={`p-3 rounded-lg border text-sm font-medium transition-all ${msg.includes('Erreur') ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
          {msg}
        </div>
      )}

      {/* Main Layout: Top Bar + Content */}
      <div className="flex flex-col gap-4">
        
        {/* Top Bar: Class Selection */}
        <div className="flex items-center gap-2 flex-wrap pb-2 shrink-0">
          <button
            onClick={() => setActiveClass('')}
            className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
              activeClass === '' 
                ? 'bg-primary text-primary-foreground shadow-md font-semibold' 
                : 'bg-white text-gray-700 hover:bg-gray-50 border shadow-sm'
            }`}
          >
            <Layers className="w-4 h-4" />
            Catalogue Global
          </button>
          
          <div className="w-px h-6 bg-gray-200 mx-2 shrink-0"></div>

          {Object.entries(CLASS_SECTIONS).map(([label, classList], index) => {
            if (classList.length === 0) return null
            return (
              <React.Fragment key={label}>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">{label}</span>
                {classList.map((c) => (
                  <button
                    key={c}
                    onClick={() => setActiveClass(c)}
                    className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      activeClass === c 
                        ? 'bg-primary/10 text-primary border border-primary/30' 
                        : 'bg-white text-gray-600 hover:bg-gray-50 border shadow-sm'
                    }`}
                  >
                    {c}
                  </button>
                ))}
                {index < Object.entries(CLASS_SECTIONS).length - 1 && (
                  <div className="w-px h-6 bg-gray-200 mx-2 shrink-0"></div>
                )}
              </React.Fragment>
            )
          })}
        </div>

        {/* Right Content */}
        <div className="bg-white rounded-2xl border shadow-sm flex flex-col">
          
          {/* Header */}
          <div className="bg-gray-50/80 border-b px-6 py-5 shrink-0 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                {activeClass ? (
                  <>
                    <Layers className="w-5 h-5 text-primary" />
                    Programme : {activeClass}
                  </>
                ) : (
                  <>
                    <BookOpen className="w-5 h-5 text-gray-500" />
                    Catalogue Global
                  </>
                )}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {activeClass 
                  ? 'Activez les matières enseignées dans cette classe et définissez leurs coefficients.' 
                  : 'Gérez toutes les matières disponibles dans l\'établissement.'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher une matière..."
                  className="pl-9 h-9 w-64 bg-white border-gray-200 focus:bg-white"
                />
              </div>
              {activeClass && (
                <div className="text-sm font-medium bg-white px-3 py-1.5 rounded-lg border shadow-sm text-gray-600 shrink-0">
                  <span className="text-primary font-bold">{activeAssignments.size}</span> matière(s) au programme
                </div>
              )}
            </div>
          </div>

          {/* Form to create global subject */}
          {!activeClass && canWrite('grades') && (
            <div className="px-6 py-4 border-b bg-white shrink-0">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Nouvelle matière</h3>
              <div className="flex flex-wrap md:flex-nowrap gap-4 items-end">
                <div className="flex-1">
                  <Label className="text-xs text-gray-500 mb-1.5 block">Nom de la matière</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="ex: Mathématiques"
                    className="h-10 bg-gray-50"
                  />
                </div>
                <div className="w-32">
                  <Label className="text-xs text-gray-500 mb-1.5 block">Coef. par défaut</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min={0.5}
                    value={newCoef}
                    onChange={(e) => setNewCoef(e.target.value)}
                    placeholder="1"
                    className="h-10 bg-gray-50"
                  />
                </div>
                <Button onClick={handleCreateSubject} disabled={loading || !newName.trim()} className="h-10">
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="w-full">
            {filteredSubjects.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
                <BookOpen className="w-12 h-12 mb-4 opacity-20" />
                <p>Aucune matière dans le catalogue.</p>
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-white sticky top-0 border-b z-10 shadow-sm">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-600">Nom de la matière</th>
                    
                    {activeClass ? (
                      <>
                        <th className="px-6 py-4 font-semibold text-gray-600 text-center w-40">Au programme</th>
                        <th className="px-6 py-4 font-semibold text-gray-600 w-48">Coefficient</th>
                      </>
                    ) : (
                      <>
                        <th className="px-6 py-4 font-semibold text-gray-600 text-center">Classes assignées</th>
                        <th className="px-6 py-4 font-semibold text-gray-600 w-48">Coef. par défaut</th>
                        {canWrite('grades') && <th className="px-6 py-4 font-semibold text-gray-600 text-right w-24">Actions</th>}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredSubjects.map((s) => {
                    const classSubject = activeClass ? activeAssignments.get(s.id) : undefined
                    const isAssigned = !!classSubject
                    const count = subjectClassCounts.get(s.id) || 0

                    return (
                      <tr 
                        key={s.id} 
                        className={`transition-colors hover:bg-gray-50/80 ${activeClass && isAssigned ? 'bg-primary/[0.02]' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeClass && isAssigned ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-500'}`}>
                              <BookOpen className="w-4 h-4" />
                            </div>
                            <span className={`font-medium ${activeClass && !isAssigned ? 'text-gray-400' : 'text-gray-900'}`}>
                              {s.name}
                            </span>
                          </div>
                        </td>

                        {activeClass ? (
                          <>
                            {/* Toggle Assignment */}
                            <td className="px-6 py-4 text-center align-middle">
                              <button
                                type="button"
                                disabled={!canWrite('grades')}
                                className={`${
                                  isAssigned ? 'bg-primary' : 'bg-gray-200 hover:bg-gray-300'
                                } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50`}
                                onClick={() => toggleAssignment(s, isAssigned, classSubject)}
                              >
                                <span
                                  aria-hidden="true"
                                  className={`${
                                    isAssigned ? 'translate-x-5' : 'translate-x-0'
                                  } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                                />
                              </button>
                            </td>

                            {/* Coefficient Input */}
                            <td className="px-6 py-4 align-middle">
                              {isAssigned ? (
                                <div className="flex items-center gap-3">
                                  <Input
                                    type="number"
                                    step="0.5"
                                    min={0.5}
                                    defaultValue={classSubject.coefficient}
                                    className="w-20 h-9 bg-white text-center font-medium shadow-sm"
                                    disabled={!canWrite('grades')}
                                    onBlur={(e) => {
                                      const val = parseFloat(e.target.value) || 1
                                      handleUpdateCoefficient(classSubject, val)
                                    }}
                                  />
                                  <div className="w-6 h-6 flex items-center justify-center">
                                    {savingCoefId === classSubject.id && (
                                      <CheckCircle2 className="w-5 h-5 text-green-500 animate-in fade-in zoom-in duration-300" />
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-300 text-sm italic">Non applicable</span>
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            {/* Global View Columns */}
                            <td className="px-6 py-4 text-center align-middle">
                              {count > 0 ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {count} classe(s)
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                                  Aucune
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 align-middle font-medium text-gray-700">
                              {s.default_coefficient ?? 1}
                            </td>
                            {canWrite('grades') && (
                              <td className="px-6 py-4 text-right align-middle">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0 rounded-full"
                                  onClick={() => handleDeleteSubject(s.id, s.name)}
                                  title="Supprimer du catalogue"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </td>
                            )}
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
