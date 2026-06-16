# Plan de Finition Définitif — Lycée Manjary Soa LMS

> **Date** : 1er juin 2026
> **Version** : Finale consolidée (Qwen + Opus + Gemini + décisions client)
> **Objectif** : Amener le projet à un état production-ready.
> **Périmètre** : Sécurité, RBAC, bugs, types, DRY, nettoyage, documentation. **Aucune nouvelle fonctionnalité.**

---

## Table des matières

- [Contexte](#contexte)
- [Décisions validées par le client](#décisions-validées-par-le-client)
- [État actuel du codebase](#état-actuel-du-codebase)
- [Phase 1 : Sécurité RBAC Frontend](#phase-1--sécurité-rbac-frontend)
- [Phase 2 : Audit logs manquants](#phase-2--audit-logs-manquants)
- [Phase 3 : Bugs fonctionnels](#phase-3--bugs-fonctionnels)
- [Phase 4 : Migration index SQL](#phase-4--migration-index-sql)
- [Phase 5 : Nettoyage types any](#phase-5--nettoyage-types-any)
- [Phase 6 : DRY — Élimination code dupliqué](#phase-6--dry--élimination-code-dupliqué)
- [Phase 7 : Nettoyage code mort et warnings](#phase-7--nettoyage-code-mort-et-warnings)
- [Phase 8 : Mise à jour documentation](#phase-8--mise-à-jour-documentation)
- [Vérification finale](#vérification-finale)
- [Annexe A : Fichiers à créer](#annexe-a--fichiers-à-créer)
- [Annexe B : Fichiers à modifier](#annexe-b--fichiers-à-modifier)
- [Annexe C : Points de vigilance futurs](#annexe-c--points-de-vigilance-futurs)

---

## Contexte

Le projet LMS du Lycée Manjary Soa est un backoffice de gestion scolaire construit avec **Electron 39 + React 19 + TypeScript 5.9 + SQLite (better-sqlite3) + Supabase + Tailwind CSS 4 + Zustand 5**.

Le développement a suivi 7 phases (0 à 7), toutes implémentées dans le code. Quatre agents IA ont travaillé dessus :

| Agent | Contribution | État |
|-------|-------------|------|
| **Mimo** | Développement initial (Phases 0-3) : Auth, Élèves, Personnel, Notes, Dashboard, Sync | ✅ Terminé |
| **Opus** | Audit + Plan détaillé (Phases 3.5-7) : architecture, Finance, PDF, Email, Reports | ✅ Plan rédigé |
| **Qwen** | Audit de finition exhaustif (9 étapes, ~210 any, RBAC, bugs, DRY, docs) | ✅ Plan rédigé (`FINITION_PLAN.md`) |
| **Gemini** | Exécution partielle du plan Qwen : sécurité P0, N+1, Receipt, Report fixes | ✅ Partiellement exécuté |

### Ce qui est DÉJÀ corrigé dans le code (par Gemini)

| Correction | Fichier | Vérifié |
|---|---|---|
| SQL Injection : whitelist `SYNCABLE_TABLES` | `sync.service.ts` (L61-80) | ✅ |
| Path traversal : validation répertoire dans `pdf:openFile` | `pdf.handler.ts` (L114-123) | ✅ |
| Hard delete → soft-delete au démarrage | `db.ts` (L181-187) | ✅ |
| N+1 query → endpoint `getUnpaidAlerts` optimisé | `PaymentAlerts.tsx` (L37) + `payment.repository.ts` | ✅ |
| Bouton Reçu PDF fonctionnel | `PaymentJournal.tsx` (L68-91, L237) | ✅ |
| `report.service.ts` : `schoolYear` filtré dans WHERE | `report.service.ts` (L52, L128) | ✅ |
| `personnel:debug` IPC channel supprimé | `preload/index.ts` + `personnel.handler.ts` | ✅ |
| `FinancePage.tsx` refactorisé en wrapper (36 lignes) | `FinancePage.tsx` | ✅ |
| `console.log` debug nettoyés dans sync.service | `sync.service.ts` | ✅ |
| `sanitizeFilename` + pagination PDF corrigée | `pdf.service.ts` (L49-56, L197-206, L258-264) | ✅ |
| `logAction` ajouté dans 8 handlers personnel | `personnel.handler.ts` (create, update, delete, absences, advances, deductions, attendance, salary) | ✅ |
| Fichier `nul` supprimé | racine `lms/` | ✅ |

---

## Décisions validées par le client

| Question | Décision | Raison |
|----------|----------|--------|
| CashJournalPage comme onglet dans FinancePage ? | **Non** — uniquement via le menu latéral | Évite la surcharge de l'écran Finance |
| Découpe des composants monolithiques (StudentForm 800+, FinanceTab 700+, PersonnelDetail 660+) ? | **Reporter** — après cette phase de finition | Priorité sécurité/bugs/types d'abord, risque de régression sur les formulaires |
| Chiffrement AES-256 du mot de passe SMTP ? | **Non** — stockage en clair acceptable | Usage interne, machine locale, risque faible |
| Désinstaller `@tanstack/react-query` (inutilisé) ? | **Non** — garder pour usage futur | Pourrait servir pour le cache/refresh automatique |
| Garder `tailwind.config.js` (Tailwind v4 ne l'utilise plus nativement) ? | **Oui** — garder | Autocomplétion des classes dans VS Code |
| Bouton User orphelin dans StudentList ? | **Câbler** → naviguer vers détail élève | Fonctionnalité attendue, simple à implémenter |
| Factorisations backend (attendance, audit, personnel sanitization) ? | **Inclure** dans ce plan | Corrections simples, réduisent le risque de bugs futurs |
| Types `any` dans les repositories (~96) ? | **Corriger tous** | Cohérence de typage sur tout le projet |
| Taux de recouvrement dans FinanceOverview ? | **Endpoint backend** `SUM(monthly_tuition)` | Calcul précis basé sur les frais réels des élèves inscrits |
| Scheduler email fragile ? | **Flag `lastSentDate`** dans settings | Robuste : vérifie `hours >= 18 && lastSent !== today` |
| Conflit `ElectronAPI` + imports inutilisés dans .d.ts ? | **Corriger** | Qualité du typage aux frontières IPC |
| Types `any` dans le frontend (~30) ? | **Corriger** | Cohérence complète du typage |

---

## État actuel du codebase

### Problèmes restants à corriger

| Catégorie | Nombre | Sévérité |
|-----------|--------|----------|
| RBAC frontend manquant (`canWrite` absent) | 4 composants | **P0 — Sécurité** |
| `ReadOnlyBanner` manquants | 7 pages | **P1 — UX** |
| Audit logs manquants | 7 handlers (5 personnel + 2 email) | **P1 — Traçabilité** |
| Bugs fonctionnels | 7 | **P1** |
| Index SQL manquants | 6 tables | **P1 — Performance** |
| Types `any` (stores + handlers + repos + frontend) | ~210 | **P1 — Maintenabilité** |
| Conflit de typage `ElectronAPI` | 1 fichier | **P1** |
| Code dupliqué (DRY) | 6 patterns | **P2** |
| `console.error` non-wrappés dans DEV | 18 occurrences / 11 fichiers | **P2** |
| Documentation désynchronisée | 4 fichiers | **P1** |

---

## Phase 1 : Sécurité RBAC Frontend

> **Raison** : Plusieurs pages permettent des actions d'écriture à des rôles qui n'ont que `read` dans la matrice RBAC. C'est un contournement de sécurité côté UI — le backend bloque déjà, mais l'UX doit aussi refléter les permissions.

### 1.1 — RBAC dans FinanceTab.tsx

- **Fichier** : `src/renderer/src/components/students/FinanceTab.tsx`
- **Problème** : Aucun check `canWrite('payments')`. Les boutons d'enregistrement de paiement (cartes services, grille mensuelle, formulaire) sont accessibles à **tous les utilisateurs**, y compris ceux en lecture seule.
- **Matrice RBAC** : `accounting` a `read` sur `students` mais `full` sur `payments`. `direction` a `read` sur `payments`. Un utilisateur `direction` accédant au détail d'un élève ne devrait pas pouvoir enregistrer de paiement.
- **Action** :
  1. Importer `usePermissions` depuis `@/lib/usePermissions`
  2. Récupérer `const { canWrite } = usePermissions()`
  3. Désactiver le bouton "Enregistrer un paiement" si `!canWrite('payments')`
  4. Désactiver les inputs du formulaire de paiement si `!canWrite('payments')`
  5. Ajouter un `title="Accès refusé"` sur les boutons désactivés

### 1.2 — RBAC dans CashJournalPage.tsx

- **Fichier** : `src/renderer/src/pages/finance/CashJournalPage.tsx`
- **Problème** : Le `ReadOnlyBanner` est affiché (L138), mais les boutons d'action ne sont **pas désactivés** en mode lecture seule :
  - Bouton "Nouvelle entrée" (L144) — toujours visible et actif
  - Bouton "Enregistrer" dans le formulaire (L311) — toujours actif
  - Bouton "Supprimer" sur chaque ligne (L442) — toujours actif
- **Matrice RBAC** : `direction` a `read` sur `cash_journal`, `secretariat` a `none`.
- **Action** :
  1. Importer `usePermissions`
  2. Masquer le bouton "Nouvelle entrée" si `!canWrite('cash_journal')`
  3. Désactiver le bouton "Supprimer" si `!canWrite('cash_journal')`
  4. Désactiver le formulaire d'édition si `!canWrite('cash_journal')`

### 1.3 — RBAC dans FinanceConfig.tsx

- **Fichier** : `src/renderer/src/pages/finance/FinanceConfig.tsx`
- **Problème** : Aucun `ReadOnlyBanner` ni `canWrite`. Le bouton "Enregistrer" (L176) est visible et actif pour tous. La configuration des tarifs est une opération sensible (ressource `settings`) restreinte à `admin` uniquement selon la matrice RBAC.
- **Action** :
  1. Ajouter `<ReadOnlyBanner resource="settings" />` en haut du composant
  2. Wrapper le bouton "Enregistrer" avec `canWrite('settings')`

### 1.4 — RBAC dans EmailSettings.tsx

- **Fichier** : `src/renderer/src/pages/settings/EmailSettings.tsx`
- **Problème** : Aucun `ReadOnlyBanner` ni `canWrite`. Les boutons "Enregistrer" (L203) et "Tester" (L206) sont accessibles à tous. La configuration SMTP contient des credentials sensibles.
- **Action** :
  1. Ajouter `<ReadOnlyBanner resource="settings" />`
  2. Wrapper les boutons avec `canWrite('settings')`

### 1.5 — ReadOnlyBanner manquants sur 7 pages

> **Raison** : L'utilisateur en mode lecture seule ne sait pas qu'il ne peut pas modifier les données. Le banner indique visuellement le mode consultation.

| Page | Fichier | Ressource RBAC |
|------|---------|----------------|
| Carnet de notes | `src/renderer/src/pages/grades/GradeBook.tsx` | `grades` |
| Bulletin | `src/renderer/src/pages/grades/ReportCardView.tsx` | `grades` |
| Journal paiements | `src/renderer/src/pages/finance/PaymentJournal.tsx` | `payments` |
| Alertes impayés | `src/renderer/src/pages/finance/PaymentAlerts.tsx` | `payments` |
| Vue d'ensemble finance | `src/renderer/src/pages/finance/FinanceOverview.tsx` | `payments` |
| Rapports | `src/renderer/src/pages/reports/ReportsPage.tsx` | `reports` |
| Config tarifs | `src/renderer/src/pages/finance/FinanceConfig.tsx` | `settings` |

**Action pour chaque page** :
```tsx
import ReadOnlyBanner from '../../components/shared/ReadOnlyBanner'
// En haut du JSX, avant le contenu :
<ReadOnlyBanner resource="grades" />
```

---

## Phase 2 : Audit logs manquants

> **Raison** : Des opérations d'écriture sensibles ne sont pas tracées dans le journal d'audit, rendant impossible la traçabilité pour l'administration.

### 2.1 — 5 mutations sans audit dans personnel.handler.ts

- **Fichier** : `src/main/ipc/personnel.handler.ts`
- **Constat** : 8 handlers sur 21 ont déjà `logAction` (ajoutés par Gemini). **5 mutations** en manquent encore :

| Handler | Ligne | Action non tracée |
|---------|-------|-------------------|
| `personnel:setTimeTracking` | L126 | Modification du suivi horaire mensuel |
| `personnel:deleteAbsence` | L184 | Suppression d'une absence |
| `personnel:markAdvanceRepaid` | L229 | Marquage d'une avance comme remboursée |
| `personnel:deleteDeduction` | L274 | Suppression d'une déduction personnalisée |
| `personnel:deleteAttendance` | L319 | Suppression d'un pointage journalier |

**Action** : Pour chaque handler, ajouter après l'opération réussie :
```typescript
if (result.success) {
  const currentUser = getCurrentUser()
  logAction(currentUser?.id, 'update', 'personnel', personnelId, null, JSON.stringify(data))
}
```

### 2.2 — 0 audit log dans email.handler.ts

- **Fichier** : `src/main/ipc/email.handler.ts`
- **Constat** : 6 handlers, **aucun** `logAction`.
- **Handlers à tracer** :
  - `email:configure` (L14) — modification de la config SMTP (credentials sensibles)
  - `email:sendNow` (L28) — envoi d'email

**Action** :
```typescript
// Pour email:configure
logAction(currentUser?.id, 'update', 'settings', 'email_config', null, 'Configuration SMTP modifiée')

// Pour email:sendNow
logAction(currentUser?.id, 'create', 'reports', null, null, `Email envoyé à ${to}`)
```

---

## Phase 3 : Bugs fonctionnels

> **Raison** : Ces bugs affectent l'exactitude des données, l'ergonomie, ou la robustesse de l'application.

### 3.1 — Taux de recouvrement faux dans FinanceOverview

- **Fichier** : `src/renderer/src/pages/finance/FinanceOverview.tsx` (L27)
- **Bug** : `const expected = totalStudents * 10` — la valeur `10` est arbitraire. Le calcul ne tient pas compte du tarif réel par classe ni du nombre de mois écoulés.
- **Correction** :
  1. **Backend** — Ajouter dans `payment.repository.ts` une méthode `getExpectedRevenue(schoolYear)` :
     ```sql
     SELECT COALESCE(SUM(sf.monthly_tuition), 0) as expected
     FROM student_fees sf
     JOIN students s ON s.id = sf.student_id
     WHERE sf.school_year = ? AND s.deleted = 0 AND s.active = 1 AND sf.deleted = 0
     ```
  2. **Handler** — Ajouter `payment:getExpectedRevenue` dans `payment.handler.ts` avec RBAC `canRead('payments')`
  3. **Preload** — Exposer `payment.getExpectedRevenue` dans `preload/index.ts`, `index.d.ts`, `env.d.ts`
  4. **Frontend** — Dans `FinanceOverview.tsx`, remplacer `totalStudents * 10` par l'appel à `window.api.payment.getExpectedRevenue(schoolYear)`

### 3.2 — schoolYear hardcodé dans ReportsPage

- **Fichier** : `src/renderer/src/pages/reports/ReportsPage.tsx` (L27)
- **Bug** : `useState('2025-2026')` — sera obsolète en septembre 2026.
- **Correction** : Calculer dynamiquement :
  ```typescript
  const now = new Date()
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  const [schoolYear, setSchoolYear] = useState(`${year}-${year + 1}`)
  ```

### 3.3 — defaultCat ternaire inutile dans CashJournalPage

- **Fichier** : `src/renderer/src/pages/finance/CashJournalPage.tsx` (L257)
- **Bug** : `const defaultCat = newDept === 'bus' ? 'entretien' : 'entretien'` — deux branches identiques.
- **Correction** : `const defaultCat = newDept === 'bus' ? 'carburant' : 'fournitures'`

### 3.4 — Fonction morte cleanupSessions()

- **Fichier** : `src/main/auth/auth.service.ts` (L190-192)
- **Bug** : `cleanupSessions()` est exportée mais **jamais appelée** dans tout le codebase.
- **Correction** : Supprimer la fonction.

### 3.5 — Bouton User sans onClick dans StudentList

- **Fichier** : `src/renderer/src/pages/students/StudentList.tsx` (L190-192)
- **Bug** : `<Button variant="ghost" size="sm"><User /></Button>` — aucun `onClick`.
- **Correction** : Câbler vers la navigation détail élève :
  ```tsx
  <Button variant="ghost" size="sm" onClick={() => navigate(`/students/${student.id}`)}>
    <User className="w-4 h-4" />
  </Button>
  ```
  (Importer `useNavigate` de `react-router-dom` si pas déjà fait.)

### 3.6 — Scheduler email fragile

- **Fichier** : `src/main/services/email.service.ts` (L181-188)
- **Bug** : `getHours() === 18 && getMinutes() === 0` — si le `setInterval` de 60s ne tombe pas exactement sur minute=0, l'envoi est manqué. Si l'app redémarre à 18:00, l'envoi peut être doublé.
- **Correction** :
  1. Stocker la date du dernier envoi dans `settings` (clé `email_last_sent_date`)
  2. Remplacer la vérification par :
     ```typescript
     const now = new Date()
     if (now.getHours() >= 18) {
       const today = now.toISOString().split('T')[0]
       const lastSent = getEmailLastSentDate() // lit depuis settings
       if (lastSent !== today) {
         await sendDailyReport(...)
         setEmailLastSentDate(today) // sauvegarde dans settings
       }
     }
     ```

### 3.7 — try/catch manquants dans report.service.ts

- **Fichier** : `src/main/services/report.service.ts`
- **Bug** : Aucune des 4 méthodes n'a de try/catch. Les erreurs SQL remontent brutes au handler.
- **Correction** : Wrapper chaque méthode dans un try/catch avec message d'erreur en français :
  ```typescript
  try {
    // requête SQL
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Erreur lors de la génération du rapport : ${message}`)
  }
  ```

---

## Phase 4 : Migration index SQL

> **Raison** : Performance — les JOINs sur les clés étrangères sans index sont lents avec 1000 élèves.

### 4.1 — Créer migration 017_add_missing_indexes.sql

- **Fichier** : `src/main/database/migrations/017_add_missing_indexes.sql` (NOUVEAU)
- **Contenu** :
  ```sql
  CREATE INDEX IF NOT EXISTS idx_student_fees_student_id ON student_fees(student_id);
  CREATE INDEX IF NOT EXISTS idx_event_payments_event_id ON event_payments(event_id);
  CREATE INDEX IF NOT EXISTS idx_event_payments_student_id ON event_payments(student_id);
  CREATE INDEX IF NOT EXISTS idx_personnel_absences_personnel_id ON personnel_absences(personnel_id);
  CREATE INDEX IF NOT EXISTS idx_salary_advances_personnel_id ON salary_advances(personnel_id);
  CREATE INDEX IF NOT EXISTS idx_custom_deductions_personnel_id ON custom_deductions(personnel_id);
  ```

### 4.2 — Enregistrer dans db.ts

- **Fichier** : `src/main/database/db.ts`
- **Action** : Ajouter `'017_add_missing_indexes.sql'` dans le tableau `migrations` (après `'016_add_department_to_cash_journal.sql'`).

---

## Phase 5 : Nettoyage types `any`

> **Raison** : ~210 `any` dans le codebase compromettent la sécurité de type et masquent des bugs potentiels. Les `any` aux frontières IPC (params de handlers, types de stores) sont les plus critiques.

### 5.1 — Stores Zustand (priorité haute)

| Fichier | `any` à corriger | Types à utiliser (depuis `shared/types.ts`) |
|---------|-----------------|---------------------------------------------|
| `store/useStudentStore.ts` | `currentFees: any`, `currentPayments: any[]`, `filters?: any`, `catch (error: any)` × 5 | `FeeRecord`, `Payment[]`, `StudentFilters`, `catch (error: unknown)` |
| `store/usePersonnelStore.ts` | `timeTracking: any[]`, `absences: any[]`, `advances: any[]`, `deductions: any[]`, `dailyAttendance: any[]`, `data: any` × 5, `catch (error: any)` × 15 | `TimeTracking[]`, `PersonnelAbsence[]`, `SalaryAdvance[]`, `CustomDeduction[]`, `DailyAttendance[]`, types d'entrée, `catch (error: unknown)` |
| `store/useGradeStore.ts` | `createGrade: (data: any)`, `updateGrade: (id, data: any)`, `catch (error: any)` × 13 | `GradeInput`, `catch (error: unknown)` |

**Pattern de correction** :
```typescript
// AVANT
currentFees: any | null
fetchStudents: (filters?: any) => Promise<void>
catch (error: any) { ... }

// APRÈS
currentFees: FeeRecord | null
fetchStudents: (filters?: StudentFilters) => Promise<void>
catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  ...
}
```

### 5.2 — Handlers IPC (priorité haute)

| Fichier | `any` count | Pattern de correction |
|---------|-------------|----------------------|
| `ipc/personnel.handler.ts` | 28 | `data: any` → `Partial<Personnel>`, `DailyAttendance`, etc. + `catch (error: any)` → `catch (error: unknown)` |
| `ipc/grade.handler.ts` | 24 | `data: any` → `GradeInput`/`SubjectInput`/`ClassSubjectPayload` + `catch (error: any)` → `catch (error: unknown)` |
| `ipc/auth.handler.ts` | 2 | `catch (e: any)` → `catch (e: unknown)` |
| `ipc/settings.handler.ts` | 1 | `value: any` → `value: unknown` |
| `ipc/dashboard.handler.ts` | 1 | `catch` → `catch (error: unknown)` |

**Pattern catch** :
```typescript
// AVANT
catch (error: any) {
  return { success: false, error: error.message }
}

// APRÈS
catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return { success: false, error: message }
}
```

### 5.3 — Repositories (priorité moyenne)

| Fichier | `any` count | Notes |
|---------|-------------|-------|
| `student.repository.ts` | 24 | Params de fonctions + résultats de `db.prepare().all()` |
| `personnel.repository.ts` | 21 | Params + résultats DB |
| `grade.repository.ts` | 16 | Params + résultats DB |
| `user.repository.ts` | 11 | Params + résultats DB |
| `event.repository.ts` | 9 | Params + résultats DB |
| `payment.repository.ts` | 7 | Params + résultats DB |
| `settings.repository.ts` | 4 | `value: any` → `unknown` |
| `audit.service.ts` | 2 | `params: any[]` → `Record<string, unknown>[]` |
| `attendance.repository.ts` | 2 | Params |

**Pattern** : Pour les résultats de `db.prepare().all()`, utiliser les types d'interface existants (`Student`, `Personnel`, etc.) avec un cast `as Student[]` explicite.

### 5.4 — Frontend (priorité moyenne)

| Fichier | `any` count | Notes |
|---------|-------------|-------|
| `FinanceTab.tsx` | ~15 | Params de callbacks, types inline → utiliser `FeeRecord`, `Payment`, etc. |
| `StudentForm.tsx` | 4 | `initialFees?: any` → `FeeRecord \| null`, `formData: any` → interface dédiée |
| `AttendancePage.tsx` | 5 | Params de callbacks → types de `shared/types.ts` |
| `EventsPage.tsx` | 2 | `filters: any` → interface `EventFilters` |
| `StudentList.tsx` | 1 | `(e: any)` → `(e: React.ChangeEvent<HTMLInputElement>)` |
| `StudentDetail.tsx` | 2 | Callbacks → types appropriés |
| `AuditLogPage.tsx` | 1 | `filters: any` → interface `AuditFilters` |

### 5.5 — Conflit ElectronAPI dans preload/index.d.ts

- **Fichier** : `src/preload/index.d.ts`
- **Problème** : L8 importe `ElectronAPI` de `@electron-toolkit/preload`, puis L128 redéfinit une interface locale du même nom `ElectronAPI`. Le shadow fait que `window.electron` est typé avec la mauvaise interface.
- **Correction** : Renommer l'interface locale en `APIType` (comme dans `env.d.ts` L131) et mettre à jour les références :
  ```typescript
  // AVANT (L128)
  interface ElectronAPI { ... }

  // APRÈS
  interface APIType { ... }
  ```
  Puis mettre à jour `window.api: APIType` et garder `window.electron: ElectronAPI` (l'import du toolkit).

### 5.6 — Imports inutilisés dans les .d.ts

- **Fichiers** : `src/preload/index.d.ts` et `src/renderer/src/env.d.ts`
- **Imports à supprimer** :
  - `FinancePrices` — importé mais jamais référencé
  - `Grade` — seul `GradeWithSubject` est utilisé
  - `ClassSubjectInput` — redondant avec `ClassSubjectPayload` local
  - `SchoolConfig` — importé mais jamais référencé
- **Autre** : Supprimer `Result<T>` dans `env.d.ts` (L15-19) — interface définie mais jamais utilisée.
- **Consolidation** : Garder `ClassSubjectInput` dans `shared/types.ts` et supprimer le type local `ClassSubjectPayload` dans les `.d.ts`, utiliser `ClassSubjectInput` partout.

---

## Phase 6 : DRY — Élimination code dupliqué

> **Raison** : La duplication augmente le risque de bugs (corriger à un endroit mais pas l'autre) et alourdit la maintenance.

### 6.1 — Helper handleStoreError

- **Fichier** : `src/renderer/src/lib/store-utils.ts` (NOUVEAU)
- **Problème** : Le pattern suivant est copié-collé **~50 fois** dans les stores Zustand :
  ```typescript
  catch (error: unknown) {
    if (import.meta.env.DEV) console.error('Operation failed:', error)
    set({ error: error instanceof Error ? error.message : String(error), loading: false })
  }
  ```
- **Correction** :
  ```typescript
  export function handleStoreError(
    error: unknown,
    set: (state: Record<string, unknown>) => void,
    context?: string
  ): void {
    if (import.meta.env.DEV) console.error(`${context || 'Operation'} failed:`, error)
    set({
      error: error instanceof Error ? error.message : String(error),
      loading: false
    })
  }
  ```
- **Fichiers à refactoriser** : `useStudentStore.ts`, `usePersonnelStore.ts`, `useGradeStore.ts`, `useFinanceStore.ts`, `useAuthStore.ts`, `useCashJournalStore.ts`

### 6.2 — Extraire constantes personnel dupliquées

- **Fichier** : `src/renderer/src/lib/personnel-constants.ts` (NOUVEAU)
- **Problème** : `POSITION_LABELS` et `STATUS_LABELS` sont définis **en double** dans :
  - `pages/personnel/PersonnelList.tsx` (L19-30)
  - `pages/personnel/PersonnelDetail.tsx` (L20-31)
- **Correction** : Extraire dans un fichier partagé et importer depuis les deux composants.

### 6.3 — Factoriser attendance recordBus/recordCanteen

- **Fichier** : `src/main/database/repositories/attendance.repository.ts`
- **Problème** : `recordBusAttendance` (L58-104) et `recordCanteenAttendance` (L106-149) sont **structurellement identiques**. Seul le nom de table change (`bus_attendance` vs `canteen_attendance`).
- **Correction** : Créer une fonction privée `recordAttendance(tableName: string, data: AttendanceData)` et faire appeler par les deux fonctions publiques.

### 6.4 — Factoriser WHERE dans audit.service.ts

- **Fichier** : `src/main/auth/audit.service.ts`
- **Problème** : `getAuditLogs` (L124-166) et `getAuditLogCount` (L171-208) dupliquent exactement la même logique de construction de conditions WHERE (5 filtres : `user_id`, `action`, `table_name`, `startDate`, `endDate`).
- **Correction** : Extraire une fonction `buildAuditFilterWhere(filters: AuditFilters): { where: string, params: unknown[] }` réutilisée par les deux méthodes.

### 6.5 — Factoriser sanitization personnel

- **Fichier** : `src/main/database/repositories/personnel.repository.ts`
- **Problème** : La logique de sanitization (NaN→null, date vide→null, object→JSON.stringify, boolean→0/1) est dupliquée **4 fois** :
  - `create()` DB (L43-66)
  - `create()` sync (L74-84)
  - `update()` DB (L182-188)
  - `update()` sync (L197-204)
- **Correction** : Extraire deux fonctions :
  - `sanitizePersonnelFields(data: Record<string, unknown>): Record<string, unknown>` — pour les valeurs DB
  - `sanitizeForSync(data: Record<string, unknown>): Record<string, unknown>` — pour le sync queue

---

## Phase 7 : Nettoyage code mort et warnings

> **Raison** : Production-readiness — pas de logs debug en production, pas de placeholders.

### 7.1 — Wrapper console.error dans DEV

- **Problème** : 18 `console.error` dans 11 fichiers frontend sont affichés en production dans la console Chromium, exposant des informations internes.
- **Correction** : Wrapper chaque `console.error` dans `if (import.meta.env.DEV)`.

| Fichier | Lignes |
|---------|--------|
| `components/students/FinanceTab.tsx` | L91 |
| `components/students/ServiceDashboard.tsx` | L34 |
| `components/students/ReEnrollModal.tsx` | L98 |
| `pages/AttendancePage.tsx` | L41, L87 |
| `pages/EventsPage.tsx` | L79, L90 |
| `pages/Settings.tsx` | L58, L105 |
| `pages/finance/PaymentAlerts.tsx` | L41, L44 |
| `pages/finance/FinanceConfig.tsx` | L47 |
| `pages/students/StudentForm.tsx` | L230, L255, L298, L397 |
| `pages/students/CertificatePage.tsx` | L27 (`.catch(console.error)`) |
| `pages/auth/AuditLogPage.tsx` | L85 |

**Pattern** :
```typescript
// AVANT
console.error('Failed to load:', error)

// APRÈS
if (import.meta.env.DEV) console.error('Failed to load:', error)
```

### 7.2 — Placeholders package.json

- **Fichier** : `package.json`
- **Corrections** :
  - `"author": "example.com"` → `"author": "Lycée Manjary Soa"`
  - `"homepage": "https://electron-vite.org"` → `"homepage": ""`

---

## Phase 8 : Mise à jour documentation

> **Raison** : La documentation est massivement désynchronisée — elle indique que les Phases 4-7 sont "à faire" alors qu'elles sont implémentées.

### 8.1 — Réécrire AGENT_ANCHOR.md

**Sections à mettre à jour** :

| Section | État actuel | Correction |
|---------|-------------|------------|
| Structure fichiers | Manque `cashjournal.repository.ts`, `cashjournal.handler.ts`, `pdf.handler.ts`, `email.handler.ts`, `report.handler.ts`, `pdf.service.ts`, `email.service.ts`, `report.service.ts`, `export.service.ts` | Ajouter tous les fichiers manquants |
| Pages | `pages/finance/` marqué "VIDE" | Lister les 5 fichiers : CashJournalPage, FinanceOverview, PaymentAlerts, PaymentJournal, FinanceConfig |
| Pages settings | `pages/settings/` marqué "VIDE" | Lister EmailSettings.tsx |
| Pages reports | Non mentionné | Ajouter ReportsPage.tsx |
| Stores | 5 stores listés | Ajouter `useCashJournalStore.ts` (6ème) |
| Migrations | "15 au total" | Corriger : 17 (après migration 017) |
| État d'avancement | Phases 4-7 marquées "à implémenter" | Marquer comme terminées |
| Faiblesses restantes | Liste obsolète | Mettre à jour avec les faiblesses corrigées |
| `lib/image-utils.ts` | Non mentionné | Ajouter |

### 8.2 — Marquer opus_plan.md comme archivé

- Phases 4-7 marquées comme terminées, avec références aux fichiers créés
- Ajouter l'historique de la session de finition

### 8.3 — Mettre à jour ARCHITECTURE_OVERVIEW.md

| Section | État actuel | Correction |
|---------|-------------|------------|
| Repositories | 8 listés | Ajouter `cashjournal.repository.ts` |
| IPC Handlers | 10 listés | Ajouter `cashjournal`, `pdf`, `email`, `report` |
| Stores | 5 listés | Ajouter `useCashJournalStore` |
| Pages | Manque finance/, settings/, reports/ | Ajouter tous les fichiers |
| Migrations | "001-015" | Corriger : "001-017" |
| Services | Seul `sync.service.ts` | Ajouter `pdf.service.ts`, `email.service.ts`, `report.service.ts`, `export.service.ts` |

### 8.4 — Mettre à jour COMPTES_UTILISATEURS.md

- Retirer les 4 modules "en construction" (Journal de Caisse, PDF, Rapports, Email) puisqu'ils sont implémentés.

### 8.5 — Supprimer les plans obsolètes

- Supprimer `FINITION_PLAN.md`, `V2.md`, `gemini.md`, `opus2.md` — remplacés par ce plan unique `FINAL_PLAN.md`.

---

## Vérification finale

Après toutes les corrections, exécuter dans l'ordre :

| Étape | Commande/Action | Attendu |
|-------|----------------|---------|
| 1 | `npm run typecheck` | 0 erreur |
| 2 | `npm run build` | Build réussi |
| 3 | `npm run dev` | App démarre sans crash |
| 4 | Login admin | Connexion réussie, dashboard affiché |
| 5 | Navigation sidebar | Tous les menus accessibles |
| 6 | RBAC : se connecter avec chaque rôle | Restrictions UI correctes (boutons désactivés en read-only) |
| 7 | Finance → Vue d'ensemble | Taux de recouvrement basé sur les frais réels |
| 8 | Finance → Journal paiements | Bouton Reçu PDF fonctionnel |
| 9 | Finance → Caisse (via sidebar) | CRUD complet |
| 10 | Finance → Alertes impayés | Chargement rapide (<1s) |
| 11 | Finance → Configuration | Modification admin uniquement |
| 12 | Personnel → Détail | 4 onglets fonctionnels |
| 13 | Notes → Saisie/Bulletin | Fonctionnel |
| 14 | Rapports | Génération des 4 types |
| 15 | PDF | Reçu, certificat, bulletin, fiche de paie |
| 16 | Email | Configuration SMTP, test d'envoi |
| 17 | Audit | Vérifier que les actions sont tracées dans le journal d'audit |
| 18 | StudentList → bouton User | Navigation vers détail élève |

---

## Annexe A : Fichiers à créer

| Fichier | Phase | Description |
|---------|-------|-------------|
| `src/main/database/migrations/017_add_missing_indexes.sql` | 4 | Index sur 6 clés étrangères |
| `src/renderer/src/lib/store-utils.ts` | 6.1 | Helper `handleStoreError` |
| `src/renderer/src/lib/personnel-constants.ts` | 6.2 | `POSITION_LABELS`, `STATUS_LABELS` partagés |

---

## Annexe B : Fichiers à modifier

| Fichier | Phase(s) | Modifications |
|---------|----------|---------------|
| `src/renderer/src/components/students/FinanceTab.tsx` | 1.1, 5.4, 7.1 | RBAC `canWrite('payments')` + types `any` + console.error DEV |
| `src/renderer/src/pages/finance/CashJournalPage.tsx` | 1.2, 3.3 | RBAC `canWrite('cash_journal')` + defaultCat |
| `src/renderer/src/pages/finance/FinanceConfig.tsx` | 1.3, 1.5, 7.1 | ReadOnlyBanner + RBAC `canWrite('settings')` + console.error DEV |
| `src/renderer/src/pages/settings/EmailSettings.tsx` | 1.4, 1.5 | ReadOnlyBanner + RBAC `canWrite('settings')` |
| `src/renderer/src/pages/grades/GradeBook.tsx` | 1.5 | ReadOnlyBanner `grades` |
| `src/renderer/src/pages/grades/ReportCardView.tsx` | 1.5 | ReadOnlyBanner `grades` |
| `src/renderer/src/pages/finance/PaymentJournal.tsx` | 1.5 | ReadOnlyBanner `payments` |
| `src/renderer/src/pages/finance/PaymentAlerts.tsx` | 1.5, 7.1 | ReadOnlyBanner `payments` + console.error DEV |
| `src/renderer/src/pages/finance/FinanceOverview.tsx` | 1.5, 3.1 | ReadOnlyBanner + taux recouvrement réel |
| `src/renderer/src/pages/reports/ReportsPage.tsx` | 1.5, 3.2 | ReadOnlyBanner `reports` + schoolYear dynamique |
| `src/main/ipc/personnel.handler.ts` | 2.1, 5.2 | 5 audit logs + types `any` (28 occurrences) |
| `src/main/ipc/email.handler.ts` | 2.2 | 2 audit logs |
| `src/main/database/repositories/payment.repository.ts` | 3.1, 5.3 | `getExpectedRevenue` + types `any` (7 occurrences) |
| `src/main/ipc/payment.handler.ts` | 3.1 | Handler `payment:getExpectedRevenue` |
| `src/preload/index.ts` | 3.1 | Channel `payment:getExpectedRevenue` |
| `src/preload/index.d.ts` | 3.1, 5.5, 5.6 | Declaration + rename `ElectronAPI` → `APIType` + imports |
| `src/renderer/src/env.d.ts` | 3.1, 5.6 | Declaration + imports |
| `src/main/services/email.service.ts` | 3.6 | Scheduler robuste avec `lastSentDate` |
| `src/main/services/report.service.ts` | 3.7 | try/catch dans les 4 méthodes |
| `src/main/auth/auth.service.ts` | 3.4 | Supprimer `cleanupSessions()` |
| `src/renderer/src/pages/students/StudentList.tsx` | 3.5, 5.4 | Câbler bouton User + type `any` |
| `src/main/database/db.ts` | 4.2 | Ajouter migration 017 dans le tableau |
| `src/renderer/src/store/useStudentStore.ts` | 5.1, 6.1 | Types `any` + `handleStoreError` |
| `src/renderer/src/store/usePersonnelStore.ts` | 5.1, 6.1 | Types `any` + `handleStoreError` |
| `src/renderer/src/store/useGradeStore.ts` | 5.1, 6.1 | Types `any` + `handleStoreError` |
| `src/renderer/src/store/useFinanceStore.ts` | 6.1 | `handleStoreError` |
| `src/renderer/src/store/useAuthStore.ts` | 6.1 | `handleStoreError` |
| `src/renderer/src/store/useCashJournalStore.ts` | 6.1 | `handleStoreError` |
| `src/main/ipc/grade.handler.ts` | 5.2 | Types `any` (24 occurrences) |
| `src/main/ipc/auth.handler.ts` | 5.2 | `catch (e: any)` → `catch (e: unknown)` (2 occurrences) |
| `src/main/ipc/settings.handler.ts` | 5.2 | `value: any` → `value: unknown` |
| `src/main/ipc/dashboard.handler.ts` | 5.2 | `catch` → `catch (error: unknown)` |
| `src/main/database/repositories/student.repository.ts` | 5.3 | Types `any` (24 occurrences) |
| `src/main/database/repositories/personnel.repository.ts` | 5.3, 6.5 | Types `any` (21 occurrences) + `sanitizePersonnelFields` |
| `src/main/database/repositories/grade.repository.ts` | 5.3 | Types `any` (16 occurrences) |
| `src/main/database/repositories/user.repository.ts` | 5.3 | Types `any` (11 occurrences) |
| `src/main/database/repositories/event.repository.ts` | 5.3 | Types `any` (9 occurrences) |
| `src/main/database/repositories/settings.repository.ts` | 5.3 | Types `any` (4 occurrences) |
| `src/main/auth/audit.service.ts` | 5.3, 6.4 | Types `any` (2 occurrences) + `buildAuditFilterWhere` |
| `src/main/database/repositories/attendance.repository.ts` | 5.3, 6.3 | Types `any` (2 occurrences) + `recordAttendance` |
| `src/renderer/src/pages/students/StudentForm.tsx` | 5.4, 7.1 | Types `any` (4 occurrences) + console.error DEV |
| `src/renderer/src/pages/AttendancePage.tsx` | 5.4, 7.1 | Types `any` (5 occurrences) + console.error DEV |
| `src/renderer/src/pages/EventsPage.tsx` | 5.4, 7.1 | Types `any` (2 occurrences) + console.error DEV |
| `src/renderer/src/pages/students/StudentDetail.tsx` | 5.4 | Types `any` (2 occurrences) |
| `src/renderer/src/pages/auth/AuditLogPage.tsx` | 5.4, 7.1 | Types `any` (1 occurrence) + console.error DEV |
| `src/renderer/src/components/students/ServiceDashboard.tsx` | 7.1 | console.error DEV |
| `src/renderer/src/components/students/ReEnrollModal.tsx` | 7.1 | console.error DEV |
| `src/renderer/src/pages/Settings.tsx` | 7.1 | console.error DEV |
| `src/renderer/src/pages/students/CertificatePage.tsx` | 7.1 | console.error DEV |
| `src/renderer/src/pages/personnel/PersonnelList.tsx` | 6.2 | Importer constantes depuis `personnel-constants.ts` |
| `src/renderer/src/pages/personnel/PersonnelDetail.tsx` | 6.2 | Importer constantes depuis `personnel-constants.ts` |
| `package.json` | 7.2 | Placeholders author/homepage |
| `docs/AGENT_ANCHOR.md` | 8.1 | Mise à jour complète |
| `docs/opus_plan.md` | 8.2 | Marquer phases terminées |
| `docs/ARCHITECTURE_OVERVIEW.md` | 8.3 | Ajouter modules manquants |
| `docs/COMPTES_UTILISATEURS.md` | 8.4 | Retirer modules "en construction" |

---

## Annexe C : Points de vigilance futurs

> Ces éléments sont notés pour un traitement futur mais ne bloquent pas la livraison :

1. **Composants monolithiques** : `StudentForm.tsx` (806 lignes), `FinanceTab.tsx` (791 lignes), `PersonnelDetail.tsx` (662 lignes), `StudentDetail.tsx` (656 lignes) — à découper lors d'un sprint de refactoring dédié
2. **Tests unitaires** : Aucun test — `npm run typecheck` est le seul garde-fou
3. **`supabaseClient: any`** dans `sync.service.ts` — le client Supabase n'est pas typé
4. **Settings sync unidirectionnel** : les settings sont poussés vers Supabase mais jamais tirés — intentionnel mais à documenter clairement
5. **Virtual scrolling** : non implémenté pour les grandes listes d'élèves — à envisager si performance insuffisante
6. **Mot de passe SMTP en clair** : acceptable pour usage interne, à chiffrer si l'app est déployée sur plusieurs postes

---

*Dernière mise à jour : 10 juin 2026*
*Statut : Plan entièrement exécuté, Phase 8 finalisée.*
