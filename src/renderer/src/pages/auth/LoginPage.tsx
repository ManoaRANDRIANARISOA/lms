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
import { RefreshCw, Cloud, CloudOff } from 'lucide-react'
import { toast } from 'sonner'

export default function LoginPage(): React.JSX.Element {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isCheckingCloud, setIsCheckingCloud] = useState(false)
  const [isCloudOnline, setIsCloudOnline] = useState<boolean | null>(null)
  const [syncingAccounts, setSyncingAccounts] = useState(false)

  const login = useAuthStore((s) => s.login)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)
  const appVersion = useSyncStore((s) => s.appVersion)

  const checkConnectivity = async () => {
    if (window.api?.sync?.getStatus) {
      setIsCheckingCloud(true)
      try {
        const res = await window.api.sync.getStatus()
        setIsCloudOnline(Boolean(res.isOnline))
      } catch {
        setIsCloudOnline(false)
      } finally {
        setIsCheckingCloud(false)
      }
    }
  }

  const handleSyncAccounts = async () => {
    if (!window.api?.sync?.start) return
    setSyncingAccounts(true)
    try {
      const res = await window.api.sync.start(false)
      if (res.success) {
        toast.success('Comptes et données synchronisés avec succès depuis le Cloud !')
        setIsCloudOnline(true)
      } else {
        toast.error(`Échec synchronisation : ${res.error || 'Vérifiez la connexion Internet'}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur : ${msg}`)
    } finally {
      setSyncingAccounts(false)
    }
  }

  useEffect(() => {
    if (window.api?.app?.getVersion) {
      window.api.app.getVersion().then((v) => {
        if (v) useSyncStore.setState({ appVersion: v })
      })
    }
    checkConnectivity()
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
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Connexion</h2>
            <div className="flex items-center gap-1.5">
              {isCheckingCloud ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                  <RefreshCw className="w-3 h-3 animate-spin text-slate-500" />
                  Vérification...
                </span>
              ) : isCloudOnline === true ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <Cloud className="w-3 h-3 text-emerald-600" />
                  Connecté Cloud
                </span>
              ) : isCloudOnline === false ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                  <CloudOff className="w-3 h-3 text-amber-600" />
                  Mode Hors-Ligne
                </span>
              ) : null}

              <button
                type="button"
                onClick={handleSyncAccounts}
                disabled={syncingAccounts || isCheckingCloud}
                className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                title="Synchroniser les comptes depuis le Cloud"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingAccounts ? 'animate-spin text-primary' : ''}`} />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error Message */}
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md px-4 py-3 text-sm space-y-1">
                <div className="font-semibold">{error}</div>
                {error.toLowerCase().includes('identifiant') && (
                  <p className="text-xs opacity-90">
                    Si ce compte a été créé récemment sur un autre poste (ex: PC1), assurez-vous d'avoir une connexion Internet active ou cliquez sur l'icône de synchronisation en haut à droite.
                  </p>
                )}
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
