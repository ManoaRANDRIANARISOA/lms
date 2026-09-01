/**
 * App.tsx — Root Application Component (lightweight)
 *
 * Responsabilités :
 *   - Router HashRouter
 *   - ErrorBoundary global
 *   - AuthInitializer (vérifie session existante)
 *   - AppRoutes (login vs layout authentifié)
 *
 * Tout le layout authentifié est délégué à <MainLayout />.
 *
 * @module App
 */

import React, { useEffect, useState } from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { Toaster } from 'sonner'

import ErrorBoundary from '@/components/shared/ErrorBoundary'
import LoginPage from '@/pages/auth/LoginPage'
import MainLayout from '@/components/layout/MainLayout'

import { useFinanceStore } from '@/store/useFinanceStore'

// --------------------------------------------
// Auth Initialization Wrapper
// --------------------------------------------
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const checkExistingSession = useAuthStore((s) => s.checkExistingSession)
  const loading = useAuthStore((s) => s.loading)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    checkExistingSession().finally(() => {
      setInitialized(true)
      useFinanceStore.getState().fetchPrices()
    })
  }, [checkExistingSession])

  if (!initialized || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

  // --------------------------------------------
  // Route Switcher
  // --------------------------------------------
  function AppRoutes(): React.JSX.Element {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

    return (
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/*"
          element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" replace />}
        />
      </Routes>
    )
  }

  // --------------------------------------------
  // Root
  // --------------------------------------------
  export default function App(): React.JSX.Element {
    return (
      <Router>
        <ErrorBoundary>
          <AuthInitializer>
            <AppRoutes />
            <Toaster position="top-right" richColors closeButton />
          </AuthInitializer>
        </ErrorBoundary>
      </Router>
    )
  }
