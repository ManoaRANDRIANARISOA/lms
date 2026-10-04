# Journal des Modifications (Release Notes) — LMS École

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/) et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

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
