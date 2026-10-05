# Journal des Modifications (Release Notes) — LMS École

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/) et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [2.3.4] - 2026-10-05

### 🚀 Nouveautés & Auto-Guérison Multi-Postes
- **Compaction & Idempotence de la File de Synchronisation (`sync.service.ts`)** :
  - Élimination définitive de l'inflation exponentielle des écritures en erreur (passant de 22 à 44/132 blocages).
  - Déduplication stricte dans `addToSyncQueue` : actualise la charge utile existante plutôt que de créer des lignes orphelines.
  - Fonction `compactSyncQueue` pour purger les doublons au démarrage de chaque cycle.
- **Auto-Guérison des Types PostgreSQL (`grades.deleted`)** :
  - Conversion automatique des booléens (`"false"`) en entiers (`0` ou `1`) sur le champ `deleted` de la table `grades` pour éliminer l'erreur PostgreSQL `22P02`.
- **Résolution Automatique des Matières & Clés Étrangères (`class_subjects` & `subjects`)** :
  - Résolution proactive des contraintes `class_subjects_subject_id_fkey` et `subjects_name_key` (23505) en créant ou adoptant l'identifiant distant Supabase avant d'enchaîner l'insertion.
- **Assistant Visuel de Réconciliation des Écritures (`ReconciliationModal.tsx` & `sync.handler.ts`)** :
  - Correction du format de réponse IPC permettant l'affichage effectif des écritures en quarantaine et orphelines avec leurs options de rattachement ou conversion.
- **Pilotage Administratif à Distance (`station_command`)** :
  - Diffusion de l'ordre global `reconcile_all` depuis la Matrice de Convergence vers tous les postes connectés.
  - Déduplication des postes dans le moniteur de télémétrie par empreinte matérielle (`hostname`).
  - Purge directe des journaux d'erreurs historiques sur Supabase.

---

## [2.3.3] - 2026-10-04

### 🚀 Nouveautés & Architecture Système
- **Moteur d'Auto-Guérison Outbox (`reconcilePendingOutbox` dans `sync.service.ts`)** :
  - Découverte et réenfilage automatique au démarrage et avant chaque synchro de toute écriture locale restée en `sync_status = 'pending'` mais absente de la file `sync_queue`.
  - Résout définitivement la synchronisation autonome des comptes utilisateurs modifiés (notamment le compte Direction sur PC 1) et de toute modification hors-ligne non indexée sans nécessiter de bricolage manuel.
- **Détecteur Intelligent de Doublons (`duplicate.handler.ts`)** :
  - Élimination des 90% de faux positifs : immunisation totale pour les achats de fournitures et d'uniformes (`uniform`) possédant des reçus distincts.
  - Reconnaissance automatique des paiements d'écolage échelonnés (ex. 25k + 25k = 50k) et des acomptes sur réinscription (ex. 30k + 85k = 115k), ne signalant que les réelles collisions d'encaissement multi-caisses.
- **Enrichissement de la Télémétrie Cloud & Surveillance Multi-Postes (`telemetry.service.ts` & `WorkstationMonitor.tsx`)** :
  - Ajout de l'instantané `blocked_summary` dans le battement de cœur périodique (`station_heartbeat`) publié sur Supabase : permet à l'administrateur de voir à distance sur son propre écran le détail exact des écritures bloquées sur les autres machines (PC 1, PC 2, PC 3).
  - Normalisation unifiée des métriques de file d'attente (pending, bloqués, quarantaine) dans le moniteur de convergence et affichage contextuel d'une puce d'alerte pour les enregistrements en difficulté.
  - Déduplication intelligente des alertes d'erreurs (TTL 15 minutes) et filtrage des simples déconnexions réseau pour éviter toute saturation de la base Supabase.
  - Bouton d'accès permanent `[Quarantaine & Incohérences]` intégré dans le bandeau de la Matrice de Convergence avec compteur dynamique en temps réel.
- **Documentation & Pédagogie Visuelle (`GUIDE_UTILISATEUR_LMS.html`)** :
  - Création d'un guide utilisateur HTML complet avec schémas décisionnels SVG interactifs pour la réinscription, la gestion des doublons, la réconciliation en quarantaine et les contrôles quotidiens de caisse.

### 🛡️ Correctifs & Précision Graphique
- **Journal Financier (`FinanceJournal.tsx`)** :
  - Élimination de la double soustraction du padding vertical dans `DetailedFinanceChart`. La ligne zéro en pointillés et la base des barres partagent désormais un repère absolu unifié en pourcentage (`bottom: ${zeroRatio * 100}%`).
- **Résilience & Stabilité Interface Utilisateur (`PaymentAlerts.tsx`)** :
  - Sécurisation des imports critiques (`useClasses`, `cn`), empêchant toute levée d'exception ErrorBoundary lors du rendu du tableau des impayés.
- **Fiabilité TypeScript & Compilation** :
  - Validation à 100% de la compilation `npx tsc --noEmit` et du bundle de production `electron-vite build` (0 erreurs, 0 avertissements bloquants).

---

## [2.3.2] - 2026-10-04

### 🚀 Nouveautés & Améliorations
- **Graphique Chronologique du Journal de Caisse (`FinanceJournal.tsx`)** :
  - Alignement mathématique strict de la ligne zéro en pointillés (`zeroRatio`) sur l'origine des barres de flux positif/négatif.
  - Séparation complète de l'axe des dates dans un conteneur dédié en bas (`h-[26px] border-t border-gray-100`), éliminant tout chevauchement des écritures (ex. `-4 M`, `320 k` avec les numéros de jour).
- **Navigation & Ergonomie des Impayés (`PaymentAlerts.tsx`)** :
  - Suppression de la fausse redirection vers le journal de caisse depuis le module des impayés, maintenant les opérations d'harmonisation groupée au sein de l'espace d'administration financière.
- **Pérennité & Robustesse Multi-Années Scolaires** :
  - Remplacement de toutes les années scolaires codées en dur (`'2026-2027'`) par la résolution dynamique `getDynamicSchoolYear()` et `StudentRepository.getCurrentSchoolYear()` dans l'ensemble des modules (`sync.service.ts`, `payment.repository.ts`, `FinanceTab.tsx`, `ReEnrollModal.tsx`, `ReportsPage.tsx`, `ReceiptDetailModal.tsx`, `FinanceJournal.tsx`).
  - Priorisation de l'année scolaire active de l'établissement dans la fiche élève (`StudentDetail.tsx`) évitant le basculement involontaire vers les années futures lors de pré-inscriptions.

### 🛡️ Assainissement des Données & Intégrité Financière
- **Migration Corrective `050_realign_errant_2028_payments_and_fees.sql`** :
  - Normalisation de la faute typographique `2026_2027` ➔ `2026-2027` (Nomentsoa Urielle Stephanie MAHERINIAINA, rétablissant ses 6 règlements de scolarité, réinscription et FRAM).
  - Réaffectation à l'année en cours `2026-2027` des paiements réels légitimes saisis par mégarde sous l'étiquette `2027-2028` :
    - Écolage septembre 2026 de Christian Henintsoa RAKOTOBE (5ème, `REC-2027-C3-00014`, 50 000 Ar).
    - Écolage octobre 2026 de Tohy Iloniaiko RASOLOFO (CP1, `REC-2027-C2-00010`, 45 000 Ar).
    - Réinscriptions 2026-2027 de Fitahiana ANDRIANIAVO (`REC-2027-C2-00001`, 115 000 Ar) et Andritiana RAZAKAMAHAVONJY (`REC-2027-C1-00001`, 115 000 Ar).
    - Uniformes réels de Hiraina ANDRIAMIHAMISON (30 000 Ar), Salohy RAMBELOHERINIRINA (30 000 Ar) et Tolotra RAKOTOARIVAO (25 000 Ar).
  - Purge des doublons de clics d'essai de juillet/août et des fiches `student_fees` 2027-2028 orphelines, alignée sur SQLite local et Supabase Cloud.

---

## [2.3.1] - 2026-10-04

### 🚀 Nouveautés & Améliorations
- **Module de Réconciliation des Inscriptions / Réinscriptions** :
  - Ajout d'une interface d'harmonisation dans *Paramètres Financiers > Réconciliation Inscriptions/Réinscriptions*.
  - Détection automatique et rectification en un clic des élèves ayant réglé les droits de réinscription (115 000 Ar) enregistrés sous l'intitulé générique d'inscription.
  - Bouton de resynchronisation des tarifs appliquant la grille dynamique centralisée sur les fiches élèves.
- **Documentation & Traçabilité** :
  - Mise en place du fichier officiel `CHANGELOG.md` pour chaque nouvelle version déployée.
  - Intégration native des notes de version dans le modal de mise à jour automatique (`UpdateModal`).

### 🛡️ Correctifs & Intégrité Financière
- **Centralisation Dynamique des Écolages (Single Source of Truth)** :
  - Alignement systématique des tarifs de scolarité sur la configuration centrale `finance_prices` via `StudentRepository.resolveTuitionConfig`.
  - Migration corrective `049_align_student_fees_with_finance_prices.sql` : alignement des classes primaires (CM1 à 45 000 Ar) et secondaires sans altération des configurations sur-mesure.
  - Préservation absolue des enfants de personnel enseignant/administratif (`is_personnel_child` = 0 Ar).
  - Suppression du filtre restrictif `< 10 Ar` dans le module des impayés (`PaymentAlerts`), garantissant l'exactitude des calculs en temps réel.
- **Suivi Élève dans la Gestion Financière (`FinanceTab`)** :
  - Résolution des équivalences de niveaux (ex. CM1 -> Primaire) pour l'affichage de l'écolage mensuel et des compteurs d'en-tête.
  - Confirmation anti-doublon : aucun écolage n'est multiplié par deux et tout mois déjà acquitté reste protégé contre les encaissements redondants.

### 📡 Télémétrie, Synchronisation & Mouchard Supabase
- **Limitation de Débit & Déduplication** :
  - Cache glissant de 15 minutes dans `TelemetryService` évitant le spamming de rapports d'erreurs identiques sur Supabase et dans SQLite local.
  - Suppression de la double journalisation redondante (`LoggerService` + `reportSyncBlockage`).
- **Auto-Guérison des Clés Étrangères (23503)** :
  - Résolution automatique des collisions de matricules (23505) lors de la poussée en amont d'un élève manquant dans Supabase.
  - Mise en quarantaine immédiate des règlements orphelins (élève parent inexistant en local) avec libellé explicite, évitant les blocages en boucle de la file `sync_queue`.
- **Purge et Assainissement Cloud** :
  - Correction de `clearCloudTelemetry` ciblant spécifiquement `action = 'station_error'` (préservant les heartbeats des postes actifs).
  - Purge des 967 alertes d'incidents obsolètes du poste C3 sur Supabase.

---

## [2.3.0] - 2026-10-02

### 🚀 Nouveautés
- **Surveillance des Postes en Direct (Heartbeat Cloud)** :
  - Publication périodique de l'état de chaque machine (PC1, PC2, C3, C4...) avec compteurs de données actives et suivi de la file de synchro.
  - Tableau de bord Superadmin multi-postes avec alertes de divergence et sondes de connectivité.
- **Automatisation Email Brevo Multi-Postes** :
  - Envoi sécurisé des rapports quotidiens et journaux d'encaissement via API Brevo / SMTP avec gestion de bascule réseau.
- **Mise à Jour en Ligne Automatique (Auto-Updater)** :
  - Détection et téléchargement en tâche de fond des nouvelles versions publiées sur GitHub Releases.

---

## [2.2.5] - 2026-09-25

### 🛡️ Correctifs & Améliorations
- Synchronisation bidirectionnelle résiliente hors-ligne.
- Historisation des paramètres dans `settings_history`.
- Numérotation standardisée des reçus thermiques par poste (`REC-YYYY-C<station>-XXXXX`).
- Gestion des tarifs de bus dérogatoires et réductions sur-mesure.
