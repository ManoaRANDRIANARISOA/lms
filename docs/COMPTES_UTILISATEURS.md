# Gestion des Comptes Utilisateurs — Lycée Manjary Soa LMS

## Compte par Défaut (Seed Migration 004)

Un seul compte est créé automatiquement lors de la première installation :

| Nom d'utilisateur | Mot de passe | Rôle |
|-------------------|--------------|------|
| `admin` | `admin123` | Administrateur |

> ⚠️ **IMPORTANT** : Connectez-vous immédiatement avec ce compte et changez le mot de passe via **Utilisateurs → Modifier → Mot de passe**.

---

## Création des Comptes par Rôle

### Workflow recommandé (première mise en production)

1. Se connecter : `admin / admin123`
2. Naviguer vers **Utilisateurs** (menu latéral)
3. Cliquer **+ Nouvel utilisateur** pour chaque membre du personnel
4. Assigner le rôle approprié selon la matrice ci-dessous
5. Communiquer le mot de passe initial à l'utilisateur
6. L'utilisateur peut changer son propre mot de passe via son profil

### Comptes de test / développement

Exécuter ce SQL sur la base de données locale pour créer des comptes de test (mot de passe initial : `admin123`) :

```sql
-- Hash bcrypt (cost 10) pour 'admin123'
-- Généré avec: bcryptjs.hashSync('admin123', 10)
-- Hash: $2b$10$2VK2TkuYDUBo2imZ2.Mw2uFP2VDLYPYTA3ftqtK87FkUtzZuDBYxi

INSERT OR IGNORE INTO users (id, username, password_hash, role, full_name, email, active, version, sync_status, deleted)
VALUES 
  (
    '00000000-0000-0000-0000-000000000002',
    'secretariat',
    '$2b$10$2VK2TkuYDUBo2imZ2.Mw2uFP2VDLYPYTA3ftqtK87FkUtzZuDBYxi',
    'secretariat',
    'Test Secrétariat',
    'secretariat@manjary.mg',
    1, 1, 'pending', 0
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'comptable',
    '$2b$10$2VK2TkuYDUBo2imZ2.Mw2uFP2VDLYPYTA3ftqtK87FkUtzZuDBYxi',
    'accounting',
    'Test Comptabilité',
    'comptable@manjary.mg',
    1, 1, 'pending', 0
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'direction',
    '$2b$10$2VK2TkuYDUBo2imZ2.Mw2uFP2VDLYPYTA3ftqtK87FkUtzZuDBYxi',
    'direction',
    'Test Direction',
    'direction@manjary.mg',
    1, 1, 'pending', 0
  );
```

> 💡 Ces comptes peuvent aussi être créés directement depuis l'interface **Utilisateurs** après la connexion admin.

---

## Matrice des Permissions (Avenant RBAC)

| Module | Ressource | Admin | Secrétariat | Comptabilité | Direction |
|--------|-----------|:-----:|:-----------:|:------------:|:---------:|
| Fiches Élèves | `students` | ✅ R/W | ✅ R/W | 👁 Lecture | ✅ R/W |
| Paiements | `payments` | ✅ R/W | 👁 Lecture | ✅ R/W | ✅ R/W |
| Pointage Bus/Cantine | `attendance` | ✅ R/W | ✅ R/W | 👁 Lecture | 👁 Lecture |
| Notes & Bulletins | `grades` | ✅ R/W | ✅ R/W | ❌ Aucun | 👁 Lecture |
| Journal de Caisse | `cash_journal` | ✅ R/W | ❌ Aucun | ✅ R/W | 👁 Lecture |
| Salaires & Personnel | `personnel` | ✅ R/W | ❌ Aucun | ✅ R/W | 👁 Lecture |
| Rapports Financiers | `reports` | ✅ R/W | ❌ Aucun | ✅ R/W | ✅ R/W |
| Paramètres Système | `settings` | ✅ R/W | ❌ Aucun | ❌ Aucun | 👁 Lecture |
| Gestion Utilisateurs | `users` | ✅ R/W | ❌ Aucun | ❌ Aucun | ❌ Aucun |
| Journal d'Audit | `audit` | ✅ R/W | ❌ Aucun | ❌ Aucun | 👁 Lecture |
| Événements Parents | `events` | ✅ R/W | ✅ R/W | 👁 Lecture | ✅ R/W |

**Légende** : ✅ R/W = Lecture + Écriture | 👁 Lecture = Consultation uniquement | ❌ Aucun = Accès refusé

---

## Politique de Sécurité

### Mots de passe
- Longueur minimale : **8 caractères**
- Format : lettres, chiffres, caractères spéciaux acceptés
- Changement possible à tout moment par l'utilisateur lui-même (via son profil)
- Réinitialisation par l'admin uniquement (sans connaître l'ancien mot de passe)

### Sessions
- Durée de session : **60 minutes** d'inactivité
- Le système surveille l'inactivité et expire automatiquement la session
- Nettoyage automatique des sessions expirées toutes les 10 minutes

### Audit
- Toutes les connexions (réussies et échouées) sont enregistrées
- Toutes les opérations de création/modification/suppression sont tracées
- Les logs sont consultables par l'Admin et la Direction (lecture)

---

## Opérations Admin disponibles

| Opération | Chemin dans l'UI | Rôle requis |
|-----------|------------------|-------------|
| Créer un utilisateur | Utilisateurs → + Nouvel utilisateur | Admin |
| Modifier un utilisateur | Utilisateurs → Modifier | Admin |
| Désactiver un utilisateur | Utilisateurs → Désactiver | Admin |
| Réinitialiser un mot de passe | Utilisateurs → Mot de passe | Admin |
| Consulter les logs d'audit | Journal d'Audit | Admin, Direction |

---

## Architecture SQLite ↔ Supabase

### Principe de fonctionnement

L'application fonctionne en **mode hybride offline-first** :

```
Poste A (Electron)          Cloud (Supabase)          Poste B (Electron)
    SQLite Local    ←——sync——→   PostgreSQL   ←——sync——→    SQLite Local
```

1. **Écriture locale d'abord** : toute modification est d'abord enregistrée en SQLite local
2. **File d'attente de sync** : chaque écriture est ajoutée à la table `sync_queue`
3. **Push vers Supabase** : toutes les 5 minutes, les changements locaux sont envoyés au cloud
4. **Pull depuis Supabase** : les changements distants (autres postes) sont récupérés et appliqués localement
5. **Résolution de conflits** : basée sur `updated_at` — le record le plus récent gagne

### Données synchronisées
- `students`, `student_fees`, `student_payments`
- `personnel`, `grades`, `cash_journal`
- `parent_events`, `event_payments`
- `bus_attendance`, `canteen_attendance`
- `users` (métadonnées uniquement — `password_hash` JAMAIS synchronisé)

### Données NON synchronisées
- `sessions` (locales uniquement, ne persistent pas entre postes)
- `sync_queue` (table de travail interne)
- `audit_logs` (locaux uniquement pour l'instant)

### Sécurité de la sync
- Le `password_hash` est **toujours exclu** lors du push vers Supabase
- Lors du pull d'un nouvel utilisateur cloud, un placeholder `__CLOUD_IMPORT__` est utilisé — l'admin doit réinitialiser le mot de passe localement
- Les photos d'élèves sont uploadées dans Supabase Storage lors de la sync

---

## Modules en cours de développement

Les modules suivants sont planifiés mais pas encore implémentés :

| Module | Statut | Ressource RBAC |
|--------|--------|----------------|
| Tableau de bord | 🚧 En construction | — |
| Personnel & Salaires | 🚧 En construction | `personnel` |
| Notes & Bulletins | 🚧 En construction | `grades` |

Ces modules sont protégés dans la sidebar par le système RBAC existant : les entrées de menu seront visibles uniquement pour les rôles ayant accès à la ressource correspondante dès leur implémentation.