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
- **PDF Generation**: Receipts, certificates, report cards, payslips via jsPDF
- **Email Automation**: SMTP Gmail with scheduled daily reports
- **Reports & Export**: Financial, unpaid, payroll reports + CSV export

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
│   │   │   ├── db.ts              # SQLite initialization & migrations (001-027)
│   │   │   ├── migrations/        # SQL migration files
│   │   │   └── repositories/      # Data access layer
│   │   │       ├── student.repository.ts
│   │   │       ├── payment.repository.ts
│   │   │       ├── attendance.repository.ts
│   │   │       ├── personnel.repository.ts
│   │   │       ├── grade.repository.ts
│   │   │       ├── event.repository.ts
│   │   │       ├── settings.repository.ts
│   │   │       ├── user.repository.ts
│   │   │       └── cashjournal.repository.ts
│   │   ├── ipc/                   # IPC Handlers
│   │   │   ├── auth.handler.ts
│   │   │   ├── student.handler.ts
│   │   │   ├── payment.handler.ts
│   │   │   ├── attendance.handler.ts
│   │   │   ├── personnel.handler.ts
│   │   │   ├── grade.handler.ts
│   │   │   ├── dashboard.handler.ts
│   │   │   ├── event.handler.ts
│   │   │   ├── settings.handler.ts
│   │   │   ├── dialog.handler.ts
│   │   │   ├── cashjournal.handler.ts
│   │   │   ├── pdf.handler.ts
│   │   │   ├── email.handler.ts
│   │   │   └── report.handler.ts
│   │   ├── services/
│   │   │   ├── sync.service.ts    # Supabase sync engine + SYNCABLE_TABLES
│   │   │   ├── pdf.service.ts     # PDF generation (jsPDF)
│   │   │   ├── email.service.ts   # SMTP email + scheduler
│   │   │   ├── report.service.ts  # Financial/payroll/unpaid reports
│   │   │   └── export.service.ts  # CSV export
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
│   │       │   │   └── AttendanceCalendar.tsx
│   │       │   └── ui/            # Base UI components
│   │       ├── lib/
│   │       │   ├── utils.ts
│   │       │   ├── finance-settings.ts
│   │       │   ├── usePermissions.ts
│   │       │   ├── useClasses.ts
│   │       │   └── image-utils.ts
│   │       ├── pages/
│   │       │   ├── auth/
│   │       │   │   ├── LoginPage.tsx
│   │       │   │   ├── UserManagementPage.tsx
│   │       │   │   └── AuditLogPage.tsx
│   │       │   ├── students/
│   │       │   │   ├── StudentList.tsx
│   │       │   │   ├── StudentForm.tsx
│   │       │   │   ├── StudentDetail.tsx
│   │       │   │   └── CertificatePage.tsx
│   │       │   ├── personnel/
│   │       │   │   ├── PersonnelList.tsx
│   │       │   │   ├── PersonnelForm.tsx
│   │       │   │   └── PersonnelDetail.tsx
│   │       │   ├── grades/
│   │       │   │   ├── GradesPage.tsx
│   │       │   │   ├── GradeEntry.tsx
│   │       │   │   ├── GradeBook.tsx
│   │       │   │   ├── ReportCardView.tsx
│   │       │   │   └── SubjectManager.tsx
│   │       │   ├── finance/
│   │       │   │   ├── CashJournalPage.tsx
│   │       │   │   ├── FinanceOverview.tsx
│   │       │   │   ├── PaymentAlerts.tsx
│   │       │   │   ├── PaymentJournal.tsx
│   │       │   │   └── FinanceConfig.tsx
│   │       │   ├── settings/
│   │       │   │   └── EmailSettings.tsx
│   │       │   ├── reports/
│   │       │   │   └── ReportsPage.tsx
│   │       │   ├── DashboardPage.tsx
│   │       │   ├── AttendancePage.tsx
│   │       │   ├── EventsPage.tsx
│   │       │   ├── FinancePage.tsx
│   │       │   └── Settings.tsx
│   │       ├── store/             # Zustand State Management
│   │       │   ├── useAuthStore.ts
│   │       │   ├── useStudentStore.ts
│   │       │   ├── usePersonnelStore.ts
│   │       │   ├── useGradeStore.ts
│   │       │   ├── useFinanceStore.ts
│   │       │   └── useCashJournalStore.ts
│   │       └── env.d.ts           # Environment type declarations
│   │
│   └── shared/                    # Shared Types
│       └── types.ts               # Cross-process type definitions
│
├── docs/                          # Documentation
│   ├── AGENT_ANCHOR.md            # IA anchor point
│   ├── ARCHITECTURE_OVERVIEW.md   # This file
│   ├── COMPTES_UTILISATEURS.md    # User accounts guide
│   └── FINAL_PLAN.md              # Finition plan
│
├── database.sqlite                # Local SQLite database
├── .env                           # Environment variables
├── electron.vite.config.ts        # Vite configuration
├── tailwind.config.js             # TailwindCSS config (IDE autocompletion)
└── package.json                   # Dependencies & scripts
```

---

## Core Components

### 1. Authentication & RBAC System

**Location**: `src/main/auth/`

#### auth.service.ts
- Password verification with bcryptjs (cost factor 10)
- Session creation and validation
- First-login password change detection

#### rbac.service.ts
- 4 roles: admin, secretariat, accounting, direction
- 11 resources with granular permissions (full/read/none)

#### session.service.ts
- 60-minute configurable timeout
- Auto-renewal on activity
- Periodic cleanup (every 10 minutes)

#### audit.service.ts
- Records all sensitive actions in audit_logs table
- Logged: login, logout, create, update, delete, password changes

### 2. Database Layer

**Location**: `src/main/database/`

#### db.ts
- Initializes better-sqlite3 with WAL journal mode
- Runs 28 migrations sequentially
- Schema healing mechanism (`ensureDeletedColumn`)
- Soft-delete on startup for corrupted records

#### Repositories
- `StudentRepository`: CRUD, re-enrollment, service stats, enrollment repair
- `PaymentRepository`: Payment creation, tuition status, unpaid alerts (optimized JOIN)
- `AttendanceRepository`: Bus/canteen attendance tracking
- `PersonnelRepository`: CRUD, salary calculation (hybrid quota/hours), daily attendance
- `GradeRepository`: Subjects, grades, weighted averages, class ranking, class_subjects
- `EventRepository`: Parent event management and payments
- `SettingsRepository`: Key-value settings with JSON values
- `UserRepository`: User CRUD with bcrypt, never exposes password_hash
- `CashJournalRepository`: Cash journal CRUD, daily/monthly balances, category summaries

### 3. IPC Handlers

**Location**: `src/main/ipc/`

All handlers follow the same pattern:
1. RBAC permission check
2. Repository operation
3. Audit log (for write operations)
4. Return result

14 handler files covering: auth, student, payment, attendance, personnel, grade, dashboard, event, settings, dialog, cashjournal, pdf, email, report.

### 4. Services

**Location**: `src/main/services/`

#### sync.service.ts
- Bidirectional push/pull with Supabase every 5 minutes
- `SYNCABLE_TABLES` whitelist prevents SQL injection
- Excludes `password_hash` when syncing users
- Boolean conversion SQLite (0/1) ↔ PostgreSQL (true/false)

#### pdf.service.ts
- jsPDF-based generation: receipt, certificate, report card, payslip, daily report
- `sanitizeFilename()` for accented/special characters
- Multi-page pagination with correct page numbering

#### email.service.ts
- nodemailer SMTP Gmail configuration
- Scheduled daily report at 18h
- Email logging in settings

#### report.service.ts
- Monthly finance report, unpaid report, payroll report, tuition report
- SQL-based aggregation with school_year filtering

#### export.service.ts
- Generic CSV export with UTF-8 BOM for Excel compatibility

### 5. Preload Bridge

**Location**: `src/preload/`

Exposes type-safe API to renderer:
- `api.student.*` — Student CRUD
- `api.payment.*` — Payment management + getUnpaidAlerts
- `api.attendance.*` — Bus/canteen attendance
- `api.personnel.*` — Personnel CRUD, salary, daily attendance
- `api.grade.*` — Grades, subjects, class_subjects, averages
- `api.dashboard.*` — Dashboard KPIs
- `api.event.*` — Event management
- `api.settings.*` — Settings management
- `api.auth.*` — Auth, user management, audit logs
- `api.dialog.*` — Native file dialogs
- `api.cashJournal.*` — Cash journal CRUD + balances
- `api.pdf.*` — PDF generation + openFile (path-validated)
- `api.email.*` — SMTP config, test, send
- `api.report.*` — Report generation
- `api.export.*` — CSV export

### 6. Frontend State Management

**Location**: `src/renderer/src/store/`

| Store | Purpose |
|-------|---------|
| `useAuthStore` | Authentication, permissions, session activity |
| `useStudentStore` | Student list, detail, filters |
| `usePersonnelStore` | Personnel list, attendance, salary, absences |
| `useGradeStore` | Subjects, grades, averages, ranking |
| `useFinanceStore` | Finance prices configuration |
| `useCashJournalStore` | Cash journal entries, balances |

### 7. Frontend Pages

| Page | Module | Description |
|------|--------|-------------|
| `DashboardPage` | Dashboard | KPIs + activity + payment trend chart |
| `LoginPage` | Auth | Authentication form |
| `UserManagementPage` | Auth | Admin user CRUD |
| `AuditLogPage` | Auth | Audit log viewer with filters |
| `StudentList` | Students | Search/filter student management |
| `StudentForm` | Students | Create/edit student |
| `StudentDetail` | Students | Full student view with tabs |
| `CertificatePage` | Students | Certificate generation |
| `PersonnelList` | Personnel | Personnel management with filters |
| `PersonnelForm` | Personnel | Create/edit personnel |
| `PersonnelDetail` | Personnel | 4 tabs: Info, Attendance, Absences, Salary |
| `GradesPage` | Grades | Module hub |
| `GradeEntry` | Grades | Grade entry by class/subject/term |
| `GradeBook` | Grades | Cross-table view (students × subjects) |
| `ReportCardView` | Grades | Individual report card |
| `SubjectManager` | Grades | Subject CRUD |
| `FinancePage` | Finance | Tabs wrapper (overview, journal, config) |
| `FinanceOverview` | Finance | KPI cards + recovery rate |
| `PaymentJournal` | Finance | Payment history with receipt PDF |
| `CashJournalPage` | Finance | Cash journal CRUD |
| `PaymentAlerts` | Finance | Unpaid alerts (optimized backend query) |
| `FinanceConfig` | Finance | Tariff configuration |
| `AttendancePage` | Attendance | Bus/canteen daily tracking |
| `EventsPage` | Events | Parent event management |
| `EmailSettings` | Settings | SMTP configuration |
| `ReportsPage` | Reports | Report generation + CSV export |
| `Settings` | Settings | Application settings + class management |

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
│  └──────┬───────┘       │                                  │
│         │               │                                  │
│  ┌──────┴───────┐       │                                  │
│  │ Services     │───────┼──► Supabase Cloud                │
│  │ sync/pdf/    │       │   SMTP Gmail                     │
│  │ email/report │       │   File System (PDF)              │
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
Whitelist → SYNCABLE_TABLES validates table names
Conflict Resolution → Last-write-wins with manual overrides
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
- `jspdf` — PDF generation
- `nodemailer` — SMTP email

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

---

## Performance Considerations

### Database Optimizations
- **WAL Mode**: Write-ahead logging for concurrent reads
- **Indexes**: Created on frequently queried columns (class, search_text, sync_status)
- **Prepared Statements**: All queries use prepared statements
- **Pagination**: Student list supports pagination
- **Optimized Queries**: PaymentAlerts uses a single JOIN query instead of N+1

### Sync Performance
- **Incremental Sync**: Only pulls changes since last sync timestamp
- **Batch Processing**: Pushes up to 100 queue items per sync cycle
- **Offline Resilience**: Graceful degradation when offline

### UI Performance
- **Lazy Loading**: Routes not loaded until accessed
- **State Colocation**: Zustand stores minimize re-renders

---

## Troubleshooting Guide

### Common Issues

#### 1. Login Fails
```bash
# Check if admin user exists
sqlite3 database.sqlite "SELECT id, username, active FROM users WHERE role='admin';"
# Reset admin password (in Node REPL)
node -e "console.log(require('bcryptjs').hashSync('admin123', 10))"
```

#### 2. Sync Fails
```bash
# Check sync queue for stuck items
sqlite3 database.sqlite "SELECT * FROM sync_queue WHERE status='error' LIMIT 5;"
```

#### 3. Permission Denied
```bash
# Check user role
sqlite3 database.sqlite "SELECT username, role FROM users WHERE username='admin';"
```

#### 4. Database Corruption
```bash
sqlite3 database.sqlite "PRAGMA integrity_check;"
```

---

## Conclusion

The School Management System follows a robust architecture with clear separation of concerns:

1. **Security**: RBAC with 4 roles, bcrypt password hashing, session management, audit logging, SQL injection prevention via SYNCABLE_TABLES whitelist
2. **Reliability**: Offline-first SQLite with automatic cloud sync and conflict resolution
3. **Maintainability**: Repository pattern, typed IPC bridges, modular components
4. **Scalability**: Zustand state management, prepared statements, incremental sync
5. **User Experience**: Role-based UI, read-only mode indicators, PDF generation, email automation

All 8 development phases (0-8) are fully implemented. The `FINAL_PLAN.md` document details the completed project finalization tasks.
