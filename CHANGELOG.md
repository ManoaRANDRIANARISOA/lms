# Journal des Modifications (Release Notes) — LMS École

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/) et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [2.3.11] - 2026-10-26

### 🧠 Assistant Visuel Intelligent de Réconciliation, Auto-Guérison Complète de l'Outbox & Parité C3
- **Assistant de Décision Intelligent (`ReconciliationModal.tsx`)** :
  - **Suggestion Sémantique Automatisée (💡 1-Clic)** : Analyse intelligente des libellés (`description`, `notes`) et détection automatique par reconnaissance de tokens du nom de l'élève correspondant dans la base locale (ex: "Ecolage Janvier RANDRIA...").
  - **Détection des Doublons Réels (⚠️ 1-Clic)** : Comparaison instantanée avec les reçus déjà enregistrés (`amount`, `payment_date`/`month`, `payment_type`) avec bouton d'archivage immédiat et traçabilité complète dans l'audit.
  - **Traitement des Écritures Orphelines Irrémédiables** : Détection des écritures dont l'élève n'existe nulle part (élève supprimé définitivement dans le passé) avec option d'archivage ou de conversion comptable en caisse générale autonome (recette diverse).
  - **Correction du Schéma de Création d'Élève** : Correction du bug d'insertion SQL où `class_name` était utilisé au lieu de la colonne réelle SQLite `class` (`table students has no column named class_name`).
  - **Résolution d'Affichage des Classes** : Affichage transparent de la classe résolue (`resolved_class || class_name || class`) dans la liste de sélection d'élèves.
  - **Propagation des Suppressions au Cloud** : En cas d'annulation ou de conversion d'une écriture orpheline, l'ordre de suppression (`action: 'delete'`) est immédiatement transmis à Supabase afin d'éliminer toute divergence fantôme distante.
- **Auto-Guérison Complète de l'Outbox Captive (`runDeepConvergence` v2.3.11)** :
  - **Dépistage & Guérison des Élèves Captifs** : Détection des élèves créés hors-ligne sur les postes (ex: C3) et absents du Cloud avec enfilage prioritaire avant toute transaction dépendante.
  - **Déblocage des Écritures Captives Masquées** : Élimination des faux positifs dans l'inspection de la file d'attente (purge des reliquats `status = 'synced'` non-pending dans `sync_queue` qui empêchaient la réémission des 119 paiements et 145 écritures de C3).
  - **Enfilage des Dépendances Parent-Enfant** : Si un paiement fait référence à un élève local non encore synchronisé sur Supabase, l'élève parent est automatiquement inscrit et poussé en premier afin de garantir le respect des contraintes de clés étrangères Postgres.
  - **Règle d'Or n°4 Sanctuarisée** : Suppression intégrale de tout passage forcé cosmétique à `sync_status = 'synced'` dans `oneTimeSanitizeSyncQueue()`. Remplacement par le ré-enfilage systématique et transparent via `reconcilePendingOutbox()`.
  - **Déclenchement Automatique v2.3.11** : Exécution automatique de la convergence profonde au premier démarrage de la version 2.3.11 sur l'ensemble des machines du réseau scolaire.

## [2.3.10] - 2026-10-26

### 🛡️ Moteur de Convergence Non-Destructif, Parité des Tombstones & Réconciliation Financière Multi-Postes
- **Parité Définitive des Tombstones au PULL (`pullRemoteChanges`)** :
  - Synchronisation systématique de l'état de suppression (`deleted = 1`) depuis Supabase pour les tables clés (`students`, `student_payments`, `cash_journal`, `users`, `subjects`).
  - Éradication des « élèves fantômes ressuscités » sur les postes clients n'ayant pas capté les suppressions dans leur fenêtre PULL de 5 minutes : le nombre d'élèves actifs s'aligne immédiatement sur les 787 élèves officiels.
  - Protection des modifications locales non encore envoyées : si un enregistrement est en attente dans `sync_queue`, la mise à jour locale est préservée.
- **Moteur de Convergence Globale & Auto-Guérison Outbox Sécurisée (`runDeepConvergence`)** :
  - **Rattrapage sélectif paginé des écritures manquantes** : téléchargement par lots de 1 000 enregistrements des paiements et écritures de caisse absents localement avec insertion `INSERT OR IGNORE` (rattrape instantanément les 293 paiements et 427 écritures manquants sur C2).
  - **Captive Outbox Healer non-destructif** : détection algorithmique des enregistrements financiers créés localement hors-ligne mais absents du Cloud (les 76 paiements et 119 lignes de caisse de C3). Ils sont enfilés dans `sync_queue` sous l'action `'create'` afin d'être officiellement reçus et acquittés par Supabase.
  - **Interdiction stricte des faux `'synced'` et purges cosmétiques** : suppression totale des marquages aveugles `sync_status = 'synced'` sans réponse HTTP 200/201 formelle de Supabase.
  - **Auto-convergence au démarrage v2.3.10** : exécution automatique unique de la convergence au premier lancement de la version 2.3.10 sur chaque machine cliente.
- **Réattribution Sémantique des Paiements et Protection Anti-Orphelinat** :
  - Réattribution déterministe par UUID exact de 10 cas d'historique où d'anciens paiements avaient été rattachés à tort à d'autres élèves suite à des renommages manuels de doublons.
  - Soft-delete des 43 paiements et 26 lignes de caisse fictifs associés aux comptes de test historiques (`One RA`, `Pascal Rakoto`, etc.), ramenant les paiements orphelins dans Supabase à exactement zéro.
  - **Sécurisation de la fusion de doublons (`duplicate.handler.ts`)** : réassociation atomique de `student_payments`, `cash_journal` et `student_fees` vers le profil conservé avec inscription immédiate dans `sync_queue`.
- **Règles Métier & Alertes Financières** :
  - **Protection des élèves exonérés (`payment.repository.ts`)** : respect strict de `monthly_tuition = 0`, éliminant les fausses alertes d'arriérés pour les 50 élèves bénéficiant d'une gratuité.
  - **Visibilité universelle des événements scolaires (`event.repository.ts`)** : prise en compte des événements ayant `school_year IS NULL` (ex: `FETES DE NOEL`).
- **Supervision Multi-Postes Avancée (`WorkstationMonitor.tsx`)** :
  - Badges d'écarts colorés en direct (`(+1)`, `(-7)`) comparant chaque caisse à la référence Supabase.
  - Bouton Superadmin `⚡ Convergence Multi-Postes` permettant de déclencher localement la convergence et de diffuser l'ordre à distance `reconcile_all` à l'ensemble du parc.

---

## [2.3.9] - 2026-10-25

### 🛡️ Étanchéité de Synchronisation Multi-Postes & Résolution Déterministe des Collisions
- **Élimination Définitive des Envois Fantômes (Étanchéité du PULL)** :
  - Éradication de la double colonne `sync_status` dans les requêtes SQLite d'insertion lors de la récupération Cloud.
  - Nettoyage rigoureux des enregistrements entrants : `sync_status` est systématiquement forcé à `'synced'` et `last_synced_at` est horodaté lors du PULL, coupant court à la boucle de ré-enfilage dans l'Outbox.
  - Verrouillage de `reconcilePendingOutbox()` : lorsqu'aucun horodatage antérieur n'est connu, application d'une fenêtre de sécurité de 48 heures au lieu d'un parcours aveugle de toute la base.
  - Routine d'auto-nettoyage unique v2.3.9 (`v239_sync_outbox_healed`) purgeant les reliquats d'envois fantômes sur chaque poste client.
- **Résolution Intelligente & Déterministe des Collisions de Matricules au PULL** :
  - Prise en charge transparente des conflits sur `students.registration_number` :
    - *Même élève créé sur deux postes distincts hors-ligne* : détection par identité stricte (nom, prénom), adoption de l'UUID Cloud maître et réassociation atomique de tous les paiements, frais et écritures de journal associés sans aucune perte.
    - *Deux enfants réels différents ayant reçu le même numéro de séquence* : l'élève local conserve son identité et ses encaissements, et reçoit automatiquement le prochain numéro séquentiel libre non conflictuel.
    - Élimination des crashes fatals SQLite `UNIQUE constraint failed: students.registration_number`.
- **Immunisation des Payloads PUSH (Protection Anti-Erreur 22P02)** :
  - Conversion systématique des chaînes vides `""` en `null` pour l'ensemble des clés UUID (`id`, `parent_personnel_id`, etc.), empêchant tout rejet Postgres SQL `22P02`.
- **Sécurisation de la Génération des Matricules à la Création** :
  - Dans `student:create`, interrogation du MAX global Cloud en amont pour attribuer un matricule frais garanti non conflictuel lorsque le poste est en ligne, avec repli local autonome en cas de travail hors-ligne.
- **Résilience Connectivité & Détection Temps Réel sur l'Écran de Connexion (`LoginPage.tsx`)** :
  - Sondage automatique en arrière-plan toutes les 10 secondes : bascule dynamique et instantanée de « Mode Hors-Ligne » à « Connecté Cloud » dès que la machine retrouve Internet, sans nécessiter de redémarrage.
  - Badge cliquable interactif permettant de forcer immédiatement un test de connectivité avec affichage de la latence ou du message d'erreur précis au survol/clic.
  - Ajout d'un repli `fetch` direct dans `checkCloudHealth()` pour confirmer la joignabilité Cloud même en cas de latence DNS ou de micro-coupure du client PostgREST.

---

## [2.3.8] - 2026-10-10

### 📊 Alertes Impayés : Filtrage Mensuel Précis & Export Modulaire Standard
- **Filtre par Mois Spécifique (`PaymentAlerts.tsx`)** :
  - Ajout d'un sélecteur déroulant de mois généré dynamiquement pour l'année scolaire en cours (Septembre à Juillet).
  - Possibilité d'isoler précisément les retards d'écolage, de transport ou de cantine pour un mois donné (ex: *Février 2026*).
  - Isolation automatique des montants : recalcul du montant dû strictement sur le mois sélectionné, avec mention claire de la dette totale si applicable.
  - Désactivation intelligente du filtre « Mois minimum » lors d'un ciblage mensuel pour ne masquer aucun retardataire du mois.
- **Module d'Export Standard Intégré (`DataExportModal.tsx`)** :
  - Bouton d'export direct dans l'en-tête permettant d'exporter les listes filtrées aux formats Excel (.xlsx), CSV, PDF et JSON.
  - Préréglages adaptés au recouvrement mensuel (*Élève, Classe, Type d'impayé, Mois concerné, Montant dû sélection, Dette totale globale*).
  - Nom de fichier d'export horodaté et contextualisé selon les filtres actifs.
- **Enrichissement des Données Backend (`PaymentRepository.getUnpaidAlerts`)** :
  - Ajout du champ explicite `month?: string` (`YYYY-MM`) sur tous les arriérés de services mensuels pour un filtrage direct et performant.

---

## [2.3.7] - 2026-10-08

### 🛡️ Sécurisation Industrielle de Synchronisation & Protection Anti-Régression LWW
- **Verrou Anti-Régression LWW (Last-Write-Wins)** :
  - Dans `pushLocalChanges()`, vérification systématique de l'horodatage Cloud avant tout `upsert`. Si `remote.updated_at > local.updated_at`, le push local est automatiquement rejeté, préservant ainsi les écritures plus récentes enregistrées par d'autres postes clients.
  - Préservation stricte des compteurs et historiques de réimpression des reçus (`print_count`, `last_printed_at`, `last_printed_by`).
- **Inversion Sécurisée du Cycle de Synchronisation** :
  - `pullRemoteChanges()` s'exécute désormais **systématiquement avant** tout envoi ou scan d'outbox, garantissant que chaque poste absorbe la réalité Cloud avant de préparer un éventuel push.
  - Le mode « Forcer la récupération complète » devient 100 % unidirectionnel (Cloud ➔ Local) : aucun push n'est déclenché lors d'une restauration manuelle.
- **Auto-Guérison Outbox Intelligente & Déduplication (`reconcilePendingOutbox`)** :
  - Seules les écritures modifiées localement *après* le dernier `last_sync_time` sont enfilées.
  - Auto-guérison automatique des marqueurs historiques `pending` résiduels vers `synced` sans renvoi inutile au Cloud.
- **Migration 051 & Sanitisation Unique d'Outbox** :
  - Déploiement de `051_heal_and_align_sync_outbox.sql` et de la routine runtime `oneTimeSanitizeSyncQueue()` pour assainir automatiquement l'ensemble des postes clients dès le démarrage de la version 2.3.7.

---

## [2.3.6] - 2026-10-05

### 🛡️ Élimination Définitive des Fausses Quarantaines & Synchronisation Totale
- **Nettoyage Automatique Intégré (`compactSyncQueue` & `publishWorkstationHeartbeat`)** :
  - Purge automatique des tables de structure (`class_subjects`, `subjects`) de la file d'attente locale à chaque battement de cœur et démarrage d'application.
  - Dissolution instantanée des 14 écritures coincées en quarantaine sur PC 5 et des blocages de matières sur PC 1.
- **Précision Complète de l'Assistant de Réconciliation (`ReconciliationModal.tsx`)** :
  - Rendu fidèle et direct des véritables informations financières (numéro de reçu, montant réel, nom de l'élève rattaché, classe).
  - Élimination des affichages trompeurs "Toutes les écritures sont réconciliées" en présence de reliquats techniques.

---

## [2.3.5] - 2026-10-05

### 🛡️ Résolution Structurelle Matières & Clarté Quarantaine
- **Harmonisation Automatique des Identifiants Matières (`subjects` & `class_subjects`)** :
  - Détection et remapping automatique des anciens identifiants (`b0000000...`) vers les identifiants officiels Supabase (`subj-...`) sur les liaisons de classe et carnets de notes.
  - Élimination des rejets PostgreSQL `subjects_name_key` (23505) et `class_subjects_subject_id_fkey` (23503).
  - Purge des tables structurelles de la file d'attente locale pour empêcher tout blocage ou mise en quarantaine erronée.
- **Précision de l'Assistant de Réconciliation** :
  - Focalisation stricte sur les véritables écritures financières orphelines (paiements et mouvements de caisse).
  - Élimination des fausses alertes d'incohérences.

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
