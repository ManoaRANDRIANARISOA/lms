# AGENT ANCHOR — Lycée Manjary Soa LMS

> **Ce document est le point d'ancrage pour tout agent IA travaillant sur ce projet.**
> Lire INTÉGRALEMENT avant de coder quoi que ce soit.

---

## 1. CONTEXTE PROJET

**But** : Application backoffice de gestion scolaire pour le Lycée Manjary Soa (Madagascar).
**Stack** : Electron 39 + React 19 + TypeScript 5.9 + Vite (electron-vite) + SQLite (better-sqlite3) + Supabase (cloud sync) + Tailwind CSS 4 + Zustand 5 + Shadcn/ui pattern.
**Capacité** : 1000 élèves, 4 rôles RBAC, 2-4 utilisateurs simultanés, 100% offline-first.
**Livraison** : Juin 2026.

### Architecture
```
Electron Main Process (Node.js)
├── Auth (bcrypt, RBAC, sessions, audit)
├── Database (SQLite + migrations + repositories)
├── IPC Handlers (RBAC-protected CRUD)
├── Services (sync, pdf, email, report, export)
│
Preload Bridge (contextBridge, typed channels)
│
Renderer Process (React + Zustand)
├── Pages (auth, students, finance, attendance, events, grades, personnel, reports, settings)
├── Stores (useAuthStore, useStudentStore, useFinanceStore, usePersonnelStore, useGradeStore, useCashJournalStore)
├── Components (ui/, shared/, students/, personnel/, layout/)
```

### Supabase
- **URL** : configuré dans `.env` (SUPABASE_URL + SUPABASE_ANON_KEY)
- **Sync** : bidirectionnel, push/pull toutes les 5 minutes
- **Tables sync** : students, student_fees, student_payments, personnel, time_tracking, daily_attendance, personnel_absences, salary_advances, custom_deductions, grades, subjects, class_subjects, cash_journal, parent_events, event_payments, bus_attendance, canteen_attendance, users (sans password_hash)
- **Storage** : bucket `student-photos` pour les photos élèves
- **Conflit** : last-write-wins + server authority pour matricules
- **Sécurité** : Whitelist `SYNCABLE_TABLES` dans sync.service.ts pour prévenir les injections SQL

---

## 2. STRUCTURE FICHIERS ACTUELLE

```
lms/
├── src/
│   ├── main/                           # Electron Main Process
│   │   ├── index.ts                    # Entry point, IPC registration, protocol handler
│   │   ├── auth/
│   │   │   ├── auth.service.ts         # Login/logout bcrypt
│   │   │   ├── rbac.service.ts         # Permission matrix (4 rôles × 11 resources)
│   │   │   ├── session.service.ts      # Session lifecycle 60min
│   │   │   └── audit.service.ts        # Audit logging
│   │   ├── database/
│   │   │   ├── db.ts                   # SQLite init + migrations + schema healing
│   │   │   ├── migrations/
│   │   │   │   ├── 001_init.sql
│   │   │   │   ├── 002_add_parent_details.sql
│   │   │   │   ├── 003_add_class_history.sql
│   │   │   │   ├── 004_add_rbac.sql    # Sessions + admin seed
│   │   │   │   ├── 005_add_personnel_tables.sql
│   │   │   │   ├── 006_add_daily_attendance.sql
│   │   │   │   ├── 007_add_soft_delete_to_personnel_related.sql
│   │   │   │   ├── 008_add_deleted_to_grades.sql
│   │   │   │   ├── 009_seed_subjects.sql
│   │   │   │   ├── 010_sync_student_class_from_fees.sql
│   │   │   │   ├── 011_sync_subscriptions_with_payments.sql
│   │   │   │   ├── 012_class_subjects.sql
│   │   │   │   ├── 013_college_lycee_subjects.sql
│   │   │   │   ├── 014_fix_preschool_subjects.sql
│   │   │   │   ├── 015_seed_classes_setting.sql
│   │   │   │   ├── 016_add_department_to_cash_journal.sql
│   │   │   │   ├── 017_add_missing_indexes.sql
│   │   │   │   ├── 018_fix_subject_uuids.sql
│   │   │   │   ├── 019_clean_sync_errors.sql
│   │   │   │   ├── 020_fix_class_subjects_fk.sql
│   │   │   │   └── 021_repair_fees_from_payments.sql
│   │   │   └── repositories/
│   │   │       ├── student.repository.ts
│   │   │       ├── payment.repository.ts
│   │   │       ├── attendance.repository.ts
│   │   │       ├── event.repository.ts
│   │   │       ├── settings.repository.ts
│   │   │       ├── user.repository.ts
│   │   │       ├── personnel.repository.ts
│   │   │       ├── grade.repository.ts
│   │   │       └── cashjournal.repository.ts
│   │   ├── ipc/
│   │   │   ├── auth.handler.ts
│   │   │   ├── student.handler.ts
│   │   │   ├── payment.handler.ts
│   │   │   ├── attendance.handler.ts
│   │   │   ├── event.handler.ts
│   │   │   ├── settings.handler.ts
│   │   │   ├── dialog.handler.ts
│   │   │   ├── personnel.handler.ts
│   │   │   ├── grade.handler.ts
│   │   │   ├── dashboard.handler.ts
│   │   │   ├── cashjournal.handler.ts
│   │   │   ├── pdf.handler.ts
│   │   │   ├── email.handler.ts
│   │   │   └── report.handler.ts
│   │   └── services/
│   │       ├── sync.service.ts         # Supabase push/pull + SYNCABLE_TABLES whitelist
│   │       ├── pdf.service.ts          # jsPDF generation (reçu, certificat, bulletin, fiche paie)
│   │       ├── email.service.ts        # nodemailer SMTP Gmail + scheduler 18h
│   │       ├── report.service.ts       # Rapports financiers, impayés, paie, tuition
│   │       └── export.service.ts       # Export CSV générique
│   │
│   ├── preload/
│   │   ├── index.ts                    # All IPC channels exposed
│   │   └── index.d.ts                  # TypeScript declarations
│   │
│   ├── renderer/
│   │   └── src/
│   │       ├── App.tsx                 # Auth flow + routes
│   │       ├── main.tsx                # React entry
│   │       ├── env.d.ts                # Type declarations
│   │       ├── components/
│   │       │   ├── layout/
│   │       │   │   ├── MainLayout.tsx
│   │       │   │   └── Sidebar.tsx
│   │       │   ├── shared/
│   │       │   │   ├── ErrorBoundary.tsx
│   │       │   │   ├── ProtectedRoute.tsx
│   │       │   │   └── ReadOnlyBanner.tsx
│   │       │   ├── students/
│   │       │   │   ├── FinanceTab.tsx
│   │       │   │   ├── ReEnrollModal.tsx
│   │       │   │   └── ServiceDashboard.tsx
│   │       │   ├── personnel/
│   │       │   │   └── AttendanceCalendar.tsx
│   │       │   └── ui/
│   │       │       ├── button.tsx, checkbox.tsx, dialog.tsx
│   │       │       ├── input.tsx, label.tsx, tabs.tsx
│   │       ├── lib/
│   │       │   ├── utils.ts                # cn() helper
│   │       │   ├── finance-settings.ts     # Default prices
│   │       │   ├── usePermissions.ts       # Permission hook
│   │       │   ├── useClasses.ts           # Shared classes hook
│   │       │   ├── image-utils.ts          # Photo URL helper
│   │       │   ├── store-utils.ts          # Zustand store error helper
│   │       │   └── personnel-constants.ts   # Shared personnel labels
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
│   │       │   │   ├── CashJournalPage.tsx     # Journal de caisse
│   │       │   │   ├── FinanceOverview.tsx     # KPIs finance
│   │       │   │   ├── PaymentAlerts.tsx       # Alertes impayés
│   │       │   │   ├── PaymentJournal.tsx      # Suivi paiements
│   │       │   │   └── FinanceConfig.tsx       # Configuration tarifs
│   │       │   ├── settings/
│   │       │   │   └── EmailSettings.tsx       # Config SMTP
│   │       │   ├── reports/
│   │       │   │   └── ReportsPage.tsx         # Rapports & export
│   │       │   ├── DashboardPage.tsx
│   │       │   ├── AttendancePage.tsx
│   │       │   ├── EventsPage.tsx
│   │       │   ├── FinancePage.tsx             # Wrapper tabs (36 lignes)
│   │       │   └── Settings.tsx
│   │       ├── store/
│   │       │   ├── useAuthStore.ts
│   │       │   ├── useStudentStore.ts
│   │       │   ├── useFinanceStore.ts
│   │       │   ├── usePersonnelStore.ts
│   │       │   ├── useGradeStore.ts
│   │       │   └── useCashJournalStore.ts
│   │       ├── styles/
│   │       │   └── globals.css
│   │       └── types/
│   │
│   └── shared/
│       └── types.ts                    # Cross-process types
│
├── docs/
│   ├── AGENT_ANCHOR.md                 # Ce fichier
│   ├── ARCHITECTURE_OVERVIEW.md        # Documentation architecture
│   ├── COMPTES_UTILISATEURS.md         # Guide comptes utilisateurs
│   └── FINAL_PLAN.md                   # Plan de finition (tâches restantes)
├── database.sqlite
├── .env
└── package.json
```

---

## 3. MATRICE RBAC (4 rôles × 11 resources)

| Resource | admin | secretariat | accounting | direction |
|----------|-------|-------------|------------|-----------|
| students | full | full | read | full |
| payments | full | read | full | full |
| attendance | full | full | read | read |
| grades | full | full | none | read |
| cash_journal | full | none | full | read |
| personnel | full | none | full | read |
| reports | full | none | full | full |
| settings | full | none | none | read |
| users | full | none | none | none |
| audit | full | none | none | read |
| events | full | full | read | full |

- `full` = lecture + écriture (create, update, delete)
- `read` = lecture seule
- `none` = aucun accès (nav item masqué)

---

## 4. ÉTAT D'AVANCEMENT

### Modules OPÉRATIONNELS (tous implémentés)

| # | Module | Backend | Frontend | Tables DB |
|---|--------|---------|----------|-----------|
| 1 | **Auth/RBAC/Sessions** | Complet | LoginPage, UserManagement, AuditLog | users, sessions, audit_logs |
| 2 | **Élèves** | CRUD + re-enrollment + photo + certificat | StudentList/Form/Detail, CertificatePage | students, student_fees |
| 3 | **Paiements** | CRUD + journal + filtres + tuition status | FinancePage (tabs), PaymentJournal | student_payments |
| 4 | **Journal de Caisse** | CRUD + balances | CashJournalPage | cash_journal |
| 5 | **KPIs Finance** | Requêtes agrégées | FinanceOverview | — |
| 6 | **Alertes Impayés** | Endpoint optimisé (JOIN) | PaymentAlerts | — |
| 7 | **Configuration Tarifs** | Settings CRUD | FinanceConfig | settings |
| 8 | **Pointage Bus/Cantine** | Enregistrement quotidien | AttendancePage | bus_attendance, canteen_attendance |
| 9 | **Événements parents** | CRUD + participants + paiements | EventsPage | parent_events, event_payments |
| 10 | **Paramètres** | Key-value store | Settings.tsx | settings |
| 11 | **User Management** | CRUD admin + reset password | UserManagementPage | users |
| 12 | **Audit Logs** | Visualisation avec filtres | AuditLogPage | audit_logs |
| 13 | **Cloud Sync** | Push/Pull bidirectionnel + whitelist | — | sync_queue |
| 14 | **Dashboard** | KPIs SQL agrégés | DashboardPage | — |
| 15 | **Personnel** | CRUD + pointage + salaire hybride | PersonnelList/Form/Detail, AttendanceCalendar | personnel, time_tracking, daily_attendance, personnel_absences, salary_advances, custom_deductions |
| 16 | **Notes/Bulletins** | CRUD subjects/grades + moyennes + classement | GradesPage, GradeEntry, GradeBook, ReportCardView, SubjectManager | subjects, grades, class_subjects |
| 17 | **PDF Generation** | jsPDF (reçu, certificat, bulletin, fiche paie, bilan) | Boutons dans pages existantes | — |
| 18 | **Email Automation** | nodemailer SMTP + scheduler 18h | EmailSettings | — |
| 19 | **Rapports & Export** | 4 types de rapports + CSV | ReportsPage | — |

### Corrections de sécurité appliquées

1. SQL Injection : whitelist `SYNCABLE_TABLES` dans sync.service.ts
2. Path traversal : validation du répertoire dans pdf:openFile
3. Hard delete → soft-delete au démarrage dans db.ts
4. N+1 query → endpoint `getUnpaidAlerts` optimisé (JOIN unique)
5. `sanitizeFilename` + pagination PDF corrigée
6. `logAction` dans 8 handlers personnel.handler.ts

---

## 5. CONVENTIONS DE CODE & BONNES PRATIQUES

### Architecture pattern
```
Nouvelle fonctionnalité = Repository + Handler + Preload + Store + Page
```

1. **Repository** (`src/main/database/repositories/xxx.repository.ts`)
   - Classe statique ou fonctions exportées
   - Utiliser `db.prepare()` avec paramètres (jamais de concaténation SQL)
   - Toujours soft-delete (`deleted = 1`, jamais DELETE)
   - Ajouter `sync_status = 'pending'` sur chaque mutation
   - Appeler `addToSyncQueue()` après chaque write

2. **IPC Handler** (`src/main/ipc/xxx.handler.ts`)
   - Pattern : `registerXxxHandlers()` exporté et appelé dans `index.ts`
   - Chaque handler : RBAC check → Repository call → Audit log → Return
   - Messages d'erreur en **français**
   - Format retour : `{ success: boolean, data?: T, error?: string }`

3. **Preload** (`src/preload/index.ts` + `index.d.ts`)
   - Ajouter le namespace dans l'objet `api`
   - Mettre à jour les types dans `index.d.ts`

4. **Zustand Store** (`src/renderer/src/store/useXxxStore.ts`)
   - État : données + loading + error
   - Actions : fetch, create, update, delete
   - Appels via `window.api.xxx.*` (jamais d'import IPC direct)

5. **Page** (`src/renderer/src/pages/xxx/XxxPage.tsx`)
   - Composant fonctionnel React
   - Utiliser le store pour l'état
   - `ReadOnlyBanner` pour RBAC read-only
   - UI en **français** (labels, messages, placeholders)

### Classes — Source unique de vérité
**IMPORTANT** : Les classes sont centralisées dans la table `settings` sous la clé `classes` (JSON array).
- **Hook** : `src/renderer/src/lib/useClasses.ts` — tous les modules doivent l'utiliser
- **Settings** : `Settings.tsx` → section "Gestion des Classes"
- **NE JAMAIS** hardcoder une liste de classes dans un composant
- **NE JAMAIS** utiliser `prices.classes` pour autre chose que les tarifs de tuition

### Style & UI
- Tailwind CSS 4 (utility classes)
- Shadcn/ui pattern pour les composants de base
- Couleurs via CSS variables (--primary, --secondary, etc.)
- Responsive : `max-w-7xl mx-auto` pour le contenu
- Tables : `bg-white rounded-lg border shadow-sm`
- Messages : `bg-green-100 text-green-800` (succès), `bg-red-100 text-red-800` (erreur)

### TypeScript
- Types partagés dans `src/shared/types.ts`
- Toujours typer les retours IPC (pas de `any` en production)
- Interfaces pour les props de composants

### Nommage
- Fichiers : `camelCase.ts` pour les modules, `PascalCase.tsx` pour les composants
- Variables/fonctions : `camelCase`
- Types/Interfaces : `PascalCase`
- Tables DB : `snake_case`
- IPC channels : `namespace:action` (ex: `personnel:create`)
- Constantes : `UPPER_SNAKE_CASE`

### Sécurité
- Bcrypt cost factor 10 pour les mots de passe
- Ne JAMAIS push `password_hash` vers Supabase
- Prepared statements exclusivement (pas de SQL dynamique)
- RBAC check côté backend (pas seulement frontend)
- Audit log pour toutes les actions d'écriture

### Sync Supabase
- Toute nouvelle table doit être ajoutée dans `pullRemoteChanges()` array ET dans `SYNCABLE_TABLES`
- Toute mutation doit appeler `addToSyncQueue()`
- Les booleans doivent être convertis (SQLite: 0/1, Supabase: true/false)
- Les JSON arrays sont stockés en TEXT dans SQLite
- **CRITIQUE (Schema Sync)** : Toute modification de schéma via `migrations/*.sql` en local SQLite *doit* impérativement s'accompagner d'un script SQL PostgeSQL fourni à l'utilisateur, qu'il devra exécuter dans son Dashboard Supabase. Sinon, le service plantera silencieusement en arrière-plan.

### Qualité
- Pas de `console.log` en production (utiliser des gardes `isDev`)
- Pas de `any` sauf cas temporaire documenté
- **Types IPC** : `preload/index.d.ts` et `env.d.ts` doivent utiliser les types partagés (`shared/types.ts`), jamais `any` aux frontières IPC
- **Renderer** : utiliser `window.api` directement (typé), jamais `(window as any).api`
- Tester le flux complet : créer → lire → modifier → supprimer → sync

---

## 6. TABLES DB EXISTANTES

### Tables principales
| Table | Module | Repo | Handler |
|-------|--------|------|---------|
| students | Élèves | student.repository | student.handler |
| student_fees | Élèves/Finance | student.repository | student.handler |
| student_payments | Finance | payment.repository | payment.handler |
| bus_attendance | Pointage | attendance.repository | attendance.handler |
| canteen_attendance | Pointage | attendance.repository | attendance.handler |
| parent_events | Événements | event.repository | event.handler |
| event_payments | Événements | event.repository | event.handler |
| users | Auth | user.repository | auth.handler |
| sessions | Auth | session.service | auth.handler |
| settings | Paramètres | settings.repository | settings.handler |
| audit_logs | Audit | audit.service | auth.handler |
| sync_queue | Sync | sync.service | — |
| migrations | DB | db.ts | — |

### Tables Personnel
| Table | Repo | Handler |
|-------|------|---------|
| personnel | personnel.repository | personnel.handler |
| time_tracking | personnel.repository | personnel.handler |
| daily_attendance | personnel.repository | personnel.handler |
| personnel_absences | personnel.repository | personnel.handler |
| salary_advances | personnel.repository | personnel.handler |
| custom_deductions | personnel.repository | personnel.handler |
| cash_journal | cashjournal.repository | cashjournal.handler |

### Tables Notes & Bulletins
| Table | Repo | Handler |
|-------|------|---------|
| subjects | grade.repository | grade.handler |
| grades | grade.repository | grade.handler |
| class_subjects | grade.repository | grade.handler |

### Migrations (28 au total)
| # | Nom | Contenu |
|---|-----|---------|
| 001 | init.sql | Tables de base |
| 002 | add_parent_details.sql | Colonnes parents |
| 003 | add_class_history.sql | Historique classes |
| 004 | add_rbac.sql | Sessions + admin seed |
| 005 | add_personnel_tables.sql | Tables personnel |
| 006 | add_daily_attendance.sql | Pointage journalier |
| 007 | add_soft_delete_to_personnel_related.sql | Colonne deleted |
| 008 | add_deleted_to_grades.sql | Soft-delete grades |
| 009 | seed_subjects.sql | Matières par défaut |
| 010 | sync_student_class_from_fees.sql | Sync classe |
| 011 | sync_subscriptions_with_payments.sql | Sync bus/cantine flags |
| 012 | class_subjects.sql | Matières par classe |
| 013 | college_lycee_subjects.sql | Seed collège/lycée |
| 014 | fix_preschool_subjects.sql | Fix FK order |
| 015 | seed_classes_setting.sql | Seed setting classes |
| 016 | add_department_to_cash_journal.sql | Colonne department |
| 017 | add_missing_indexes.sql | Index sur 6 clés étrangères |
| 018 | fix_subject_uuids.sql | Fix subject UUID references |
| 019 | clean_sync_errors.sql | Nettoyage des erreurs de synchro |
| 020 | fix_class_subjects_fk.sql | Clés étrangères class_subjects |
| 021 | repair_fees_from_payments.sql | Réparer les frais depuis les paiements |
| 022 | add_journalier_exam_grades.sql | Ajout des sous-notes |
| 023 | add_personnel_cnaps_amounts.sql | Ajout montants CNaPS/IRSA |
| 024 | add_student_gender.sql | Ajout du genre M/F |
| 025 | add_assessments_table.sql | Table des évaluations/trimestres |
| 026 | add_uniform_items.sql | Uniformes dynamiques JSON |
| 026 | add_parent_personnel_id.sql | Colonne parent_personnel_id pour les enfants du personnel |
| 027 | add_personnel_child.sql | Identification des enfants du personnel (discount) |


---

## 7. FINANCE — ORGANISATION

Le module Finance est organisé en sous-pages avec navigation par onglets dans `FinancePage.tsx` (wrapper) :

```
/finance                → FinancePage (tabs wrapper)
  ├── Onglet "Vue d'ensemble"    → FinanceOverview.tsx (KPIs)
  ├── Onglet "Suivi Global"      → PaymentJournal.tsx (paiements élèves)
  └── Onglet "Configuration"     → FinanceConfig.tsx (tarifs)

/finance/caisse         → CashJournalPage.tsx (via sidebar)
/finance/alertes        → PaymentAlerts.tsx (via sidebar)
```

---

## 8. DONNÉES EXISTANTES

La base SQLite contient déjà des données (élèves, paiements, etc.) synchronisées avec Supabase.
- **Ne PAS supprimer ou recréer** la base de données
- Les nouvelles migrations doivent être **additives** (ALTER TABLE, pas DROP/CREATE)
- Tester avec les données existantes, pas besoin de seed script

---

## 9. CHECKLIST PRÉ-COMMIT

Avant chaque livraison :
- [ ] **Proactive Questions Asked**: Any ambiguities about business requirements or codebase impacts have been clarified with the user before coding.
- [ ] `npm run lint` passe sans erreur (0 erreur de syntaxe ou formatage)
- [ ] `npm run typecheck` passe sans erreur (0 erreur TypeScript dans le Node/Main et React/Renderer process)
- [ ] `npm run build` réussit sans aucune erreur (vérification du bundle de production Electron + Vite)
- [ ] `npm run dev` démarre l'app sans crash ni avertissement bloquant
- [ ] Les nouvelles fonctionnalités sont testées manuellement
- [ ] Les permissions RBAC sont vérifiées (admin, secretariat, accounting, direction)
- [ ] Les messages UI sont en français
- [ ] Aucun `console.log` superflu
- [ ] Les types sont corrects (pas de `any` injustifié)
- [ ] La sync Supabase fonctionne pour les nouvelles tables (remonter les requêtes SQL équivalentes à l'utilisateur)

---

## 10. TÂCHES RESTANTES

Voir `docs/FINAL_PLAN.md` pour le plan de finition détaillé avec toutes les corrections restantes à effectuer (RBAC frontend, audit logs, bugs, types, DRY, documentation).

---

*Dernière mise à jour : 17 juin 2026*
*État : Toutes les phases (0-8) implémentées. Intégration récente de la gestion des fratries, des réductions pour enfants de personnel, et des uniformes dynamiques finalisée et vérifiée sans erreur.*
