/**
 * GradesPage.tsx — Hub du module Notes & Bulletins
 *
 * @module pages/grades/GradesPage
 */

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, PenLine, GraduationCap, Settings } from 'lucide-react'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'

const CARDS = [
  {
    title: 'Saisie des notes',
    description: 'Saisir ou modifier les notes par classe, matière et trimestre.',
    icon: PenLine,
    path: '/grades/entry',
    color: 'bg-blue-600'
  },
  {
    title: 'Carnet de notes',
    description: 'Visualiser le tableau croisé des notes par classe et trimestre.',
    icon: BookOpen,
    path: '/grades/book',
    color: 'bg-emerald-600'
  },
  {
    title: 'Gestion des matières',
    description: 'Ajouter, modifier ou supprimer les matières enseignées.',
    icon: Settings,
    path: '/grades/subjects',
    color: 'bg-indigo-600'
  }
]

export default function GradesPage(): React.JSX.Element {
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <ReadOnlyBanner resource="grades" />

      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <GraduationCap className="w-8 h-8 text-primary" />
          Notes & Bulletins
        </h1>
        <p className="text-muted-foreground mt-1">
          Gestion des notes, moyennes et bulletins scolaires.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CARDS.map((card) => (
          <button
            key={card.path}
            onClick={() => navigate(card.path)}
            className="bg-white rounded-xl border shadow-sm p-6 text-left hover:shadow-md hover:border-primary/30 transition-all group"
          >
            <div className={`${card.color} text-white p-3 rounded-lg w-fit mb-4 group-hover:scale-105 transition-transform`}>
              <card.icon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold mb-1">{card.title}</h3>
            <p className="text-sm text-muted-foreground">{card.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
