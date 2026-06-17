/**
 * rbac.service.ts — Role-Based Access Control Service
 *
 * Implements the permission matrix defined in the Avenant N°1 RBAC.
 * Provides centralized permission checking for all IPC handlers
 * and frontend route protection.
 *
 * Roles (from Avenant):
 *   - admin:        Full access to everything
 *   - secretariat:  Student management, attendance, grades
 *   - accounting:   Payments, finance, personnel (read students)
 *   - direction:    Read access to most modules, full on some
 *
 * Access levels per resource:
 *   - 'full':  Read + Write (create, update, delete)
 *   - 'read':  Read-only (list, get — no modifications)
 *   - 'none':  No access at all
 *
 * @module RBACService
 */

// --------------------------------------------
// Types
// --------------------------------------------

/** The 4 roles defined in the Avenant RBAC specification */
export type Role = 'admin' | 'secretariat' | 'accounting' | 'direction'

/** Access levels for each resource/role combination */
export type AccessLevel = 'full' | 'read' | 'none'

/** User object stored in-memory for fast permission checks */
export interface User {
  id: string
  username: string
  role: Role
  full_name: string
  email: string
}

/** Resource keys matching the Avenant permission matrix */
export type Resource =
  | 'students'
  | 'payments'
  | 'attendance'
  | 'grades'
  | 'cash_journal'
  | 'personnel'
  | 'reports'
  | 'settings'
  | 'users'
  | 'audit'
  | 'events' // Events share the students resource scope

// --------------------------------------------
// Permission Matrix (from Avenant RBAC)
// --------------------------------------------

/**
 * Complete permission matrix from the Avenant.
 * Maps each role to its access level for each resource.
 *
 * | Module                | Resource     | Admin | Secretariat | Accounting | Direction |
 * |----------------------|--------------|-------|-------------|------------|-----------|
 * | Fiches Élèves        | students     | full  | full        | read       | full      |
 * | Paiements            | payments     | full  | read        | full       | full      |
 * | Bus & Cantine        | attendance   | full  | full        | read       | read      |
 * | Notes & Bulletins    | grades       | full  | full        | none       | read      |
 * | Journal de Caisse    | cash_journal | full  | none        | full       | read      |
 * | Salaires & Personnel | personnel    | full  | none        | full       | read      |
 * | Rapports Financiers  | reports      | full  | none        | full       | full      |
 * | Paramètres Système   | settings     | full  | none        | none       | read      |
 * | Gestion Utilisateurs | users        | full  | none        | none       | none      |
 * | Logs Audit           | audit        | full  | none        | none       | read      |
 * | Événements           | events       | full  | full        | read       | full      |
 */
const PERMISSION_MATRIX: Record<Role, Record<Resource, AccessLevel>> = {
  admin: {
    students: 'full',
    payments: 'full',
    attendance: 'full',
    grades: 'full',
    cash_journal: 'full',
    personnel: 'full',
    reports: 'full',
    settings: 'full',
    users: 'full',
    audit: 'full',
    events: 'full'
  },
  secretariat: {
    students: 'full',
    payments: 'read',
    attendance: 'full',
    grades: 'full',
    cash_journal: 'none',
    personnel: 'none',
    reports: 'none',
    settings: 'none',
    users: 'none',
    audit: 'none',
    events: 'full'
  },
  accounting: {
    students: 'read',
    payments: 'full',
    attendance: 'read',
    grades: 'none',
    cash_journal: 'full',
    personnel: 'full',
    reports: 'full',
    settings: 'none',
    users: 'none',
    audit: 'none',
    events: 'read'
  },
  direction: {
    students: 'full',
    payments: 'full',
    attendance: 'read',
    grades: 'read',
    cash_journal: 'read',
    personnel: 'read',
    reports: 'full',
    settings: 'read',
    users: 'none',
    audit: 'read',
    events: 'full'
  }
}

// --------------------------------------------
// In-Memory Current User
// --------------------------------------------

/** Currently authenticated user (in-memory for fast IPC permission checks) */
let currentUser: User | null = null

/**
 * Set the current authenticated user.
 * Called by auth.service on login/session restore.
 */
export function setCurrentUser(user: User | null): void {
  currentUser = user
}

/**
 * Get the current authenticated user.
 * Used by IPC handlers for permission checks.
 */
export function getCurrentUser(): User | null {
  return currentUser
}

// --------------------------------------------
// Permission Check Functions
// --------------------------------------------

/**
 * Get the access level for a role on a specific resource.
 *
 * @param role - The user's role
 * @param resource - The resource to check access for
 * @returns The access level ('full', 'read', or 'none')
 */
export function getAccessLevel(role: Role, resource: Resource): AccessLevel {
  const rolePerms = PERMISSION_MATRIX[role]
  if (!rolePerms) return 'none'
  return rolePerms[resource] || 'none'
}

/**
 * Check if the current user can read a resource.
 * A user can read if their access level is 'full' or 'read'.
 *
 * @param resource - The resource to check
 * @returns true if read access is allowed
 */
export function canRead(resource: Resource): boolean {
  const role = (currentUser?.role || 'guest') as Role
  const level = getAccessLevel(role, resource)
  return level === 'full' || level === 'read'
}

/**
 * Check if the current user can write to a resource.
 * A user can write only if their access level is 'full'.
 *
 * @param resource - The resource to check
 * @returns true if write access is allowed
 */
export function canWrite(resource: Resource): boolean {
  const role = (currentUser?.role || 'guest') as Role
  const level = getAccessLevel(role, resource)
  return level === 'full'
}

/**
 * Check if the current user has a specific permission on a resource.
 * Backward-compatible with existing hasPermission(action, resource) calls.
 *
 * Action mapping:
 *   - 'list', 'get', 'getByStudent', 'getAll', 'getTuitionStatus' → read access
 *   - 'create', 'update', 'delete', 'record', 'set', 'repair', 'reEnroll' → write access
 *   - 'manage' → write access (used for user management)
 *
 * @param action - The action being performed
 * @param resource - The resource being accessed
 * @returns true if the action is permitted
 */
export function hasPermission(action: string, resource: string): boolean {
  // Read-only actions
  const readActions = [
    'list',
    'get',
    'getByStudent',
    'getAll',
    'getTuitionStatus',
    'getBusSubscribers',
    'getCanteenSubscribers',
    'getBusAttendance',
    'getCanteenAttendance',
    'getById',
    'serviceStats'
  ]

  // Write actions
  const writeActions = [
    'create',
    'update',
    'delete',
    'record',
    'set',
    'repair',
    'reEnroll',
    'addParticipants',
    'recordPayment',
    'manage',
    'recordBus',
    'recordCanteen',
    'deactivate'
  ]

  // Normalize resource name (some handlers use slightly different keys)
  const normalizedResource = normalizeResource(resource)

  if (readActions.includes(action)) {
    return canRead(normalizedResource)
  }

  if (writeActions.includes(action)) {
    return canWrite(normalizedResource)
  }

  // Default: require write access for unknown actions
  return canWrite(normalizedResource)
}

/**
 * Ensure the current user has permission for an action.
 * Throws an error if not — convenient for IPC handler wrappers.
 *
 * @param action - The action being performed
 * @param resource - The resource being accessed
 * @throws Error if access is denied
 */
export function ensurePermission(action: string, resource: string): void {
  if (!hasPermission(action, resource)) {
    throw new Error(`Accès refusé: ${action} sur ${resource}`)
  }
}

/**
 * Get all permissions for the current user.
 * Useful for the frontend to determine which UI elements to show.
 */
export function getCurrentUserPermissions(): Record<Resource, AccessLevel> | null {
  if (!currentUser) return null
  return PERMISSION_MATRIX[currentUser.role] || null
}

/**
 * Get all resources accessible by the current user (at any level).
 * Used for sidebar menu filtering.
 */
export function getAccessibleResources(): Resource[] {
  if (!currentUser) return []
  const rolePerms = PERMISSION_MATRIX[currentUser.role]
  if (!rolePerms) return []
  return (Object.entries(rolePerms) as [Resource, AccessLevel][])
    .filter(([, level]) => level !== 'none')
    .map(([resource]) => resource)
}

// --------------------------------------------
// Helpers
// --------------------------------------------

/**
 * Normalize resource names used in IPC handlers to match
 * the canonical Resource type keys.
 */
function normalizeResource(resource: string): Resource {
  const map: Record<string, Resource> = {
    // Direct matches
    students: 'students',
    payments: 'payments',
    attendance: 'attendance',
    grades: 'grades',
    cash_journal: 'cash_journal',
    personnel: 'personnel',
    reports: 'reports',
    settings: 'settings',
    users: 'users',
    audit: 'audit',
    events: 'events',
    // Aliases used in various handlers
    finance: 'payments',
    student_payments: 'payments',
    student_fees: 'payments',
    bus: 'attendance',
    canteen: 'attendance',
    bus_attendance: 'attendance',
    canteen_attendance: 'attendance',
    salaries: 'personnel',
    payroll: 'personnel',
    salary: 'personnel',
    bulletin: 'grades',
    notes: 'grades',
    rapport: 'reports',
    configuration: 'settings',
    system: 'settings'
  }

  return map[resource] || (resource as Resource)
}
