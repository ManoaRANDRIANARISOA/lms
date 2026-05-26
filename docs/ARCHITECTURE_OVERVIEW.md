# Architecture Overview — School Management System

## Table of Contents

- [Introduction](#introduction)
- [Project Structure](#project-structure)
- [Core Components](#core-components)
- [Architecture Overview](#architecture-overview)
- [Detailed Component Analysis](#detailed-component-analysis)
- [Dependency Analysis](#dependency-analysis)
- [Performance Considerations](#performance-considerations)
- [Troubleshooting Guide](#troubleshooting-guide)
- [Conclusion](#conclusion)

---

## Introduction

This document presents the architecture of the **Lycée Manjary Soa School Management System**, a desktop application built with Electron, React, and TypeScript. The system follows an Electron main/renderer process separation, with a local SQLite database for offline-first data persistence and Supabase for cloud synchronization. State management is handled by Zustand in the renderer process, while IPC bridges secure communication between the renderer and main process. Cross-cutting concerns include **Role-Based Access Control (RBAC)** authentication, robust synchronization with conflict resolution, audit logging, and secure IPC exposure.

### Key Features

- **Offline-First**: All core operations work without internet via local SQLite
- **Cloud Sync**: Automatic bidirectional sync with Supabase every 5 minutes
- **RBAC Authentication**: 4 roles (admin, secretariat, accounting, direction) with granular permissions
- **Session Management**: 60-minute timeout with activity tracking
- **Audit Logging**: Complete audit trail for all sensitive operations
- **Conflict Resolution**: Last-write-wins strategy with manual conflict handling

---

## Project Structure

```
lms/
├── src/
│   ├── main/                      # Electron Main Process
│   │   ├── auth/                  # Authentication & RBAC
│   │   │   ├── auth.service.ts    # Login/logout with bcrypt
│   │   │   ├── rbac.service.ts    # Permission matrix & checks
│   │   │   ├── session.service.ts # Session lifecycle & timeout
│   │   │   └── audit.service.ts   # Audit log management
│   │   ├── database/              # Database Layer
│   │   │   ├── db.ts              # SQLite initialization & migrations
│   │   │   ├── migrations/        # SQL migration files (001-006)
│   │   │   └── repositories/      # Data access layer
│   │   │       ├── student.repository.ts
│   │   │       ├── payment.repository.ts
│   │   │       ├── attendance.repository.ts    # Bus/canteen attendance
│   │   │       ├── personnel.repository.ts      # Personnel CRUD + salary + daily attendance
│   │   │       ├── event.repository.ts
│   │   │       ├── settings.repository.ts
│   │   │       └── user.repository.ts
│   │   ├── ipc/                   # IPC Handlers
│   │   │   ├── auth.handler.ts    # Auth & user management
│   │   │   ├── student.handler.ts # Student CRUD
│   │   │   ├── payment.handler.ts # Payment operations
│   │   │   ├── attendance.handler.ts
│   │   │   ├── personnel.handler.ts   # Personnel CRUD + salary + daily attendance
│   │   │   ├── event.handler.ts
│   │   │   ├── settings.handler.ts
│   │   │   └── dialog.handler.ts
│   │   ├── services/
│   │   │   └── sync.service.ts    # Supabase sync engine
│   │   └── index.ts               # Main process entry point
│   │
│   ├── preload/                   # Secure Bridge Layer
│   │   ├── index.ts               # ContextBridge API exposure
│   │   └── index.d.ts             # TypeScript declarations
│   │
│   ├── renderer/                  # React Renderer Process
│   │   └── src/
│   │       ├── App.tsx            # Root component with auth flow
│   │       ├── main.tsx           # React entry point
│   │       ├── components/
│   │       │   ├── layout/        # Layout components
│   │       │   ├── shared/        # Shared components
│   │       │   │   ├── ProtectedRoute.tsx
│   │       │   │   └── ReadOnlyBanner.tsx
│   │       │   ├── students/      # Student-specific components
│   │       │   ├── personnel/     # Personnel-specific components
│   │       │   │   └── AttendanceCalendar.tsx  # Daily attendance grid
│   │       │   └── ui/            # Base UI components
│   │       ├── lib/
│   │       │   ├── utils.ts
│   │       │   ├── finance-settings.ts
│   │       │   └── usePermissions.ts
│   │       ├── pages/
│   │       │   ├── auth/          # Auth-related pages
│   │       │   │   ├── LoginPage.tsx
│   │       │   │   ├── UserManagementPage.tsx
│   │       │   │   └── AuditLogPage.tsx
│   │       │   ├── students/      # Student management
│   │       │   ├── personnel/     # Personnel management
│   │       │   │   ├── PersonnelList.tsx
│   │       │   │   ├── PersonnelForm.tsx
│   │       │   │   └── PersonnelDetail.tsx
│   │       │   ├── AttendancePage.tsx
│   │       │   ├── EventsPage.tsx
│   │       │   ├── FinancePage.tsx
│   │       │   └── Settings.tsx
│   │       ├── store/             # Zustand State Management
│   │       │   ├── useAuthStore.ts
│   │       │   ├── useStudentStore.ts
│   │       │   ├── usePersonnelStore.ts
│   │       │   └── useFinanceStore.ts
│   │       └── env.d.ts           # Environment type declarations
│   │
│   └── shared/                    # Shared Types
│       └── types.ts               # Cross-process type definitions
│
├── docs/                          # Documentation
│   ├── rbac/                      # RBAC specification
│   ├── supabase_migration_003.sql
│   └── supabase_schema.sql
│
├── database.sqlite                # Local SQLite database
├── .env                           # Environment variables
├── electron.vite.config.ts        # Vite configuration
├── tailwind.config.js             # TailwindCSS config
└── package.json                   # Dependencies & scripts
```

### Primary Areas

**Main process**: Electron bootstrap, IPC registration, database initialization, authentication (bcrypt + RBAC), session management, audit logging, and cloud synchronization.

**Preload scripts**: Secure IPC API exposure to the renderer process via `contextBridge`. All channels are explicitly defined and typed.

**Renderer process**: React application with TypeScript, HashRouter-based routing, Zustand stores for state management, TailwindCSS styling, and role-based UI rendering.

---

## Core Components

### 1. Authentication & RBAC System

**Location**: `src/main/auth/`

#### auth.service.ts
- **Purpose**: Handles user login/logout using local SQLite and bcrypt
- **Features**:
  - Password verification with bcryptjs (cost factor 10)
  - Session creation and validation
  - First-login password change detection
  - Offline-only (no network dependency)

#### rbac.service.ts
- **Purpose**: Implements the Avenant N°1 RBAC permission matrix
- **Roles**:
  - `admin`: Full access to everything
  - `secretariat`: Student management, attendance, grades
  - `accounting`: Payments, finance, personnel (read students)
  - `direction`: Read access to most, full on reports/settings
  
- **Permission Matrix**:
  ```
  Resource         | Admin | Secretariat | Accounting | Direction
  -----------------|-------|-------------|------------|----------
  students         | full  | full        | read       | full
  payments         | full  | read        | full       | full
  attendance       | full  | full        | read       | read
  grades           | full  | full        | none       | read
  cash_journal     | full  | none        | full       | read
  personnel        | full  | none        | full       | read
  reports          | full  | none        | full       | full
  settings         | full  | none        | none       | read
  users            | full  | none        | none       | none
  audit            | full  | none        | none       | read
  events           | full  | full        | read       | full
  ```

#### session.service.ts
- **Purpose**: Manages user sessions with timeout and cleanup
- **Features**:
  - 60-minute configurable timeout
  - Auto-renewal on activity
  - Periodic cleanup (every 10 minutes)
  - Inactivity monitoring (every 1 minute)
  - Session persistence across app restarts

#### audit.service.ts
- **Purpose**: Records all sensitive actions in audit_logs table
- **Logged Actions**: login, logout, create, update, delete, deactivate, password changes
- **Features**:
  - Configurable via `rbac_offer_level` setting
  - Critical actions (login/logout) always logged
  - Filterable queries with pagination

### 2. Database Layer

**Location**: `src/main/database/`

#### db.ts
- Initializes better-sqlite3 with WAL journal mode
- Runs migrations sequentially (001_init → 004_rbac)
- Auto-cleans corrupted student records on startup

#### Repositories
Repository pattern for clean separation of data access:
- `StudentRepository`: CRUD, re-enrollment, service stats, enrollment repair
- `PaymentRepository`: Payment creation, student payments, tuition status
- `AttendanceRepository`: Bus/canteen attendance tracking
- `EventRepository`: Parent event management and payments
- `SettingsRepository`: Key-value settings with JSON values
- `UserRepository`: User CRUD with bcrypt password hashing, never exposes password_hash

### 3. IPC Handlers

**Location**: `src/main/ipc/`

All handlers follow the same pattern:
1. RBAC permission check
2. Repository operation
3. Audit log (for write operations)
4. Return result

```typescript
// Example pattern
ipcMain.handle('student:create', async (_, studentData) => {
  if (!canWrite('students')) {
    return { success: false, error: 'Accès refusé: création élève' }
  }
  const result = StudentRepository.create(studentData)
  if (result.success && result.id) {
    logAction(getCurrentUser()?.id, 'create', 'students', result.id, null, JSON.stringify(studentData))
  }
  return result
})
```

### 4. Synchronization Engine

**Location**: `src/main/services/sync.service.ts`

#### Push Local Changes
- Reads from `sync_queue` table (status: pending/error)
- Sanitizes data for Supabase
- Handles photo uploads to Supabase Storage
- Conflict resolution for duplicate registration numbers
- **Security**: Excludes `password_hash` when syncing users

#### Pull Remote Changes
- Fetches changes since last sync timestamp
- Time-based conflict resolution (newer wins)
- Handles registration_number collisions
- Sanitizes booleans/objects for SQLite

#### Sync Cycle
- Runs every 5 minutes
- Initial sync 5 seconds after app startup
- Graceful degradation when offline

### 5. Preload Bridge

**Location**: `src/preload/`

Exposes type-safe API to renderer:
- `api.student.*` — Student CRUD operations
- `api.payment.*` — Payment management
- `api.attendance.*` — Bus/canteen attendance
- `api.event.*` — Event management
- `api.settings.*` — Settings management
- `api.auth.*` — Auth, user management, audit logs
- `api.dialog.*` — Native file dialogs

### 6. Frontend State Management

**Location**: `src/renderer/src/store/`

#### useAuthStore
- Manages authentication state
- Login/logout with localStorage token persistence
- Permission matrix from backend
- `canRead()` and `canWrite()` helpers
- Session activity tracking

#### useStudentStore
- Student list with filters
- Current student detail view
- Dual-mode: Electron IPC or Supabase direct (web mode)

#### useFinanceStore
- Finance prices configuration
- Tuition, bus, canteen, uniform pricing

### 7. Frontend Components

**Pages**:
- `LoginPage.tsx` — Authentication form
- `StudentList.tsx` — Student management with search/filter
- `StudentForm.tsx` — Create/edit student
- `StudentDetail.tsx` — Full student view with tabs
- `FinancePage.tsx` — Finance management (prices, payments)
- `AttendancePage.tsx` — Bus/canteen daily tracking
- `EventsPage.tsx` — Parent event management
- `UserManagementPage.tsx` — Admin user CRUD
- `AuditLogPage.tsx` — Audit log viewer with filters
- `Settings.tsx` — Application settings

**Shared Components**:
- `ProtectedRoute.tsx` — Route guard with resource checks
- `ReadOnlyBanner.tsx` — Read-only mode indicator
- UI components (button, input, dialog, tabs, checkbox)

---

## Architecture Overview

### Process Separation

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron App                             │
├──────────────────────────┬──────────────────────────────────┤
│   Main Process           │   Renderer Process               │
│   (Node.js)              │   (Chromium)                     │
│                          │                                  │
│  ┌──────────────┐       │   ┌────────────────────┐         │
│  │ index.ts     │       │   │ App.tsx            │         │
│  │ (Entry)      │       │   │ (Router + Layout)  │         │
│  └──────┬───────┘       │   └────────┬───────────┘         │
│         │               │            │                     │
│  ┌──────┴───────┐       │   ┌────────┴───────────┐         │
│  │ IPC Handlers │◄──────┼──►│ React Pages        │         │
│  │ (RBAC+Audit) │  IPC  │   │ (useState/useStore)│         │
│  └──────┬───────┘       │   └────────────────────┘         │
│         │               │                                  │
│  ┌──────┴───────┐       │   ┌────────────────────┐         │
│  │ Repositories │       │   │ Zustand Stores     │         │
│  │ (SQLite ORM) │       │   │ (State Management) │         │
│  └──────┬───────┘       │   └────────────────────┘         │
│         │               │                                  │
│  ┌──────┴───────┐       │                                  │
│  │ SQLite DB    │       │                                  │
│  │ (better-     │       │                                  │
│  │  sqlite3)    │       │                                  │
│  └──────┬───────┘       │                                  │
│         │               │                                  │
│  ┌──────┴───────┐       │                                  │
│  │ Sync Service │───────┼──► Supabase Cloud                │
│  │ (5 min)      │       │                                  │
│  └──────────────┘       │                                  │
└──────────────────────────┴──────────────────────────────────┘
```

### Data Flow

1. **User Action** → React component calls `window.api.*`
2. **Preload Bridge** → `ipcRenderer.invoke()` to main process
3. **IPC Handler** → RBAC check → Repository operation → Audit log
4. **Repository** → SQLite query/mutation
5. **Response** → IPC → Renderer → Zustand store update → UI re-render

### Sync Flow

```
Local SQLite ──Push──► Supabase Cloud
     ▲                     │
     │                     │
     └──────Pull───────────┘

Queue → sync_queue table tracks pending changes
Conflict Resolution → Last-write-wins with manual overrides
```

---

## Detailed Component Analysis

### Authentication Flow

```
1. User enters username/password on LoginPage
   ↓
2. useAuthStore.login() → api.auth.login()
   ↓
3. IPC → auth.handler.ts → loginWithPassword()
   ↓
4. UserRepository.getByUsernameWithHash()
   ↓
5. bcrypt.compare(password, hash)
   ↓
6. session.service.createSession() → UUID token
   ↓
7. RBAC.setCurrentUser() → In-memory user
   ↓
8. Return { ok: true, user, token, requirePasswordChange }
   ↓
9. Frontend stores token in localStorage
   ↓
10. fetchPermissions() → Get permission matrix
   ↓
11. Redirect to dashboard
```

### Session Lifecycle

```
Login → Create session (expires in 60 min)
   ↓
User active → Validate/renew session on each IPC call
   ↓
5 min interval → Activity ping from frontend
   ↓
10 min interval → Clean expired sessions (backend)
   ↓
1 min interval → Check inactivity timeout (backend)
   ↓
Logout → Destroy session → Clear in-memory user
```

### Permission Check Flow

```
Frontend renders page
   ↓
Sidebar checks useAuthStore.canRead(resource)
   ↓
Nav items hidden if no access
   ↓
Page loads with <ReadOnlyBanner resource="X" />
   ↓
User clicks write button → Disabled if !canWrite
   ↓
If bypassed → IPC handler RBAC check blocks it
   ↓
Returns { success: false, error: 'Accès refusé' }
```

---

## Dependency Analysis

### Main Process Dependencies
- `electron` — Desktop framework
- `better-sqlite3` — SQLite database
- `bcryptjs` — Password hashing (pure JS)
- `@supabase/supabase-js` — Cloud sync client
- `dotenv` — Environment variables
- `uuid` — Session token generation

### Renderer Process Dependencies
- `react` + `react-dom` — UI framework
- `react-router-dom` — Hash-based routing
- `zustand` — State management
- `tailwindcss` — Utility-first CSS
- `lucide-react` — Icon library
- `date-fns` — Date formatting

### Shared Dependencies
- `typescript` — Type safety
- `electron-vite` — Build tooling
- `@electron-toolkit/*` — Electron utilities

### Dependency Graph

```
index.ts
  ├─ db.ts
  │   └─ migrations/001-004
  ├─ auth.handler.ts
  │   ├─ auth.service.ts → rbac.service.ts, session.service.ts, UserRepository
  │   ├─ audit.service.ts
  │   └─ user.repository.ts
  ├─ student.handler.ts → StudentRepository, sync.service.ts
  ├─ payment.handler.ts → PaymentRepository
  ├─ attendance.handler.ts → AttendanceRepository
  ├─ event.handler.ts → EventRepository
  ├─ settings.handler.ts → SettingsRepository
  └─ sync.service.ts → Supabase
```

---

## Performance Considerations

### Database Optimizations
- **WAL Mode**: Write-ahead logging for concurrent reads
- **Indexes**: Created on frequently queried columns (class, search_text, sync_status)
- **Prepared Statements**: All queries use prepared statements (prevents SQL injection, improves performance)
- **Pagination**: Student list supports pagination for large datasets

### Memory Management
- **In-Memory RBAC**: Current user stored in memory for fast permission checks
- **Session Cleanup**: Automatic removal of expired sessions prevents table bloat
- **SQLite Auto-Vacuum**: WAL mode auto-manages database size

### Sync Performance
- **Incremental Sync**: Only pulls changes since last sync timestamp
- **Batch Processing**: Pushes up to 100 queue items per sync cycle
- **Offline Resilience**: Graceful degradation when offline, retries on reconnect

### UI Performance
- **Virtual Scrolling**: Not implemented yet (future optimization for large student lists)
- **Lazy Loading**: Routes not loaded until accessed
- **State Colocation**: Zustand stores minimize re-renders

---

## Troubleshooting Guide

### Common Issues

#### 1. Login Fails
**Symptom**: "Identifiants incorrects" error

**Causes**:
- Wrong username/password
- Account deactivated
- Database not initialized

**Solution**:
```bash
# Check if admin user exists
sqlite3 database.sqlite "SELECT id, username, active FROM users WHERE role='admin';"

# Verify migration 004 applied
sqlite3 database.sqlite "SELECT * FROM migrations WHERE name='004_add_rbac.sql';"

# Reset admin password (in Node REPL)
node -e "console.log(require('bcryptjs').hashSync('admin123', 10))"
# Update with new hash
```

#### 2. Sync Fails
**Symptom**: Console shows sync errors

**Causes**:
- Supabase credentials missing in `.env`
- Network connectivity issues
- Bucket not created in Supabase Storage

**Solution**:
```bash
# Verify .env file exists
cat .env

# Check sync queue for stuck items
sqlite3 database.sqlite "SELECT * FROM sync_queue WHERE status='error' LIMIT 5;"

# Force manual sync (in main process)
await syncWithCloud()
```

#### 3. Permission Denied Errors
**Symptom**: "Accès refusé" on valid operations

**Causes**:
- User role doesn't have required permission
- RBAC service not initialized with current user

**Solution**:
```bash
# Check user role
sqlite3 database.sqlite "SELECT username, role FROM users WHERE username='admin';"

# Check permission matrix (in code)
# See rbac.service.ts PERMISSION_MATRIX
```

#### 4. Database Corruption
**Symptom**: SQLite errors on startup

**Solution**:
```bash
# Check database integrity
sqlite3 database.sqlite "PRAGMA integrity_check;"

# Backup and recreate
cp database.sqlite database.sqlite.backup
# Re-run migrations
```

#### 5. Session Timeout Issues
**Symptom**: User logged out unexpectedly

**Causes**:
- Session expired (60 min inactivity)
- App restarted without valid session

**Solution**:
```bash
# Check session timeout setting
sqlite3 database.sqlite "SELECT value FROM settings WHERE key='auth_session_timeout_minutes';"

# View active sessions
sqlite3 database.sqlite "SELECT * FROM sessions WHERE expires_at > datetime('now');"
```

### Debugging Tips

```bash
# Enable verbose logging (in development)
# Add to index.ts
console.log('IPC call:', channel, args)

# Monitor sync queue
sqlite3 database.sqlite "SELECT table_name, action, status, created_at FROM sync_queue ORDER BY created_at DESC LIMIT 10;"

# Check audit logs
sqlite3 database.sqlite "SELECT action, table_name, timestamp FROM audit_logs ORDER BY timestamp DESC LIMIT 20;"
```

---

## Conclusion

The School Management System follows a robust architecture with clear separation of concerns:

1. **Security**: RBAC with 4 roles, bcrypt password hashing, session management, audit logging
2. **Reliability**: Offline-first SQLite with automatic cloud sync and conflict resolution
3. **Maintainability**: Repository pattern, typed IPC bridges, modular components
4. **Scalability**: Zustand state management, prepared statements, incremental sync
5. **User Experience**: Role-based UI, read-only mode indicators, clean login flow

The system is designed to work seamlessly in low-connectivity environments (common in Madagascar) while providing cloud backup when available. The RBAC system ensures that different user types (admin, secretariat, accounting, direction) only see and modify what they're authorized to access.

### Future Enhancements
- Virtual scrolling for large student lists
- Export to PDF/Excel for reports
- Push notifications for sync conflicts
- Multi-device session management
- Advanced audit log analytics
- Automated backup scheduling
