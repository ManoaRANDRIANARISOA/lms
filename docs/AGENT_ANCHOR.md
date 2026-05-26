# 🎯 AGENT ANCHOR — Lycée Manjary Soa LMS

> **Ce document est le point d'ancrage pour tout agent IA travaillant sur ce projet.**
> Lire INTÉGRALEMENT avant de coder quoi que ce soit.

---

## 1. CONTEXTE PROJET

**But** : Application backoffice de gestion scolaire pour le Lycée Manjary Soa (Madagascar).
**Stack** : Electron 39 + React 19 + TypeScript 5.9 + Vite (electron-vite) + SQLite (better-sqlite3) + Supabase (cloud sync) + Tailwind CSS 4 + Zustand 5 + Shadcn/ui pattern.
**Capacité** : 1000 élèves, 4 rôles RBAC, 2-4 utilisateurs simultanés, 100% offline-first.
**Livraison** : Mi-mai 2026.

### Architecture
```
Electron Main Process (Node.js)
├── Auth (bcrypt, RBAC, sessions, audit)
├── Database (SQLite + migrations + repositories)
├── IPC Handlers (RBAC-protected CRUD)
├── Services (sync.service.ts → Supabase)
│
Preload Bridge (contextBridge, typed channels)
│
Renderer Process (React + Zustand)
├── Pages (auth, students, finance, attendance, events, settings)
├── Stores (useAuthStore, useStudentStore, useFinanceStore)
├── Components (ui/, shared/, students/, layout/)
```

### Supabase
- **URL** : configuré dans `.env` (SUPABASE_URL + SUPABASE_ANON_KEY)
- **Sync** : bidirectionnel, push/pull toutes les 5 minutes
- **Tables sync** : students, student_fees, student_payments, personnel, grades, cash_journal, parent_events, event_payments, bus_attendance, canteen_attendance, users (sans password_hash)
- **Storage** : bucket `student-photos` pour les photos élèves
- **Conflit** : last-write-wins + server authority pour matricules

---

## 2. STRUCTURE FICHIERS ACTUELLE

```
lms/
├── src/
│   ├── main/                           # Electron Main Process
│   │   ├── index.ts                    # Entry point, IPC registration, protocol handler
│   │   ├── auth/
│   │   │   ├── auth.service.ts         # ✅ Login/logout bcrypt
│   │   │   ├── rbac.service.ts         # ✅ Permission matrix (4 rôles × 11 resources)
│   │   │   ├── session.service.ts      # ✅ Session lifecycle 60min
│   │   │   └── audit.service.ts        # ✅ Audit logging
│   │   ├── database/
│   │   │   ├── db.ts                   # ✅ SQLite init + migrations + schema healing
│   │   │   ├── migrations/
│   │   │   │   ├── 001_init.sql        # ✅ All tables
│   │   │   │   ├── 002_add_parent_details.sql
│   │   │   │   ├── 003_add_class_history.sql
│   │   │   │   ├── 004_add_rbac.sql    # ✅ Sessions + admin seed
│   │   │   │   ├── 005_add_personnel_tables.sql  # ✅ Personnel module tables
│   │   │   │   └── 006_add_daily_attendance.sql  # ✅ Daily attendance + work schedule fields
│   │   │   └── repositories/
│   │   │       ├── student.repository.ts    # ✅ CRUD + re-enrollment + stats
│   │   │       ├── payment.repository.ts    # ✅ CRUD + filters + tuition status
│   │   │       ├── attendance.repository.ts # ✅ Bus/canteen tracking
│   │   │       ├── event.repository.ts      # ✅ Events + participants + payments
│   │   │       ├── settings.repository.ts   # ✅ Key-value store
│   │   │       └── user.repository.ts       # ✅ User CRUD + bcrypt
│   │   ├── ipc/
│   │   │   ├── auth.handler.ts         # ✅ Auth/user management
│   │   │   ├── student.handler.ts      # ✅ Student CRUD
│   │   │   ├── payment.handler.ts      # ✅ Payment operations
│   │   │   ├── attendance.handler.ts   # ✅ Bus/canteen attendance
│   │   │   ├── event.handler.ts        # ✅ Event management
│   │   │   ├── settings.handler.ts     # ✅ Settings get/set
│   │   │   └── dialog.handler.ts       # ✅ Native file dialogs
│   │   └── services/
│   │       └── sync.service.ts         # ✅ Supabase push/pull + conflict resolution
│   │
│   ├── preload/
│   │   ├── index.ts                    # ✅ All IPC channels exposed
│   │   └── index.d.ts                  # ✅ TypeScript declarations
│   │
│   ├── renderer/
│   │   └── src/
│   │       ├── App.tsx                 # ✅ Auth flow + routes + sidebar (inline)
│   │       ├── main.tsx                # ✅ React entry
│   │       ├── env.d.ts                # ✅ Type declarations
│   │       ├── components/
│   │       │   ├── layout/             # ❌ VIDE (layout inline dans App.tsx)
│   │       │   ├── shared/
│   │       │   │   ├── ProtectedRoute.tsx   # ✅
│   │       │   │   └── ReadOnlyBanner.tsx   # ✅
│   │       │   ├── students/
│   │       │   │   ├── FinanceTab.tsx       # ✅ Student finance tab
│   │       │   │   ├── ReEnrollModal.tsx    # ✅ Re-enrollment
│   │       │   │   └── ServiceDashboard.tsx # ✅ Service stats
│   │       │   └── ui/
│   │       │       ├── button.tsx, checkbox.tsx, dialog.tsx
│   │       │       ├── input.tsx, label.tsx, tabs.tsx
│   │       ├── lib/
│   │       │   ├── utils.ts                # ✅ cn() helper
│   │       │   ├── finance-settings.ts     # ✅ Default prices
│   │       │   └── usePermissions.ts       # ✅ Permission hook
│   │       ├── pages/
│   │       │   ├── auth/
│   │       │   │   ├── LoginPage.tsx            # ✅
│   │       │   │   ├── UserManagementPage.tsx   # ✅
│   │       │   │   └── AuditLogPage.tsx         # ✅
│   │       │   ├── students/
│   │       │   │   ├── StudentList.tsx          # ✅
│   │       │   │   ├── StudentForm.tsx          # ✅
│   │       │   │   ├── StudentDetail.tsx        # ✅
│   │       │   │   └── CertificatePage.tsx      # ✅
│   │       │   ├── finance/                     # ❌ VIDE
│   │       │   ├── personnel/                   # ❌ VIDE
│   │       │   ├── grades/                      # ✅ GradeEntry, GradeBook, ReportCardView, GradesPage, SubjectManager
│   │       │   ├── settings/                    # ❌ VIDE
│   │       │   ├── AttendancePage.tsx            # ✅
│   │       │   ├── EventsPage.tsx               # ✅
│   │       │   ├── FinancePage.tsx               # ✅ (KPI overview vide)
│   │       │   └── Settings.tsx                 # ✅
│   │       ├── store/
│   │       │   ├── useAuthStore.ts              # ✅
│   │       │   ├── useStudentStore.ts           # ✅
│   │       │   └── useFinanceStore.ts           # ✅
│   │       ├── styles/                          # ❌ VIDE
│   │       └── types/                           # ❌ VIDE
│   │
│   └── shared/
│       └── types.ts                    # ✅ Cross-process types
│
├── docs/
│   ├── ARCHITECTURE_OVERVIEW.md        # ✅ Documentation complète
│   ├── COMPTES_UTILISATEURS.md         # ✅ Guide comptes
│   ├── RBAC_IMPLEMENTATION_PLAN.md     # ✅ Plan RBAC (terminé)
│   └── SUPABASE_MIGRATION.sql          # ✅ Schema Supabase
├── RBAC_IMPLEMENTATION_TRACKER.md      # ✅ Toutes les phases complétées
├── database.sqlite                     # ✅ Base locale avec données existantes
├── .env                                # ✅ Credentials Supabase configurés
└── package.json                        # ✅ Toutes les deps installées
```

### Fichiers à nettoyer (Phase 0)
```
❌ check_email.js, check_fees.js, debug_fees.js, debug_fees_repro.ts
❌ diag_log.txt, nul, output.txt
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

### ✅ Modules OPÉRATIONNELS
1. **Auth/RBAC/Sessions** — Complet (7 phases, toutes terminées)
2. **Élèves** — CRUD complet + re-enrollment + photo + certificat + sync Supabase
3. **Paiements** — CRUD + journal + filtres + tuition status
4. **Pointage Bus/Cantine** — Enregistrement quotidien + listes abonnés
5. **Événements parents** — CRUD + participants + paiements événementiels
6. **Paramètres** — Configuration tarifs (classes, bus, cantine, uniformes)
7. **User Management** — CRUD admin + reset password
8. **Audit Logs** — Visualisation avec filtres
9. **Cloud Sync** — Push/Pull bidirectionnel Supabase (toutes tables)

### ❌ Modules MANQUANTS

| # | Module | Backend | Frontend | Tables DB |
|---|--------|---------|----------|-----------|
| 1 | **Dashboard** | ✅ Handler + SQL | ✅ DashboardPage | N/A (agrégation) |
| 2 | **Personnel** | ✅ Repo + Handler | ✅ List, Form, Detail | ✅ Existent |
| 3 | **Notes/Bulletins** | ✅ Repo + Handler | ✅ Entry, Book, Report | ✅ Existent |
| 4 | **Journal de Caisse** | ❌ Pas de handler dédié | ❌ Pas de page | ✅ Existe |
| 5 | **Rapports financiers** | ❌ Aucun service | ❌ Pas de page | N/A |
| 6 | **PDF Generation** | ❌ Pas de service | ❌ — | N/A |
| 7 | **Email Automation** | ❌ Pas de service | ❌ — | N/A |

### ⚠️ Faiblesses corrigées ✅
1. ✅ Dashboard = placeholder vide → DashboardPage.tsx fonctionnel avec KPIs
2. ✅ Layout inline dans App.tsx → extrait dans MainLayout.tsx + Sidebar.tsx + ErrorBoundary.tsx
3. ✅ Fichiers debug à la racine → supprimés
4. ✅ `components/layout/` vide → Sidebar.tsx + MainLayout.tsx créés
5. ✅ `styles/` vide → globals.css créé, main.css nettoyé
6. ✅ useStudentStore.ts mode web Supabase direct → supprimé (sécurité + offline)
7. ✅ Conversion booléens push SQLite→PostgreSQL → ajoutée dans sync.service.ts
8. ✅ Settings.tsx ipcRenderer brut → window.api typé
9. ✅ settings.repository.ts sans sync → addToSyncQueue ajouté

### ⚠️ Faiblesses restantes
1. FinancePage onglet "Vue d'ensemble" = KPI cards vides
2. Finance : mélange paiements + config → **séparer en sous-pages** (best practice)
3. Pas de stores Zustand pour attendance, events (personnel ✅, grades ✅)

---

## 5. PLAN D'IMPLÉMENTATION (PHASES)

### Phase 0 : Nettoyage & Consolidation
- [x] Supprimer fichiers debug racine
- [x] Extraire Sidebar → `components/layout/Sidebar.tsx`
- [x] Extraire Layout → `components/layout/MainLayout.tsx`
- [x] Extraire ErrorBoundary → `components/shared/ErrorBoundary.tsx`
- [x] Vérifier imports CSS Tailwind

### Phase 1 : Dashboard fonctionnel
- [x] `src/main/ipc/dashboard.handler.ts` — KPI agrégés (SQL)
- [x] `src/renderer/src/pages/DashboardPage.tsx` — Cards KPI + activité récente
- [x] Preload channel `dashboard:getStats`
- [x] Route dans `MainLayout.tsx`

### Phase 2 : Module Personnel complet
- [x] `repositories/personnel.repository.ts` — CRUD + salary calc hybride (quota/heures pour mensuels)
- [x] `ipc/personnel.handler.ts` — Tous les channels + `daily_attendance` + `createSalaryExpense`
- [x] `pages/personnel/PersonnelList.tsx`
- [x] `pages/personnel/PersonnelForm.tsx` (ajout champs planning: work_pattern, work_days, daily_hours, expected_monthly_hours)
- [x] `pages/personnel/PersonnelDetail.tsx` (onglets: Informations, Pointage, Absences, Salaire)
- [x] `components/personnel/AttendanceCalendar.tsx` (pointage journalier mensuel avec grille + barre de progression)
- [x] `store/usePersonnelStore.ts` (dailyAttendance + createSalaryExpense)
- [x] Preload channels + routes (daily_attendance + salary_expense)
- [x] Sync Supabase (push/pull pour toutes les tables personnel)
- [x] Lien Finance : `createSalaryExpense` → entrée `cash_journal` (dépense salaire)

### Phase 3 : Module Notes & Bulletins
- [x] `repositories/grade.repository.ts` — CRUD + moyennes + classement
- [x] `ipc/grade.handler.ts`
- [x] `pages/grades/GradeEntry.tsx` — Saisie par classe/matière
- [x] `pages/grades/GradeBook.tsx` — Vue par élève/classe
- [x] `pages/grades/ReportCardView.tsx` — Aperçu bulletin
- [x] `store/useGradeStore.ts`
- [x] Preload + routes

### Phase 4 : Finance — Compléter
- [ ] KPI cards dans FinancePage (Vue d'ensemble)
- [ ] `repositories/cashjournal.repository.ts`
- [ ] `ipc/cashjournal.handler.ts`
- [ ] `pages/finance/CashJournalPage.tsx`
- [ ] `pages/finance/PaymentAlerts.tsx`
- [ ] Séparer configuration tarifs en sous-route distincte

### Phase 5 : PDF Generation
- [ ] `services/pdf.service.ts` (jsPDF — déjà installé)
- [ ] Certificat de scolarité, Bulletin, Fiche de paie, Reçu, Bilan journalier
- [ ] Preload channels `pdf:*`

### Phase 6 : Email Automation
- [ ] `services/email.service.ts` (nodemailer — déjà installé)
- [ ] Config SMTP Gmail + envoi automatique 18h
- [ ] `pages/settings/EmailSettings.tsx`

### Phase 7 : Rapports & Export
- [ ] Rapports financiers mensuels
- [ ] Export CSV/Excel
- [ ] Rapports personnel

---

## 6. CONVENTIONS DE CODE & BONNES PRATIQUES

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

### Style & UI
- Tailwind CSS 4 (utility classes)
- Shadcn/ui pattern pour les composants de base
- Couleurs via CSS variables (--primary, --secondary, etc.)
- Responsive : `max-w-7xl mx-auto` pour le contenu
- Tables : `bg-white rounded-lg border shadow-sm`
- Messages : `bg-green-100 text-green-800` (succès), `bg-red-100 text-red-800` (erreur)

### TypeScript
- Types partagés dans `src/shared/types.ts`
- Types frontend-only dans `src/renderer/src/types/`
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
- Toute nouvelle table doit être ajoutée dans `pullRemoteChanges()` array
- Toute mutation doit appeler `addToSyncQueue()`
- Les booleans doivent être convertis (SQLite: 0/1, Supabase: true/false)
- Les JSON arrays sont stockés en TEXT dans SQLite

### Qualité
- Pas de `console.log` en production (utiliser des gardes `isDev`)
- Pas de `any` sauf cas temporaire documenté
- **Types IPC** : `preload/index.d.ts` et `env.d.ts` doivent utiliser les types partagés (`shared/types.ts`), jamais `any` aux frontières IPC
- **Renderer** : utiliser `window.api` directement (typé), jamais `(window as any).api`
- Commenter les décisions d'architecture non évidentes
- Tester le flux complet : créer → lire → modifier → supprimer → sync

---

## 7. TABLES DB EXISTANTES (référence rapide)

### Utilisées par des modules existants
| Table | Module | Repo | Handler |
|-------|--------|------|---------|
| students | Élèves | ✅ | ✅ |
| student_fees | Élèves/Finance | ✅ (dans student) | ✅ |
| student_payments | Finance | ✅ | ✅ |
| bus_attendance | Pointage | ✅ | ✅ |
| canteen_attendance | Pointage | ✅ | ✅ |
| parent_events | Événements | ✅ | ✅ |
| event_payments | Événements | ✅ | ✅ |
| users | Auth | ✅ | ✅ |
| sessions | Auth | ✅ (service) | ✅ |
| settings | Paramètres | ✅ | ✅ |
| audit_logs | Audit | ✅ (service) | ✅ |
| sync_queue | Sync | ✅ (service) | — |
| migrations | DB | ✅ (db.ts) | — |

### Tables implémentées (Module Personnel)
| Table | Module cible | Repo | Handler | Notes |
|-------|-------------|------|---------|-------|
| personnel | Personnel | ✅ | ✅ | CRUD complet + champs planning de travail |
| time_tracking | Personnel | ✅ | ✅ | Fallback legacy si pas de daily_attendance |
| daily_attendance | Personnel | ✅ | ✅ | Pointage journalier (jour × status × heures) |
| personnel_absences | Personnel | ✅ | ✅ | Périodes d'absence (informationnel + impact salaire) |
| salary_advances | Personnel | ✅ | ✅ | Avances sur salaire |
| custom_deductions | Personnel | ✅ | ✅ | Déductions personnalisées mensuelles |
| cash_journal | Finance | ✅ (via Personnel) | ✅ (via Personnel) | Création auto via `createSalaryExpense` |

### Tables en attente
| Table | Module cible | Repo | Handler |
|-------|-------------|------|---------|
| subjects | Notes | ✅ | ✅ |
| grades | Notes | ✅ | ✅ |

---

## 8. FINANCE — BEST PRACTICE ORGANISATION

**Décision** : Séparer le module Finance en sous-pages avec navigation par onglets/routes.

```
/finance                → Vue d'ensemble (KPI cards, graphiques)
/finance/journal        → Suivi des paiements élèves (actuel onglet "Journal")
/finance/caisse         → Journal de caisse (recettes/dépenses école)
/finance/alertes        → Alertes impayés
/finance/configuration  → Configuration tarifs (actuel onglet "Configuration")
```

Cela permet :
- Chaque sous-page a une responsabilité unique
- La configuration est séparée du suivi quotidien
- Le journal de caisse (cash_journal) est distinct des paiements élèves (student_payments)
- Les KPIs ont leur propre espace pour être riches

---

## 9. DONNÉES EXISTANTES

La base SQLite contient déjà des données (élèves, paiements, etc.) synchronisées avec Supabase.
- **Ne PAS supprimer ou recréer** la base de données
- Les nouvelles migrations doivent être **additives** (ALTER TABLE, pas DROP/CREATE)
- Tester avec les données existantes, pas besoin de seed script

---

## 10. CHECKLIST PRÉ-COMMIT

Avant chaque livraison de phase :
- [ ] `npm run typecheck` passe sans erreur
- [ ] `npm run dev` démarre l'app sans crash
- [ ] Les nouvelles fonctionnalités sont testées manuellement
- [ ] Les permissions RBAC sont vérifiées (admin, secretariat, accounting, direction)
- [ ] Les messages UI sont en français
- [ ] Aucun `console.log` superflu
- [ ] Les types sont corrects (pas de `any` injustifié)
- [ ] La sync Supabase fonctionne pour les nouvelles tables

---

*Dernière mise à jour : 26 mai 2026*
*Phase en cours : Phase 4 (Finance — Compléter)*
