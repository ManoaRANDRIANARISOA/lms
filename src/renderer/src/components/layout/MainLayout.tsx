/**
 * MainLayout.tsx — Authenticated Application Layout
 *
 * Wraps all authenticated routes with the sidebar and session ping.
 *
 * @module components/layout/MainLayout
 */

import React, { useEffect, useRef } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import Sidebar from '@/components/layout/Sidebar'
import ProtectedRoute from '@/components/shared/ProtectedRoute'

// Pages
import StudentList from '@/pages/students/StudentList'
import Settings from '@/pages/Settings'
import CertificatePage from '@/pages/students/CertificatePage'
import AttendancePage from '@/pages/AttendancePage'
import EventsPage from '@/pages/EventsPage'
import FinancePage from '@/pages/FinancePage'
import DashboardPage from '@/pages/DashboardPage'
import PersonnelList from '@/pages/personnel/PersonnelList'
import PersonnelForm from '@/pages/personnel/PersonnelForm'
import PersonnelDetail from '@/pages/personnel/PersonnelDetail'
import GradesPage from '@/pages/grades/GradesPage'
import GradeEntry from '@/pages/grades/GradeEntry'
import GradeBook from '@/pages/grades/GradeBook'
import SubjectManager from '@/pages/grades/SubjectManager'
import ReportCardView from '@/pages/grades/ReportCardView'
import UserManagementPage from '@/pages/auth/UserManagementPage'
import AuditLogPage from '@/pages/auth/AuditLogPage'

export default function MainLayout(): React.JSX.Element {
  const token = useAuthStore((s) => s.token)
  const activityPingInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  // Ping d'activité toutes les 5 min pour maintenir la session
  useEffect(() => {
    if (token) {
      activityPingInterval.current = setInterval(async () => {
        try {
          await window.api.auth.activity(token)
        } catch {
          // Ignorer les erreurs de ping
        }
      }, 5 * 60 * 1000)
    }

    return () => {
      if (activityPingInterval.current) {
        clearInterval(activityPingInterval.current)
      }
    }
  }, [token])

  return (
    <div className="flex h-screen bg-background text-foreground font-sans">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-background p-6">
        <div className="w-full h-full">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/students" element={<StudentList />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/certificate/:studentId" element={<CertificatePage />} />
            <Route path="/finance" element={<FinancePage />} />
            <Route path="/personnel" element={<PersonnelList />} />
            <Route path="/personnel/new" element={<PersonnelForm />} />
            <Route path="/personnel/:id" element={<PersonnelDetail />} />
            <Route path="/personnel/:id/edit" element={<PersonnelForm />} />
            <Route path="/grades" element={<GradesPage />} />
            <Route path="/grades/entry" element={<GradeEntry />} />
            <Route path="/grades/book" element={<GradeBook />} />
            <Route path="/grades/subjects" element={<SubjectManager />} />
            <Route path="/grades/report/:studentId" element={<ReportCardView />} />
            <Route
              path="/settings"
              element={
                <ProtectedRoute resource="settings">
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute resource="users">
                  <UserManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit"
              element={
                <ProtectedRoute resource="audit">
                  <AuditLogPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </main>
    </div>
  )
}
