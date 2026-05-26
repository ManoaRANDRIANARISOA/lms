# RBAC Implementation Plan — LMS Auth Module

**Project:** Lycée Manjary Soa LMS  
**Date:** April 2026  
**Reference:** Avenant N°1 (Offre Sécurité Fondamentale)  
**Status:** IN PROGRESS  

---

## Architecture Overview

```
src/
├── main/
│   ├── auth/
│   │   ├── auth.service.ts        ← REWRITE: Local bcrypt auth (100% offline)
│   │   ├── rbac.service.ts        ← REWRITE: Correct roles + permission matrix
│   │   ├── session.service.ts     ← NEW: Session management + 60min timeout
│   │   └── audit.service.ts       ← NEW: Audit logging (Sérénité offer)
│   ├── database/
│   │   ├── migrations/
│   │   │   └── 004_add_rbac.sql   ← NEW: sessions table + admin seed
│   │   ├── repositories/
│   │   │   └── user.repository.ts ← NEW: User CRUD operations
│   │   └── db.ts                  ← UPDATE: Add migration 004
│   ├── ipc/
│   │   ├── auth.handler.ts        ← NEW: Dedicated auth/user IPC handlers
│   │   ├── student.handler.ts     ← UPDATE: Fix RBAC checks (already has some)
│   │   ├── payment.handler.ts     ← UPDATE: Add RBAC checks
│   │   ├── attendance.handler.ts  ← UPDATE: Add RBAC checks
│   │   ├── event.handler.ts       ← UPDATE: Add RBAC checks
│   │   ├── settings.handler.ts    ← UPDATE: Add RBAC checks
│   │   └── dialog.handler.ts      ← UPDATE: Add RBAC checks
│   ├── services/
│   │   └── sync.service.ts        ← UPDATE: Add 'users' to sync tables
│   └── index.ts                   ← UPDATE: Register auth handler, remove inline auth IPC
├── preload/
│   ├── index.ts                   ← UPDATE: Add auth CRUD channels
│   └── index.d.ts                 ← UPDATE: Add type definitions
├── shared/
│   └── types.ts                   ← UPDATE: Add User/Auth types
└── renderer/src/
    ├── App.tsx                    ← REWRITE: Auth guard, login flow, protected routes
    ├── store/
    │   └── useAuthStore.ts        ← NEW: Auth state management
    ├── pages/
    │   ├── LoginPage.tsx          ← NEW: Login screen
    │   ├── UserManagementPage.tsx ← NEW: Admin user management
    │   └── ...                    ← UPDATE: Read-only mode for "lecture" access
    └── components/
        └── layout/
            └── ProtectedRoute.tsx ← NEW: Route guard component
```

---

## Role & Permission Matrix (from Avenant)

| Module | Resource Key | Admin | Secretariat | Accounting | Direction |
|--------|-------------|-------|-------------|------------|-----------|
| Fiches Élèves | `students` | full | full | read | full |
| Paiements & Inscriptions | `payments` | full | read | full | full |
| Bus & Cantine | `attendance` | full | full | read | read |
| Notes & Bulletins | `grades` | full | full | none | read |
| Journal de Caisse | `cash_journal` | full | none | full | read |
| Salaires & Personnel | `personnel` | full | none | full | read |
| Rapports Financiers | `reports` | full | none | full | full |
| Paramètres Système | `settings` | full | none | none | read |
| Gestion Utilisateurs | `users` | full | none | none | none |
| Logs Audit | `audit` | full | none | none | read |

Access levels: `full` = read+write, `read` = read-only, `none` = no access

---

## PHASE 1: Backend Foundation (Database + Auth + RBAC)

### Task 1.1 — Create migration 004_add_rbac.sql
- [ ] Create `src/main/database/migrations/004_add_rbac.sql`
- [ ] Add `sessions` table (id, user_id, token, created_at, expires_at)
- [ ] Add `user_sync_metadata` columns if needed
- [ ] Seed default admin user (bcrypt hash of "admin123" or "Manjary2026")
- [ ] Add index on sessions(token) for fast lookup
- [ ] Add index on sessions(user_id)

### Task 1.2 — Update db.ts to run migration 004
- [ ] Add migration 004 runner in `src/main/database/db.ts`
- [ ] Follow existing pattern (mig004Name, mig004Applied check, file read, exec)

### Task 1.3 — Install bcryptjs dependency
- [ ] Run `npm install bcryptjs` and `npm install -D @types/bcryptjs`
- [ ] bcryptjs is pure JS (no native compilation issues in Electron), unlike bcrypt

### Task 1.4 — Create UserRepository
- [ ] Create `src/main/database/repositories/user.repository.ts`
- [ ] Methods: create, getById, getByUsername, list, update, deactivate, updateLastLogin
- [ ] Password hashing with bcryptjs (hash on create, compare on login)
- [ ] Always hash passwords before storing (cost factor 10)

### Task 1.5 — Rewrite auth.service.ts for local auth
- [ ] Remove Supabase auth dependency entirely
- [ ] Implement `loginWithPassword(username, password)` → check local SQLite users table
- [ ] Implement `logout()` → clear session
- [ ] Implement `getCurrentUser()` → read from session store
- [ ] Implement `changePassword(userId, oldPassword, newPassword)`
- [ ] Implement `resetPassword(userId, newPassword)` (admin only)
- [ ] All methods 100% offline, no network required

### Task 1.6 — Rewrite rbac.service.ts with correct roles
- [ ] Change Role type: `'admin' | 'secretariat' | 'accounting' | 'direction'`
- [ ] Update User interface: `id, username, role, full_name, email, active`
- [ ] Implement permission matrix from avenant (see table above)
- [ ] Add `getAccessLevel(role, resource)` → returns 'full' | 'read' | 'none'
- [ ] Add `hasPermission(action, resource)` → checks if action allowed given access level
- [ ] Add `canRead(resource)` and `canWrite(resource)` convenience methods
- [ ] Keep in-memory currentUser for fast IPC checks
- [ ] Add `setCurrentUser()` and `getCurrentUser()` (backward compatible)

### Task 1.7 — Create session.service.ts
- [ ] Create `src/main/auth/session.service.ts`
- [ ] `createSession(userId)` → generate token, store in sessions table, set expiry (60 min)
- [ ] `validateSession(token)` → check not expired, renew if valid
- [ ] `destroySession(token)` → delete session
- [ ] `cleanExpiredSessions()` → periodic cleanup
- [ ] `startSessionMonitor()` → setInterval to check inactivity, auto-logout after 60 min
- [ ] Session token stored in-memory + SQLite for persistence across app restarts

### Task 1.8 — Create audit.service.ts (Sérénité offer)
- [ ] Create `src/main/auth/audit.service.ts`
- [ ] `logAction(userId, action, tableName, recordId, oldValue, newValue)` 
- [ ] `getAuditLogs(filters)` → query audit_logs with pagination
- [ ] Write to audit_logs table on every sensitive action
- [ ] This is optional — can be toggled via settings for now

---

## PHASE 2: IPC Handlers (Auth + RBAC on all channels)

### Task 2.1 — Create auth.handler.ts
- [ ] Create `src/main/ipc/auth.handler.ts`
- [ ] Register IPC channels:
  - `auth:login` → auth.service.loginWithPassword + session creation
  - `auth:logout` → session destruction
  - `auth:getCurrentUser` → return current user from session
  - `auth:checkSession` → validate existing session on app start
  - `auth:createUser` → UserRepository.create (admin only)
  - `auth:updateUser` → UserRepository.update (admin only)
  - `auth:deactivateUser` → UserRepository.deactivate (admin only)
  - `auth:listUsers` → UserRepository.list (admin only)
  - `auth:changePassword` → auth.service.changePassword
  - `auth:resetPassword` → auth.service.resetPassword (admin only)
- [ ] All user management channels must check `hasPermission('manage', 'users')`

### Task 2.2 — Update index.ts
- [ ] Remove inline auth IPC handlers (lines 21-46)
- [ ] Import and call `registerAuthHandlers()` from auth.handler
- [ ] Add session cleanup on app quit
- [ ] Keep existing handler registrations

### Task 2.3 — Add RBAC to payment.handler.ts
- [ ] Import `hasPermission` from rbac.service
- [ ] `payment:create` → check `canWrite('payments')`
- [ ] `payment:getByStudent` → check `canRead('payments')`
- [ ] `payment:getAll` → check `canRead('payments')`
- [ ] `payment:getTuitionStatus` → check `canRead('payments')`

### Task 2.4 — Add RBAC to attendance.handler.ts
- [ ] Import `hasPermission` from rbac.service
- [ ] All get* → check `canRead('attendance')`
- [ ] All record* → check `canWrite('attendance')`

### Task 2.5 — Add RBAC to event.handler.ts
- [ ] Import `hasPermission` from rbac.service
- [ ] create/update/delete → check `canWrite('students')` (events are student-related)
- [ ] list/getById → check `canRead('students')`
- [ ] addParticipants/recordPayment → check `canWrite('payments')`

### Task 2.6 — Add RBAC to settings.handler.ts
- [ ] Import `hasPermission` from rbac.service
- [ ] `settings:get` → check `canRead('settings')`
- [ ] `settings:set` → check `canWrite('settings')`
- [ ] `settings:getAll` → check `canRead('settings')`

### Task 2.7 — Add RBAC to dialog.handler.ts
- [ ] Import `hasPermission` from rbac.service
- [ ] `dialog:openFile` → check `canRead('students')` (used for photos)

### Task 2.8 — Update student.handler.ts RBAC
- [ ] Already has some RBAC checks — verify they use new rbac.service methods
- [ ] Update to use `canRead('students')` / `canWrite('students')` pattern
- [ ] Add read-only return mode when user has only read access

---

## PHASE 3: Preload Bridge + Shared Types

### Task 3.1 — Update shared/types.ts
- [ ] Add `UserRole` type: `'admin' | 'secretariat' | 'accounting' | 'direction'`
- [ ] Add `User` interface: id, username, role, full_name, email, active, last_login
- [ ] Add `AuthState` interface: user, isAuthenticated, sessionToken
- [ ] Add `AccessLevel` type: `'full' | 'read' | 'none'`

### Task 3.2 — Update preload/index.ts
- [ ] Extend `auth` API object with new channels:
  - `auth.checkSession()`
  - `auth.createUser(data)`
  - `auth.updateUser(id, data)`
  - `auth.deactivateUser(id)`
  - `auth.listUsers()`
  - `auth.changePassword(userId, oldPassword, newPassword)`
  - `auth.resetPassword(userId, newPassword)`

### Task 3.3 — Update preload/index.d.ts
- [ ] Add proper TypeScript interface for the `api` object
- [ ] Type all auth methods with proper signatures

---

## PHASE 4: Frontend — Auth Flow

### Task 4.1 — Create useAuthStore.ts
- [ ] Create `src/renderer/src/store/useAuthStore.ts`
- [ ] State: user, isAuthenticated, loading, error
- [ ] Methods: login(username, password), logout(), checkSession(), changePassword()
- [ ] On login success: store user in state
- [ ] On logout: clear state, redirect to login
- [ ] On app start: call checkSession() to restore session

### Task 4.2 — Create LoginPage.tsx
- [ ] Create `src/renderer/src/pages/LoginPage.tsx`
- [ ] Professional login form: username + password
- [ ] School branding (name + logo from settings)
- [ ] Error message display
- [ ] Loading state during login
- [ ] Auto-focus on username field
- [ ] Keyboard shortcut: Enter to submit

### Task 4.3 — Create ProtectedRoute.tsx
- [ ] Create `src/renderer/src/components/layout/ProtectedRoute.tsx`
- [ ] Check if user is authenticated before rendering children
- [ ] If not authenticated → redirect to /login
- [ ] Accept `requiredResource` and `requiredAccess` props
- [ ] If user lacks permission → show "Access Denied" page or redirect

### Task 4.4 — Rewrite App.tsx with auth flow
- [ ] Add `/login` route (no layout, no sidebar)
- [ ] Wrap all other routes with auth check
- [ ] On app mount: check session, redirect to login if not authenticated
- [ ] Pass user role to Layout for sidebar filtering
- [ ] Add `/users` route for user management (admin only)
- [ ] Add `/audit` route for audit logs (admin + direction)

### Task 4.5 — Update Layout/Sidebar for role-based visibility
- [ ] Filter sidebar NavItems based on user role
- [ ] Show/hide menu items:
  - Admin: sees everything
  - Secretariat: Eleves, Pointage, Notes
  - Accounting: Eleves (read), Paiements, Finance, Personnel
  - Direction: Everything (some read-only)
- [ ] Add user info display at bottom of sidebar (name + role)
- [ ] Add logout button
- [ ] Add "Gestion Utilisateurs" menu item (admin only)

---

## PHASE 5: Frontend — User Management + Read-Only Mode

### Task 5.1 — Create UserManagementPage.tsx
- [ ] Create `src/renderer/src/pages/UserManagementPage.tsx`
- [ ] Table of users with columns: username, full_name, email, role, active, last_login
- [ ] Create user form (admin only): username, password, full_name, email, role
- [ ] Edit user form: same but password optional
- [ ] Deactivate/reactivate toggle
- [ ] Reset password button
- [ ] Role assignment with preview of permissions

### Task 5.2 — Implement read-only mode on pages
- [ ] When user has `read` access level:
  - Disable create/edit/delete buttons
  - Make form fields read-only
  - Hide action columns in tables
  - Show "Lecture seule" badge at top of page
- [ ] When user has `none` access level:
  - Show "Accès non autorisé" message
  - Don't render the page content at all

### Task 5.3 — Update FinancePage.tsx for RBAC
- [ ] Check user access level for `payments` and `cash_journal`
- [ ] Hide Configuration tab for non-admin users
- [ ] Read-only mode for Direction role

### Task 5.4 — Update AttendancePage.tsx for RBAC
- [ ] Check user access level for `attendance`
- [ ] Hide save buttons for read-only users
- [ ] Read-only mode for Accounting and Direction

### Task 5.5 — Update EventsPage.tsx for RBAC
- [ ] Check user access level for events/payments
- [ ] Hide create/edit buttons for read-only users

### Task 5.6 — Update Settings.tsx for RBAC
- [ ] Only Admin has full access to settings
- [ ] Direction has read-only access
- [ ] Others see "Accès non autorisé"

### Task 5.7 — Update StudentList/StudentDetail/StudentForm for RBAC
- [ ] Check user access level for `students`
- [ ] Hide create/edit/delete for read-only users (Accounting)
- [ ] Read-only form rendering

---

## PHASE 6: Sync — Users Table

### Task 6.1 — Add users to sync tables
- [ ] Update `sync.service.ts` pullRemoteChanges tables array: add 'users'
- [ ] Handle user sync: when pulling a user from Supabase, upsert into local users table
- [ ] Handle password_hash sync: store securely (already hashed, safe to sync)
- [ ] When creating a user locally, add to sync queue for push
- [ ] Conflict resolution: last write wins for user updates

### Task 6.2 — Create users table in Supabase
- [ ] SQL to create `users` table in Supabase matching local schema
- [ ] Add RLS policies: anon can read/write (since Electron app uses anon key)
- [ ] Exclude password_hash from public RLS if security concern (or keep for sync)

---

## PHASE 7: Security Hardening

### Task 7.1 — Session timeout implementation
- [ ] 60-minute inactivity timer in session.service.ts
- [ ] On any IPC call, reset the timer
- [ ] When timer fires, destroy session, notify renderer to redirect to login
- [ ] Add `auth:activity` IPC channel for renderer to ping on user activity

### Task 7.2 — Password security
- [ ] Enforce minimum password length (8 characters)
- [ ] bcrypt cost factor 10 for hashing
- [ ] Never return password_hash in any IPC response
- [ ] Default admin password must be changed on first login (optional but recommended)

### Task 7.3 — Input validation
- [ ] Validate username format (alphanumeric, 3-50 chars)
- [ ] Validate role is one of the 4 allowed values
- [ ] Sanitize all IPC inputs against injection

---

## COMPLETION TRACKER

| Phase | Status | Notes |
|-------|--------|-------|
| 1.1 Migration 004 | ⬜ | |
| 1.2 Update db.ts | ⬜ | |
| 1.3 Install bcryptjs | ⬜ | |
| 1.4 UserRepository | ⬜ | |
| 1.5 Rewrite auth.service | ⬜ | |
| 1.6 Rewrite rbac.service | ⬜ | |
| 1.7 Session service | ⬜ | |
| 1.8 Audit service | ⬜ | |
| 2.1 Auth handler | ⬜ | |
| 2.2 Update index.ts | ⬜ | |
| 2.3 RBAC payments | ⬜ | |
| 2.4 RBAC attendance | ⬜ | |
| 2.5 RBAC events | ⬜ | |
| 2.6 RBAC settings | ⬜ | |
| 2.7 RBAC dialog | ⬜ | |
| 2.8 Update student RBAC | ⬜ | |
| 3.1 Shared types | ⬜ | |
| 3.2 Preload API | ⬜ | |
| 3.3 Preload types | ⬜ | |
| 4.1 Auth store | ⬜ | |
| 4.2 Login page | ⬜ | |
| 4.3 Protected route | ⬜ | |
| 4.4 Rewrite App.tsx | ⬜ | |
| 4.5 Sidebar filtering | ⬜ | |
| 5.1 User management page | ⬜ | |
| 5.2 Read-only mode | ⬜ | |
| 5.3 FinancePage RBAC | ⬜ | |
| 5.4 AttendancePage RBAC | ⬜ | |
| 5.5 EventsPage RBAC | ⬜ | |
| 5.6 Settings RBAC | ⬜ | |
| 5.7 Student pages RBAC | ⬜ | |
| 6.1 Sync users | ⬜ | |
| 6.2 Supabase users table | ⬜ | |
| 7.1 Session timeout | ⬜ | |
| 7.2 Password security | ⬜ | |
| 7.3 Input validation | ⬜ | |
