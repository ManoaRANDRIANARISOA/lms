/**
 * LoginPage.tsx — Authentication Login Page
 *
 * Provides a login form for users to authenticate with their
 * username and password. Displays error messages for failed attempts.
 * On successful login, redirects to the main dashboard.
 *
 * @module LoginPage
 */

import React, { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncStore } from '@/store/useSyncStore'
import logo from '@/assets/logo.png'

export default function LoginPage(): React.JSX.Element {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const login = useAuthStore((s) => s.login)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)
  const appVersion = useSyncStore((s) => s.appVersion)

  useEffect(() => {
    if (window.api?.app?.getVersion) {
      window.api.app.getVersion().then((v) => {
        if (v) useSyncStore.setState({ appVersion: v })
      })
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    await login(username, password)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 to-primary/20">
      <div className="w-full max-w-md mx-4">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <img
            src={logo}
            alt="Logo Lycée Manjary Soa"
            className="w-24 h-24 mx-auto object-contain bg-white rounded-2xl p-2 shadow-sm mb-4 border"
          />
          <h1 className="text-2xl font-bold text-foreground">Lycée Manjary Soa</h1>
          <p className="text-muted-foreground mt-1">Système de gestion scolaire</p>
        </div>

        {/* Login Card */}
        <div className="bg-card rounded-lg shadow-lg border p-8">
          <h2 className="text-xl font-semibold text-center mb-6">Connexion</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error Message */}
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md px-4 py-3 text-sm">
                {error}
              </div>
            )}

            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-foreground mb-1">
                Nom d'utilisateur
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (error) clearError()
                }}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                placeholder="Entrez votre nom d'utilisateur"
                autoComplete="username"
                autoFocus
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (error) clearError()
                  }}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary pr-10"
                  placeholder="Entrez votre mot de passe"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm px-1"
                  tabIndex={-1}
                >
                  {showPassword ? 'Cacher' : 'Voir'}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                  Connexion...
                </span>
              ) : (
                'Se connecter'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Lycée Manjary Soa — Gestion Scolaire v{appVersion}
        </p>
      </div>
    </div>
  )
}
