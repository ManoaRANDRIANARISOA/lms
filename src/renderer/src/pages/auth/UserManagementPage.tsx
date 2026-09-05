/**
 * UserManagementPage.tsx — Admin User Management
 *
 * Provides a full CRUD interface for managing user accounts.
 * Only accessible by users with 'full' access to the 'users' resource (admin only).
 *
 * Features:
 *   - List all active users
 *   - Create new users with role assignment
 *   - Edit user details (name, email, role, active status)
 *   - Deactivate users (soft delete)
 *   - Reset user passwords
 *
 * @module UserManagementPage
 */

import React, { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import { RefreshCw } from 'lucide-react'
import type { UserRow, UserRole } from '@shared/types'

// --------------------------------------------
// Role display helpers
// --------------------------------------------
const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  secretariat: 'Secrétariat',
  accounting: 'Comptabilité',
  direction: 'Direction'
}

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-800',
  secretariat: 'bg-blue-100 text-blue-800',
  accounting: 'bg-green-100 text-green-800',
  direction: 'bg-purple-100 text-purple-800'
}

// --------------------------------------------
// Main Component
// --------------------------------------------
export default function UserManagementPage(): React.JSX.Element {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)

  const canWrite = useAuthStore((s) => s.canWrite)

  // --------------------------------------------
  // Fetch Users
  // --------------------------------------------
  const fetchUsers = async () => {
    setLoading(true)
    try {
      const result = await window.api.auth.listUsers()
      if (result.success && result.users) {
        setUsers(result.users)
      } else {
        setError(result.error || 'Erreur lors du chargement')
      }
    } catch (e: any) {
      setError(e?.message || 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
    const handleSync = () => fetchUsers()
    window.addEventListener('app:sync-completed', handleSync)
    return () => window.removeEventListener('app:sync-completed', handleSync)
  }, [])

  // --------------------------------------------
  // Handlers
  // --------------------------------------------
  const handleCreate = () => {
    setSelectedUser(null)
    setShowCreateModal(true)
  }

  const handleEdit = (user: UserRow) => {
    setSelectedUser(user)
    setShowEditModal(true)
  }

  const handleResetPassword = (user: UserRow) => {
    setSelectedUser(user)
    setShowResetModal(true)
  }

  const handleDeactivate = async (user: UserRow) => {
    if (!confirm(`Désactiver l'utilisateur "${user.username}" ? Cette action est irréversible.`))
      return
    try {
      const result = await window.api.auth.deactivateUser(user.id)
      if (result.success) {
        await fetchUsers()
      } else {
        alert(result.error || 'Erreur lors de la désactivation')
      }
    } catch (e: any) {
      alert(e?.message || 'Erreur réseau')
    }
  }

  // --------------------------------------------
  // Render
  // --------------------------------------------
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Gestion des Utilisateurs</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
            title="Actualiser la liste des utilisateurs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Rafraîchir</span>
          </button>
          {canWrite('users') && (
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              + Nouvel utilisateur
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Chargement...</div>
      ) : users.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">Aucun utilisateur trouvé</div>
      ) : (
        <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium">Utilisateur</th>
                <th className="text-left px-4 py-3 text-sm font-medium">Nom complet</th>
                <th className="text-left px-4 py-3 text-sm font-medium">Rôle</th>
                <th className="text-left px-4 py-3 text-sm font-medium">Statut</th>
                <th className="text-left px-4 py-3 text-sm font-medium">Dernière connexion</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium">{user.username}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {user.full_name || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[user.role as UserRole] || 'bg-gray-100 text-gray-800'}`}
                    >
                      {ROLE_LABELS[user.role as UserRole] || user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${user.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {user.active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {user.last_login
                      ? new Date(user.last_login).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : 'Jamais'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite('users') && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(user)}
                          className="text-xs px-2 py-1 bg-muted hover:bg-muted/80 rounded transition-colors"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => handleResetPassword(user)}
                          className="text-xs px-2 py-1 bg-muted hover:bg-muted/80 rounded transition-colors"
                        >
                          Mot de passe
                        </button>
                        <button
                          onClick={() => handleDeactivate(user)}
                          className="text-xs px-2 py-1 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded transition-colors"
                        >
                          Désactiver
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <UserFormModal
          mode="create"
          onClose={() => setShowCreateModal(false)}
          onSaved={fetchUsers}
        />
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <UserFormModal
          mode="edit"
          user={selectedUser}
          onClose={() => setShowEditModal(false)}
          onSaved={fetchUsers}
        />
      )}

      {/* Reset Password Modal */}
      {showResetModal && selectedUser && (
        <ResetPasswordModal
          user={selectedUser}
          onClose={() => setShowResetModal(false)}
          onReset={fetchUsers}
        />
      )}
    </div>
  )
}

// --------------------------------------------
// User Form Modal (Create / Edit)
// --------------------------------------------
interface UserFormModalProps {
  mode: 'create' | 'edit'
  user?: UserRow | null
  onClose: () => void
  onSaved: () => void
}

function UserFormModal({ mode, user, onClose, onSaved }: UserFormModalProps) {
  const [username, setUsername] = useState(user?.username || '')
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [role, setRole] = useState<UserRole>((user?.role as UserRole) || 'secretariat')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      if (mode === 'create') {
        const result = await window.api.auth.createUser({
          username,
          password,
          role,
          full_name: fullName,
          email
        })
        if (result.success) {
          onSaved()
          onClose()
        } else {
          setError(result.error || 'Erreur lors de la création')
        }
      } else if (user) {
        const result = await window.api.auth.updateUser(user.id, {
          username,
          role,
          full_name: fullName,
          email
        })
        if (result.success) {
          onSaved()
          onClose()
        } else {
          setError(result.error || 'Erreur lors de la modification')
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold mb-4">
          {mode === 'create' ? 'Nouvel utilisateur' : "Modifier l'utilisateur"}
        </h2>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nom d'utilisateur *</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
              required
              minLength={3}
            />
          </div>

          {mode === 'create' && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Mot de passe * (min. 8 caractères)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background"
                required
                minLength={8}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Nom complet</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Rôle *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="admin">Administrateur</option>
              <option value="secretariat">Secrétariat</option>
              <option value="accounting">Comptabilité</option>
              <option value="direction">Direction</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-md hover:bg-muted transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : mode === 'create' ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --------------------------------------------
// Reset Password Modal
// --------------------------------------------
interface ResetPasswordModalProps {
  user: UserRow
  onClose: () => void
  onReset: () => void
}

function ResetPasswordModal({ user, onClose, onReset }: ResetPasswordModalProps) {
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const result = await window.api.auth.resetPassword(user.id, newPassword)
      if (result.success) {
        setSuccess(true)
        setTimeout(() => {
          onReset()
          onClose()
        }, 1500)
      } else {
        setError(result.error || 'Erreur lors de la réinitialisation')
      }
    } catch (e: any) {
      setError(e?.message || 'Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold mb-4">
          Réinitialiser le mot de passe — {user.username}
        </h2>

        {success ? (
          <div className="bg-green-50 text-green-800 rounded-md px-4 py-3 text-sm">
            Mot de passe réinitialisé avec succès.
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md px-4 py-3 text-sm mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Nouveau mot de passe * (min. 8 caractères)
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  required
                  minLength={8}
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border rounded-md hover:bg-muted transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Réinitialisation...' : 'Réinitialiser'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
