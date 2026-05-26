# 🗂️ PROGRESS TRACKER — Lycée Manjary Soa LMS

> **Fichier de suivi des tâches en cours.**  
> Mettre à jour ce fichier à chaque fin de session / fin de tâche.  
> Référence : `AGENT_ANCHOR.md` pour les conventions et l'architecture.

---

## 🎯 Objectif global

Compléter l'application LMS pour le Lycée Manjary Soa en suivant les phases définies dans `AGENT_ANCHOR.md`.

---

## 📋 Phases & Statut

### Phase 0 : Nettoyage & Consolidation
| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 0.1 | Supprimer fichiers debug racine (`debug_fees.js`, `check_fees.js`, `check_email.js`, `diag_log.txt`, `output.txt`, `nul`) | ✅ TERMINÉ | |
| 0.2 | Extraire `Sidebar` → `components/layout/Sidebar.tsx` | ✅ TERMINÉ | |
| 0.3 | Extraire `Layout` → `components/layout/MainLayout.tsx` | ✅ TERMINÉ | |
| 0.4 | Extraire `ErrorBoundary` → `components/shared/ErrorBoundary.tsx` | ✅ TERMINÉ | |
| 0.5 | Vérifier / ajouter import CSS Tailwind (`src/renderer/src/styles/globals.css`) | ✅ TERMINÉ | `main.css` nettoyé (retrait styles template), `globals.css` créé |
| 0.6 | Alléger `App.tsx` (Router + AuthInit + routes uniquement) | ✅ TERMINÉ | ~120 lignes → ~60 lignes |

### Phase 1 : Dashboard fonctionnel
| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 1.1 | Backend — `src/main/ipc/dashboard.handler.ts` (KPIs SQL agrégés) | ✅ TERMINÉ | SQL agrégations : COUNT, SUM, GROUP BY sur students, payments, personnel, events |
| 1.2 | Frontend — `src/renderer/src/pages/DashboardPage.tsx` (Cards + activité) | ✅ TERMINÉ | 6 cards KPI + graphique tendance SVG + événements + activité récente |
| 1.3 | Preload — channels `dashboard:getStats` | ✅ TERMINÉ | `preload/index.ts` + `index.d.ts` + `env.d.ts` |
| 1.4 | Route — `/` dans `MainLayout.tsx` | ✅ TERMINÉ | Route `/` → `<DashboardPage />` |

### 🔧 Corrections Critiques (Audit Architecture)
| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| C1 | `useStudentStore.ts` — supprimer mode web Supabase direct | ✅ TERMINÉ | Sécurité : clé anon plus exposée dans renderer |
| C2 | `sync.service.ts` — conversion booléens 0/1 → true/false (push) | ✅ TERMINÉ | Évite erreurs de type PostgreSQL |
| C3 | `settings.repository.ts` — ajouter `addToSyncQueue` | ✅ TERMINÉ | Settings synchronisés vers cloud |
| C4 | Preload — ajouter `repair()` et `resetDatabase()` | ✅ TERMINÉ | Settings.tsx peut utiliser window.api |
| C5 | `Settings.tsx` — remplacer ipcRenderer brut par window.api | ✅ TERMINÉ | Architecture IPC typée |
| C6 | Nettoyage fichiers restants (debug_fees_repro.ts, nul, wavy-lines.svg, dev-app-update.yml, RBAC tracker) | ✅ TERMINÉ | |

### Phase 2 : Module Personnel complet
| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 2.0 | Migration DB — `005_add_personnel_tables.sql` | ✅ TERMINÉ | Tables IF NOT EXISTS : personnel, time_tracking, personnel_absences, salary_advances, custom_deductions |
| 2.1 | Repository — `repositories/personnel.repository.ts` | ✅ TERMINÉ | CRUD + time_tracking + absences + advances + deductions + salary calc (CNAPS, IRSA, droit) |
| 2.2 | Handler — `ipc/personnel.handler.ts` | ✅ TERMINÉ | 15 channels IPC avec RBAC + audit log |
| 2.3 | Store — `store/usePersonnelStore.ts` | ✅ TERMINÉ | Zustand : fetch/get/create/update/delete + calculateSalary |
| 2.4 | Pages — `PersonnelList.tsx`, `PersonnelForm.tsx`, `PersonnelDetail.tsx` | ✅ TERMINÉ | Liste avec filtres, Formulaire complet, Détail avec 4 onglets |
| 2.5 | Preload + Routes | ✅ TERMINÉ | preload/index.ts + index.d.ts + env.d.ts + MainLayout.tsx |
| 2.6 | Sync Supabase — push/pull pour tables personnel | ✅ TERMINÉ | addToSyncQueue appelé dans toutes les mutations |
| 2.7 | Types partagés — `shared/types.ts` | ✅ TERMINÉ | Interfaces Personnel, TimeTracking, Absence, Advance, Deduction, SalaryCalculation |
| 2.8 | **BUGFIX** — Création personnel échouait (NaN vers SQLite) | ✅ TERMINÉ | Repository : filtre NaN → null. Formulaire : parseFloat conditionnel. Store : retourne boolean. |
| 2.9 | **Ajout** — Formulaire de saisie d'absences | ✅ TERMINÉ | Onglet "Absences" : formulaire avec date début/fin, motif, justifiée |
| 2.10 | **Ajout** — Interface avances + déductions personnalisées | ✅ TERMINÉ | Onglet "Salaire" : formulaires avances et déductions + historique |
| 2.11 | **BUGFIX** — 5 bugs dans `calculateSalary` | ✅ TERMINÉ | (A) absences multi-mois comptaient toute la période, (B) date `-31` invalide pour certains mois, (C) absences sans effet sur horaires, (D) approximation 30 jours au lieu de réel, (E) brut pouvait être négatif. Ajout `totalAbsenceDays` dans `details`. |
| 2.12 | **UI** — Onglet "Heures" masqué pour employés mensuels | ✅ TERMINÉ | Conditionnel selon `salary_type` + messages explicatifs impact absence/salaire |
| 2.13 | **BUGFIX** — Sync Supabase `invalid input syntax for type date: ""` | ✅ TERMINÉ | Repository `create`/`update` : chaîne vide sur champs date → `null` |
| 2.14 | **Refactor** — Pointage journalier `daily_attendance` + calendrier mensuel | ✅ TERMINÉ | Migration `006_add_daily_attendance.sql`. Composant `AttendanceCalendar.tsx` avec grille jour par jour, status (present/absent/late/half_day/excused/paid_leave), heures, notes. |
| 2.15 | **Refactor** — Calcul salaire mensuel hybride (quota d'heures) | ✅ TERMINÉ | `calculateSalary` : taux horaire = `monthly_salary ÷ expected_monthly_hours`. Déduction si sous-quota, heures sup si au-dessus. Exposé dans `details` : `expectedHours`, `hourlyEquivalentRate`, `overtimePay`. |
| 2.16 | **Ajout** — Champs planning de travail sur le profil | ✅ TERMINÉ | `PersonnelForm` : `work_pattern` (daily/weekly/monthly/custom), `work_days` (multi-select), `daily_hours`, `expected_monthly_hours`. Textes explicatifs. |
| 2.17 | **Lien Finance** — Création auto dépense salaire dans `cash_journal` | ✅ TERMINÉ | Bouton "Valider et payer" dans onglet Salaire. Repository `createSalaryExpense`. Handler + Preload + Store. Entrée `expense`/`salaire` avec `related_personnel_id`. |

### ⚠️ Phase 2 — Ce qui est reporté à Phase 5 (PDF)
| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 2.11 | Génération fiche de paie PDF | ⬜ REPORTÉ Phase 5 | Prévu dans `implementation_plan.md` Phase 5.1 (`pdf.service.ts`) |

### Phase 3 : Module Notes & Bulletins
| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 3.0 | Migration — `008_add_deleted_to_grades.sql` | ✅ TERMINÉ | Colonne `deleted` ajoutée pour soft-delete |
| 3.1 | Repository — `repositories/grade.repository.ts` | ✅ TERMINÉ | CRUD subjects + grades + moyennes élève/classe + classement + matières |
| 3.2 | Handler — `ipc/grade.handler.ts` | ✅ TERMINÉ | 12 channels IPC avec RBAC (grades) + audit log |
| 3.3 | Store — `store/useGradeStore.ts` | ✅ TERMINÉ | Zustand : subjects + grades + averages + ranking |
| 3.4 | Pages — `GradeEntry.tsx`, `GradeBook.tsx`, `ReportCardView.tsx` | ✅ TERMINÉ | Saisie par classe/matière, Carnet croisé, Bulletin individuel avec mention |
| 3.5 | Preload + Routes | ✅ TERMINÉ | preload/index.ts + index.d.ts + env.d.ts + MainLayout.tsx (/grades/*) |

### Phase 4 : Finance — Compléter
| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 4.1 | KPI Cards dans FinancePage (Vue d'ensemble) | ⬜ À FAIRE | total perçu, impayés, solde, taux recouvrement |
| 4.2 | Repository — `repositories/cashjournal.repository.ts` | ⬜ À FAIRE | recettes/dépenses école |
| 4.3 | Handler — `ipc/cashjournal.handler.ts` | ⬜ À FAIRE | |
| 4.4 | Page — `pages/finance/CashJournalPage.tsx` | ⬜ À FAIRE | saisie dépenses/recettes, solde |
| 4.5 | Page — `pages/finance/PaymentAlerts.tsx` | ⬜ À FAIRE | impayés par classe/niveau |
| 4.6 | Séparer config tarifs en sous-route `/finance/configuration` | ⬜ À FAIRE | |

### Phase 5 : PDF Generation
| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 5.1 | Service — `services/pdf.service.ts` (jsPDF) | ⬜ À FAIRE | certificat, bulletin, fiche paie, reçu, bilan journalier |
| 5.2 | Preload channels `pdf:*` | ⬜ À FAIRE | |
| 5.3 | Boutons "Générer PDF" dans pages existantes | ⬜ À FAIRE | |

### Phase 6 : Email Automation
| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 6.1 | Service — `services/email.service.ts` (nodemailer) | ⬜ À FAIRE | SMTP Gmail, envoi 18h |
| 6.2 | Page — `pages/settings/EmailSettings.tsx` | ⬜ À FAIRE | config + toggle + test |

### Phase 7 : Rapports & Export
| # | Tâche | Statut | Notes |
|---|-------|--------|-------|
| 7.1 | Rapports financiers mensuels | ⬜ À FAIRE | |
| 7.2 | Export CSV/Excel | ⬜ À FAIRE | |
| 7.3 | Rapports personnel | ⬜ À FAIRE | |

---

## 🏁 Checklist pré-commit (à cocher avant chaque livraison)
- [ ] `npm run typecheck` passe sans erreur
- [ ] `npm run dev` démarre sans crash
- [ ] Fonctionnalités testées manuellement
- [ ] Permissions RBAC vérifiées (4 rôles)
- [ ] Messages UI en français
- [ ] Pas de `console.log` superflu
- [ ] Types corrects (pas de `any` injustifié)
- [ ] Sync Supabase fonctionne pour nouvelles tables

---

## 📝 Journal des sessions

### Session 2026-05-15 — Initialisation
- **Agent** : OpenCode
- **Actions** : Analyse projet + création `PROGRESS_TRACKER.md`
- **Prochaine étape** : À définir avec l'utilisateur

### Session 2026-05-15 — Phase 0 & 1 (Nettoyage + Dashboard)
- **Agent** : OpenCode
- **Actions** :
  - Phase 0 : Suppression fichiers debug, extraction Sidebar/Layout/ErrorBoundary, nettoyage CSS, allègement App.tsx
  - Phase 1 : Création `dashboard.handler.ts` avec KPIs SQL, `DashboardPage.tsx` avec 6 cards + graphique + activité, preload channels
- **Corrections annexes** : 3 erreurs TS6133 préexistantes corrigées (variables inutilisées dans auth.service.ts, rbac.service.ts, student.handler.ts)
- **Vérifications** : `npm run typecheck` passe ✅ | `npm run dev` démarre ✅
- **Prochaine étape** : Phase 2 — Module Personnel complet

---

### Session 2026-05-18 — Audit & Corrections Critiques
- **Agent** : OpenCode
- **Actions** :
  - Audit complet architecture : repository → handler → preload → store → page
  - Suppression mode "web" Supabase direct dans useStudentStore.ts (failles sécurité + offline)
  - Ajout conversion booléens SQLite→PostgreSQL dans pushLocalChanges()
  - Ajout sync_queue pour settings.repository.ts
  - Exposition repair() et resetDatabase() dans preload typé
  - Correction Settings.tsx (ipcRenderer brut → window.api)
  - Nettoyage fichiers temporaires restants
- **Vérifications** : `npm run typecheck` passe ✅ | `npm run dev` démarre ✅
- **Prochaine étape** : Phase 2 — Module Personnel complet

---

### Session 2026-05-18 — Phase 2 (Module Personnel)
- **Agent** : OpenCode
- **Actions** :
  - Migration 005 : création tables personnel, time_tracking, personnel_absences, salary_advances, custom_deductions
  - Types partagés : Personnel, TimeTracking, PersonnelAbsence, SalaryAdvance, CustomDeduction, SalaryCalculation
  - Repository complet : CRUD + calcul salaire (brut → net avec CNAPS, IRSA, absences, avances, déductions)
  - Handler IPC : 15 channels avec RBAC + audit log
  - Store Zustand : usePersonnelStore
  - 3 pages React : PersonnelList (filtres), PersonnelForm (création/édition), PersonnelDetail (4 onglets)
  - Preload + routes : tous les channels exposés, routes /personnel/* ajoutées
- **Vérifications** : `npm run typecheck` passe ✅ | `npm run dev` démarre ✅ | Migration 005 appliquée ✅
- **Prochaine étape** : Phase 3 — Module Notes & Bulletins

---

### Session 2026-05-19 — Audit Final Phase 2 + Corrections Critiques
- **Agent** : OpenCode
- **Actions** :
  - Audit complet de la Phase 2 : repository, handler, store, pages, types, migrations, preload, sync
  - **CRITICAL FIX** : `sync.service.ts` — ajout des tables `time_tracking`, `daily_attendance`, `personnel_absences`, `salary_advances`, `custom_deductions` dans `pullRemoteChanges()`
  - **CRITICAL FIX** : `sync.service.ts` — ajout `has_droit` dans `booleanFields` pour conversion SQLite→PostgreSQL
  - **CRITICAL FIX** : `personnel.repository.ts` — remplacement des hard-delete (`DELETE FROM`) par soft-delete (`UPDATE ... SET deleted = 1`) pour `absences`, `deductions`, `attendance`
  - **CRITICAL FIX** : `personnel.repository.ts` — `setAttendance` refactorisé en vrai upsert (UPDATE si existe, INSERT si nouveau) sans suppression physique
  - **CRITICAL FIX** : Migration `007_add_soft_delete_to_personnel_related.sql` — ajout colonne `deleted` sur `time_tracking`, `personnel_absences`, `salary_advances`, `custom_deductions`, `daily_attendance`
  - **CRITICAL FIX** : `SUPABASE_MIGRATION.sql` — ajout table `daily_attendance` + index + RLS policy
- **Vérifications** : `npm run typecheck` passe ✅ | `npm run build` passe ✅
- **Prochaine étape** : Phase 3 — Module Notes & Bulletins

---

### Session 2026-05-19 — Phase 3 (Module Notes & Bulletins)
- **Agent** : OpenCode
- **Actions** :
  - Migration 008 : ajout colonne `deleted` sur `grades` (soft-delete)
  - Types partagés : `Subject`, `Grade`, `GradeWithSubject`, `StudentTermAverage`, `SubjectClassAverage`
  - Repository `grade.repository.ts` : CRUD subjects + grades + moyennes pondérées + classement par classe
  - Handler IPC `grade.handler.ts` : 12 channels avec RBAC `grades` + audit log
  - Store `useGradeStore.ts` : fetch/create/update/delete subjects + grades + averages + ranking
  - Pages React :
    - `GradeEntry.tsx` : saisie en masse par classe / matière / trimestre (notes, coefficients, commentaires, comportement)
    - `GradeBook.tsx` : tableau croisé élèves × matières avec moyennes, rangs, moyennes de classe
    - `ReportCardView.tsx` : bulletin individuel avec mention, total coefficients, alerte si moyenne < 10
  - Preload + routes : tous les channels exposés, routes `/grades/*` ajoutées
  - Fix `sync.service.ts` : ajout `subjects`, `time_tracking`, `daily_attendance`, `personnel_absences`, `salary_advances`, `custom_deductions` dans `pullRemoteChanges` + `has_droit` dans booleanFields
- **Vérifications** : `npm run typecheck` passe ✅ | `npm run build` passe ✅
- **Prochaine étape** : Phase 4 — Finance (Journal de Caisse, Alertes impayés, sous-routes)

---

### Session 2026-05-19 — Phase 3 : Corrections UX (retour utilisateur)
- **Agent** : OpenCode
- **Problèmes constatés** :
  - Listes "Classe" et "Matière" vides dans `GradeEntry` → **inutilisable**
  - Pas d'interface pour créer des matières
  - Pas de page d'accueil / hub pour le module Notes
- **Corrections** :
  - **BUGFIX** : `GradeEntry.tsx` + `GradeBook.tsx` — `student.list` retourne `{students, total}` (pas `{success, students}`). Suppression du test `result.success` qui bloquait le chargement des classes.
  - **Migration 009** : `009_seed_subjects.sql` — insertion de 10 matières par défaut (Mathématiques, Français, Sciences, Histoire-Géo, Anglais, Malagasy, EPS, Arts, Musique, Éducation Morale)
  - **Nouvelle page** : `GradesPage.tsx` — hub d'accueil avec 3 cartes (Saisie, Carnet, Matières)
  - **Nouvelle page** : `SubjectManager.tsx` — gestion complète des matières (CRUD : créer, modifier coefficient, supprimer) avec protection RBAC
  - **UX** : messages explicatifs quand les listes sont vides + liens directs vers la résolution (ex: "Ajouter des matières")
  - **Routes** : `/grades` → hub, `/grades/subjects` → gestion matières
- **Vérifications** : `npm run typecheck` passe ✅ | `npm run build` passe ✅

---

### Session 2026-05-19 — Bugfix : Classe élève & Bouton Inscrire
- **Agent** : OpenCode
- **Problèmes constatés** :
  - Élèves inscrits (avec `student_fees` + paiements) apparaissent comme "Classe non spécifiée" dans la liste
  - Bouton "Inscrire" visible sur le détail d'élèves déjà inscrits
- **Racine** : `students.class` était vide alors que `student_fees.class_name` contenait la bonne valeur. Le bouton testait `currentStudent.class` (vide) au lieu de `currentFees`.
- **Corrections** :
  - **Migration 010** : `010_sync_student_class_from_fees.sql` — synchronise `students.class` depuis `student_fees.class_name` pour tous les élèves existants
  - **`StudentList.tsx`** : badge "Non inscrit" en gris quand `class` est vide, badge bleu avec la classe sinon
  - **`StudentDetail.tsx`** : bouton affiche "Inscrire" uniquement si `!currentFees` (pas de frais pour l'année en cours). Sinon "Réinscrire".
- **Vérifications** : `npm run typecheck` passe ✅ | `npm run build` passe ✅

---

### Session 2026-05-26 — Audit Module Élève + Corrections Critiques
- **Agent** : OpenCode
- **Problèmes constatés** :
  - **CRITICAL** : `StudentRepository.list()` retournait toujours `[]` → "Aucun élève trouvé". La requête de comptage `countQuery` était construite avec `query.replace('SELECT s.*,', 'SELECT COUNT(*) as total')`, ce qui produisait une SQL invalide (le `COALESCE(...) as class` restait collé sans virgule). De plus, `SELECT s.*, expr AS class` était ambigu car `s.*` contenait déjà `class`.
  - `StudentRepository.getById()` ne résolvait pas `class` via le fallback `student_fees`, donc le détail pouvait afficher "Non inscrit" même si l'élève avait des frais.
  - `StudentDetail.tsx` avait une section JSX dupliquée après ajout des toggles Bus/Cantine.
  - Migration 010 échouait avec `NOT NULL constraint failed: students.class`.
  - Sync push `student_fees` manquait `student_id`.
  - Sync push `personnel` envoyait `""` sur champs date.
- **Corrections** :
  - **BUGFIX** : `StudentRepository.list()` — refactor complet avec sous-requête `resolved_class`, construction séparée du WHERE pour data et count, filtre par classe post-résolution. Plus de `replace()` fragile.
  - **BUGFIX** : `StudentRepository.getById()` — ajout du `COALESCE` avec fallback `student_fees.class_name` pour résoudre `class` correctement.
  - **BUGFIX** : `StudentDetail.tsx` — suppression du bloc JSX dupliqué.
  - **BUGFIX** : `StudentDetail.tsx` — toggles Bus/Cantine fonctionnels.
  - **BUGFIX** : `FinanceTab.tsx` — cartes Bus et Cantine ajoutées.
  - **BUGFIX** : Migration 010 — gestion des `class_name` NULL + fallback `Non inscrit`.
  - **BUGFIX** : `student.repository.ts` — `addToSyncQueue('student_fees', ...)` inclut `student_id`.
  - **BUGFIX** : `personnel.repository.ts` — sanitisation `''` → `null` sur champs date dans les payloads sync.
- **Vérifications** : `npm run typecheck` passe ✅ | `npm run build` passe ✅
- **Prochaine étape** : Phase 4 — Finance (Journal de Caisse, Alertes impayés, sous-routes)
- **Agent** : OpenCode
- **Problèmes constatés** :
  - `StudentDetail.tsx` avait une section "Services & Frais" dupliquée → erreurs JSX après ajout des toggles Bus/Cantine
  - Migration 010 échouait avec `NOT NULL constraint failed: students.class` quand `student_fees.class_name` est NULL
  - Sync push `student_fees` manquait `student_id` (erreur Supabase 23502)
  - Sync push `personnel` envoyait `""` sur champs date (erreur PostgreSQL `invalid input syntax for type date`)
- **Corrections** :
  - **BUGFIX** : `StudentDetail.tsx` — suppression du bloc JSX dupliqué (reste de l'ancienne section après remplacement par les toggles)
  - **BUGFIX** : `StudentDetail.tsx` — badge Bus/Cantine cliquables avec `ToggleRight`/`ToggleLeft`, nouvelle section "Uniformes & Accessoires"
  - **BUGFIX** : `FinanceTab.tsx` — ajout des cartes Bus et Cantine dans le tableau de services
  - **BUGFIX** : Migration 010 — ajout `EXISTS` pour ne mettre à jour que les élèves ayant un `class_name` non NULL ; fallback `UPDATE SET class = 'Non inscrit'` pour les sans-frais
  - **BUGFIX** : `student.repository.ts` — `addToSyncQueue('student_fees', ...)` inclut désormais `student_id: id` dans le payload (update path)
  - **BUGFIX** : `personnel.repository.ts` — sanitisation des champs date (`''` → `null`) dans les payloads envoyés à `addToSyncQueue` (create + update)
- **Vérifications** : `npm run typecheck` passe ✅ | `npm run build` passe ✅ | `npm run dev` démarre ✅
- **Prochaine étape** : Phase 4 — Finance (Journal de Caisse, Alertes impayés, sous-routes)

---

### Session 2026-05-26 — Synchronisation Bus/Cantine : Abonnements vs Paiements
- **Agent** : OpenCode
- **Problèmes constatés** :
  - **INCOHÉRENCE MAJEURE** : `student_payments` contient des paiements `type='bus'` et `type='canteen'`, mais les flags `bus_subscribed` / `canteen_subscribed` dans `student_fees` ne sont pas activés.
  - Conséquence : un élève ayant payé le transport apparaît comme "Non inscrit" dans le détail (toggle Bus OFF) — deux sources de vérité désynchronisées.
  - `PaymentRepository.create()` ne mettait jamais à jour `student_fees` lors d'un paiement de transport ou cantine.
- **Corrections** :
  - **BUGFIX** : `PaymentRepository.create()` — activation automatique de `bus_subscribed` ou `canteen_subscribed` dans `student_fees` quand un paiement correspondant est enregistré, avec `sync_status = 'pending'` et `addToSyncQueue` vers Supabase.
  - **BUGFIX** : `db.ts` — ajout de la migration `011_sync_subscriptions_with_payments.sql` dans la liste d'exécution.
  - **MIGRATION 011** : `011_sync_subscriptions_with_payments.sql` — synchronise rétroactivement tous les flags d'abonnement avec les paiements existants :
    - Étape 1 : `bus_subscribed = 1` pour les élèves ayant des paiements `type='bus'`
    - Étape 2 : `canteen_subscribed = 1` pour les élèves ayant des paiements `type='canteen'`
    - Étape 3 : Route par défaut `bus_route = 'Zone non définie'` si manquante
    - Étape 4 : Jours cantine par défaut (`5j/sem`) si manquants
  - **SYNC** : toutes les modifications de `student_fees` via cette migration ont `sync_status = 'pending'` et seront poussées vers Supabase au prochain cycle.
- **Architecture** : Désormais, l'abonnement (`student_fees.bus_subscribed`) est la source de vérité pour "est-il inscrit ?", et le paiement (`student_payments`) est l'historique financier. Les deux restent cohérents grâce à la mise à jour automatique dans `PaymentRepository.create()`.
- **Vérifications** : `npm run typecheck` passe ✅ | `npm run build` passe ✅
- **Prochaine étape** : Phase 4 — Finance (Journal de Caisse, Alertes impayés, sous-routes)

---

### Session 2026-05-26 — Audit Complet & Nettoyage de Code
- **Agent** : OpenCode
- **Objectif** : Vérifier la qualité, la cohérence et la propreté de tout le code avant de passer à la Phase 4.
- **Audit effectué** :
  - **Logs d'erreur** : analyse des logs de démarrage et de sync → aucune erreur critique.
  - **Qualité du code** : audit de ~60 fichiers, identification de ~40 `console.log` de debug, ~200+ annotations `any`, 22 occurrences de `(window as any).api`.
  - **Fichiers inutiles** : suppression de `query-db.cjs`, `nul` (ajout au `.gitignore`).
- **Corrections majeures** :
  - **TYPES IPC (P0)** : `preload/index.d.ts`, `env.d.ts`, `preload/index.ts` — remplacement de tous les `any` par les types partagés (`Student`, `Payment`, `FeeRecord`, `Personnel`, `Grade`, `Subject`, etc.) depuis `shared/types.ts`. Création d'interfaces `StudentFilters`, `PaymentFilters`, `PersonnelFilters`, `SubjectInput`, `GradeInput`.
  - **API TYPÉE (P0)** : remplacement de **toutes** les occurrences de `(window as any).api` par `window.api` dans le renderer (`FinanceTab.tsx`, `EventsPage.tsx`, `AttendancePage.tsx`, `ServiceDashboard.tsx`, `ReEnrollModal.tsx`).
  - **LOGS DEBUG (P0)** : suppression de 19 `console.log` de debug dans `student.repository.ts`, `payment.repository.ts`, `sync.service.ts`, `index.ts` (ping handler). Tous les `console.error` de gestion d'erreur ont été conservés.
  - **TYPES GRADES (P1)** : ajout de champs optionnels `first_name`, `last_name`, `class` à `GradeWithSubject` dans `shared/types.ts` pour refléter le SQL réel de `getGradesByClass`.
  - **CORRECTIONS DIVERS (P1)** : casts explicites dans `DashboardPage.tsx`, `Settings.tsx`, `CertificatePage.tsx`, `useFinanceStore.ts`, `useGradeStore.ts`, `EventsPage.tsx`, `AttendancePage.tsx` pour respecter les nouveaux types stricts.
- **Vérifications** : `npm run typecheck` passe ✅ | `npm run build` passe ✅
- **État** : Codebase auditée, nettoyée, typée. Prête pour la Phase 4.

---

*Dernière mise à jour : 26 mai 2026*
