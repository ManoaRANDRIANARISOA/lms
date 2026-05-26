# 🔍 Audit Complet & Plan d'Implémentation — Lycée Manjary Soa LMS

## Contexte

Application backoffice de gestion scolaire pour le Lycée Manjary Soa (Madagascar).  
Stack : **Electron + React + TypeScript + SQLite (offline-first) + Supabase (cloud sync)**.  
Capacité cible : 1000 élèves, 4 rôles RBAC, 2-4 utilisateurs simultanés, 100% offline.

---

## 📊 État d'avancement global

### ✅ Ce qui est FAIT et fonctionnel

| Module | Backend (IPC/Repo) | Frontend (Page) | Statut |
|--------|-------------------|-----------------|--------|
| **Auth & Login** | ✅ Complet | ✅ LoginPage | ✅ Opérationnel |
| **RBAC** | ✅ 4 rôles, matrice complète | ✅ Sidebar filtrée, ReadOnlyBanner | ✅ Opérationnel |
| **Sessions** | ✅ Timeout 60min, monitor, ping | ✅ Activity ping 5min | ✅ Opérationnel |
| **Audit Logs** | ✅ Service + requêtes | ✅ AuditLogPage | ✅ Opérationnel |
| **User Management** | ✅ CRUD complet | ✅ UserManagementPage | ✅ Opérationnel |
| **Élèves** | ✅ CRUD + re-enrollment + sync | ✅ List, Form, Detail, Certificate | ✅ Opérationnel |
| **Paiements** | ✅ CRUD + filtres + tuition status | ✅ FinancePage (journal, config) | ✅ Opérationnel |
| **Pointage Bus/Cantine** | ✅ Record + subscribers | ✅ AttendancePage | ✅ Opérationnel |
| **Événements parents** | ✅ CRUD + participants + paiements | ✅ EventsPage | ✅ Opérationnel |
| **Paramètres** | ✅ Get/Set key-value | ✅ Settings page | ✅ Opérationnel |
| **Cloud Sync** | ✅ Push/Pull + conflict resolution | — (auto, background) | ✅ Opérationnel |
| **DB Migrations** | ✅ 4 migrations (001-004) | — | ✅ Opérationnel |
| **Preload Bridge** | ✅ Tous les channels typés | ✅ index.d.ts | ✅ Opérationnel |

### ❌ Ce qui est MANQUANT (pages/modules entiers)

| Module | Backend | Frontend | Priorité |
|--------|---------|----------|----------|
| **Dashboard** | ❌ Aucun endpoint KPI | ❌ Placeholder "En construction" | 🔴 Haute |
| **Personnel** | ✅ Repository + Handler complets | ✅ List, Form, Detail, Pointage, Salaire | ✅ |
| **Notes & Bulletins** | ❌ Aucun handler/repository | ❌ Placeholder "En construction" | 🔴 Haute |
| **Journal de Caisse** | ❌ Aucun handler dédié | ❌ Pas de page | 🟠 Moyenne |
| **Rapports Financiers** | ❌ Aucun service | ❌ Pas de page | 🟠 Moyenne |
| **PDF Generation** | ❌ Service non créé | ❌ — | 🟠 Moyenne |
| **Email Automation** | ❌ Service non créé | ❌ Pas de config | 🟡 Basse |
| **Fiches de paie** | ❌ Aucun service | ❌ — | 🟡 Basse |

---

## 🚨 Faiblesses actuelles à corriger AVANT d'ajouter des fonctionnalités

### 1. 🔴 Dashboard vide (route `/`)
**Problème** : La page d'accueil affiche juste "Tableau de bord (En construction)".  
**Impact** : Première impression désastreuse pour l'utilisateur. C'est la page la plus visitée.  
**Solution** : Créer un vrai dashboard avec KPIs (nombre d'élèves, paiements du jour, etc.)

### 2. 🔴 Finance — Onglet "Vue d'ensemble" vide
**Problème** : `FinancePage.tsx` L292-296 — le bloc KPI cards est vide (`{/* KPI Cards would go here */}`).  
**Impact** : L'utilisateur n'a aucun résumé financier.  
**Solution** : Ajouter des cartes KPI (total perçu, impayés, répartition par type).

### 3. ✅ Module Personnel — RÉSOLU
**Statut** : Module complet avec pointage journalier, calcul salaire hybride (quota/heures), lien Finance.  
**Détail** : `daily_attendance` (pointage jour par jour), `AttendanceCalendar` (grille mensuelle), calcul mensuel = `salaire ÷ quota × heures_faites`, création auto `cash_journal` au paiement.

### 4. 🔴 Aucun repository/handler Notes/Grades  
**Problème** : Les tables `subjects` et `grades` existent en DB mais il n'y a **aucun repository** ni **handler** ni **preload channel**.  
**Impact** : Module notes/bulletins complètement bloqué.

### 5. 🟠 Pas de Zustand store pour Grades, Events (Personnel ✅)
**Problème** : `usePersonnelStore` existe maintenant. Restent `useGradeStore` et `useEventStore` à créer.  
**Impact** : Events fait encore des appels IPC directs sans store centralisé.

### 6. 🟠 Aucun service PDF
**Problème** : `jspdf` est installé dans les dépendances, mais aucun `pdf.service.ts` n'existe.  
**Impact** : Impossible de générer bulletins, fiches de paie, certificats (l'UI du CertificatePage existe mais le PDF backend non).

### 7. 🟠 Aucun service Email  
**Problème** : `nodemailer` est installé mais aucun `email.service.ts` n'existe.  
**Impact** : L'envoi automatique du bilan journalier ne fonctionne pas.

### 8. 🟡 Styles directory vide
**Problème** : `src/renderer/src/styles/` est un répertoire vide. Pas de `globals.css`.  
**Impact** : Les styles Tailwind doivent être importés ailleurs (probablement dans index.html ou main.tsx).

### 9. 🟡 Fichiers de debug/diagnostic traînent à la racine
**Problème** : `check_email.js`, `check_fees.js`, `debug_fees.js`, `debug_fees_repro.ts`, `diag_log.txt`, `nul`, `output.txt` — fichiers de debug en vrac.  
**Impact** : Code sale, risque d'inclusion dans le build.

### 10. 🟡 Layout components directory vide
**Problème** : `src/renderer/src/components/layout/` est vide.  
**Impact** : Le layout (Sidebar, Header, etc.) est directement dans `App.tsx` au lieu d'être modularisé.

### 11. 🟡 Types directory vide (renderer)  
**Problème** : `src/renderer/src/types/` est vide. Tous les types sont dans `shared/types.ts`.  
**Impact** : Mineur mais manque de séparation front-specific types.

---

## 📋 Plan d'implémentation pas à pas

### Phase 0 : Nettoyage & Consolidation (priorité immédiate)

> [!IMPORTANT]
> Ces tâches doivent être faites AVANT tout ajout de fonctionnalité pour partir sur une base saine.

#### 0.1 Nettoyage de la racine
- Supprimer ou déplacer les fichiers de debug : `check_email.js`, `check_fees.js`, `debug_fees.js`, `debug_fees_repro.ts`, `diag_log.txt`, `nul`, `output.txt`
- Ajouter au `.gitignore` : `output.txt`, `diag_log.txt`, `nul`

#### 0.2 Modularisation du Layout
- Extraire `Sidebar` de `App.tsx` → `components/layout/Sidebar.tsx`
- Extraire `Layout` de `App.tsx` → `components/layout/MainLayout.tsx`  
- Extraire `ErrorBoundary` → `components/shared/ErrorBoundary.tsx`
- Garder `App.tsx` léger (juste Router + AuthInit + routes)

#### 0.3 Vérification des styles
- S'assurer que le CSS Tailwind est correctement chargé (vérifier `index.html` et `main.tsx`)

---

### Phase 1 : Dashboard fonctionnel 🔴

#### 1.1 Backend — Endpoints Dashboard
- **[NEW]** `src/main/ipc/dashboard.handler.ts`
  - `dashboard:getStats` → nombre d'élèves actifs, paiements du jour/semaine/mois, impayés, prochains événements
  - Requêtes SQL agrégées sur students, student_payments, parent_events

#### 1.2 Frontend — Page Dashboard  
- **[NEW]** `src/renderer/src/pages/DashboardPage.tsx`
  - Cartes KPI : Élèves inscrits, Paiements du jour, Impayés, Personnel actif
  - Graphique de tendance des paiements (derniers 30 jours)
  - Liste des alertes (impayés critiques, événements à venir)
  - Activité récente (derniers paiements, inscriptions)

#### 1.3 Preload — Channel Dashboard
- Ajouter `dashboard` dans preload/index.ts et index.d.ts

---

### Phase 2 : Module Personnel complet ✅

#### 2.1 Backend
- **[DONE]** `src/main/database/repositories/personnel.repository.ts`
  - CRUD personnel (create, list, get, update, delete/soft-delete)
  - **Daily attendance** (pointage journalier : getMonthly, set, delete)
  - Time tracking (fallback legacy get/set)
  - Absences (CRUD)
  - Salary advances (CRUD)
  - Custom deductions (CRUD)
  - **Calcul de salaire hybride** :
    - Mensuels : `taux = salaire ÷ quota_heures`. Déduction si sous-quota, heures sup si au-dessus.
    - Horaires : `heures × taux`. Fallback time_tracking si pas de pointage.
  - **Lien Finance** : `createSalaryExpense` → entrée `cash_journal` (dépense salaire)

- **[DONE]** `src/main/ipc/personnel.handler.ts`
  - Tous les channels : `personnel:create`, `personnel:list`, `personnel:get`, `personnel:update`, `personnel:delete`
  - `personnel:getTimeTracking`, `personnel:setTimeTracking`
  - `personnel:getAbsences`, `personnel:createAbsence`
  - `personnel:getAdvances`, `personnel:createAdvance`
  - `personnel:calculateSalary`
  - **NEW** : `personnel:getMonthlyAttendance`, `personnel:setAttendance`, `personnel:deleteAttendance`
  - **NEW** : `personnel:createSalaryExpense`

#### 2.2 Frontend
- **[DONE]** `src/renderer/src/pages/personnel/PersonnelList.tsx`
- **[DONE]** `src/renderer/src/pages/personnel/PersonnelForm.tsx` (ajout champs planning de travail)
- **[DONE]** `src/renderer/src/pages/personnel/PersonnelDetail.tsx` (onglets : Informations, **Pointage**, Absences, Salaire)
- **[DONE]** `src/renderer/src/components/personnel/AttendanceCalendar.tsx` (grille mensuelle jour par jour)
- **[DONE]** `src/renderer/src/store/usePersonnelStore.ts`

#### 2.3 Preload + Routes
- **[DONE]** `personnel` + daily attendance + salary expense dans preload (`index.ts`, `index.d.ts`, `env.d.ts`)
- **[DONE]** Routes dans `MainLayout.tsx`

---

### Phase 3 : Module Notes & Bulletins 🔴

#### 3.1 Backend
- **[NEW]** `src/main/database/repositories/grade.repository.ts`
  - CRUD subjects (matières)
  - CRUD grades (notes)
  - Calcul moyennes (par élève, par classe, par trimestre)
  - Classement (rang)

- **[NEW]** `src/main/ipc/grade.handler.ts`
  - `grade:setGrades`, `grade:getGrades`  
  - `grade:listSubjects`, `grade:createSubject`
  - `grade:calculateAverages`, `grade:getClassRanking`

#### 3.2 Frontend
- **[NEW]** `src/renderer/src/pages/grades/GradeEntry.tsx` (saisie de notes par classe/matière)
- **[NEW]** `src/renderer/src/pages/grades/GradeBook.tsx` (vue par élève ou par classe)
- **[NEW]** `src/renderer/src/pages/grades/ReportCardView.tsx` (aperçu bulletin)
- **[NEW]** `src/renderer/src/store/useGradeStore.ts`

---

### Phase 4 : Finance — Compléter le module 🟠

#### 4.1 Finance KPI Cards
- Compléter `FinancePage.tsx` onglet "Vue d'ensemble" :
  - Total recettes du mois
  - Total dépenses du mois
  - Solde de caisse
  - Répartition par type de paiement (pie chart ou barres)
  - Taux de recouvrement écolage

#### 4.2 Journal de Caisse  
- **[NEW]** `src/main/database/repositories/cashjournal.repository.ts`
- **[NEW]** `src/main/ipc/cashjournal.handler.ts`
  - `cashjournal:create`, `cashjournal:list`, `cashjournal:getBalance`
  - `cashjournal:dailyReport`, `cashjournal:monthlyReport`
- **[NEW]** `src/renderer/src/pages/finance/CashJournalPage.tsx`
  - Saisie de dépenses/recettes
  - Filtres par date, catégorie
  - Totaux et solde

#### 4.3 Alertes de Paiement  
- **[NEW]** `src/renderer/src/pages/finance/PaymentAlerts.tsx`
  - Liste des élèves avec mois impayés
  - Filtrable par classe, niveau de retard

---

### Phase 5 : Génération PDF 🟠

#### 5.1 Service PDF
- **[NEW]** `src/main/services/pdf.service.ts` (utilisant jsPDF)
  - `generateCertificate()` — Certificat de scolarité
  - `generateReportCard()` — Bulletin de notes
  - `generatePayslip()` — Fiche de paie
  - `generateDailyReport()` — Bilan journalier
  - `generateReceipt()` — Reçu de paiement

#### 5.2 IPC + Frontend
- Ajouter channels `pdf:generateCertificate`, `pdf:generateReportCard`, etc.
- Boutons "Générer PDF" dans les pages respectives
- Prévisualisation PDF dans une modale

---

### Phase 6 : Service Email 🟡

#### 6.1 Backend
- **[NEW]** `src/main/services/email.service.ts`
  - Configuration SMTP Gmail
  - Envoi automatique du bilan à 18h
  - Envoi manuel depuis la page paramètres

#### 6.2 Frontend
- **[NEW]** `src/renderer/src/pages/settings/EmailSettings.tsx`
  - Configuration adresse Gmail, App Password
  - Adresse du directeur
  - Toggle envoi automatique
  - Bouton test

---

### Phase 7 : Rapports & Export 🟡

- Rapports financiers mensuels (avec export PDF)
- Rapports de personnel (présences, salaires)
- Export CSV/Excel des listes

---

## Open Questions

> [!IMPORTANT]
> **Avant de commencer, j'ai besoin de tes réponses sur ces points :**

1. **Par quelle phase veux-tu qu'on commence ?** Je recommande Phase 0 (nettoyage) puis Phase 1 (Dashboard) car c'est la première chose que l'utilisateur voit.

2. **Les données de test** : Y a-t-il déjà des élèves/paiements dans la base SQLite pour tester ? Ou faut-il créer un script de seed ?

3. **Personnel — niveaux de détail** : Le module personnel doit-il être aussi complet que décrit dans le prompt (CNAPS, IRSA, fiche de paie, heures) dès la première itération, ou on fait un CRUD basique d'abord ?

4. **Notes — format bulletins** : As-tu un template/scan du bulletin du lycée à reproduire, ou on part sur un format standard ?

5. **Le module Finance** actuel mélange "Paiements des élèves" et "Configuration des tarifs" dans la même page. Veux-tu garder cette organisation, ou séparer en pages distinctes ?

---

## Verification Plan

### Automated Tests
- Après chaque phase : `npm run typecheck` pour s'assurer que le TypeScript compile
- `npm run dev` pour vérifier que l'app démarre sans erreur
- Tests manuels via le browser subagent pour valider les interfaces

### Manual Verification
- Vérification visuelle de chaque nouvelle page
- Test des flux CRUD complets (créer → lire → modifier → supprimer)
- Test des permissions RBAC sur chaque nouveau module
- Vérification de la sync Supabase pour les nouvelles tables
