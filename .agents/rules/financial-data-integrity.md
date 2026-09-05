# RÈGLE ABSOLUE D'INTÉGRITÉ DES DONNÉES & PROTECTION FINANCIÈRE (LMS ÉCOLE)

> **STATUT : OBLIGATOIRE ET STRICTEMENT CONTRAIGNANT POUR TOUT AGENT IA OU ASSISTANT DE DÉVELOPPEMENT**  
> Tout agent IA (Antigravity, Gemini, Claude, Copilot, Cursor, etc.) opérant sur ce projet DOIT respecter scrupuleusement ces règles sous peine de faute critique.

---

## 1. INTERDICTION FORMELLE DE RÉINITIALISATION OU D'ÉCRASEMENT DES CONFIGURATIONS
* **Zéro écrasement par défaut :**  
  Aucun script, aucune migration SQL (`migrations/`), ni aucun service TypeScript ne doit JAMAIS écraser ou réinitialiser la table `settings` (particulièrement la clé `finance_prices`) avec des données par défaut d'usine (ex: réinitialiser les bus à `Zone 1, 2, 3` ou effacer les articles d'uniformes créés par l'utilisateur).
* **Préservation des ajouts utilisateurs :**  
  Les zones de transport personnalisées (ex: `ambodivodava B`, `Tsilazaina`, etc.), les tarifs d'écolage personnalisés et les articles d'uniformes saisis par la Directrice ou l'équipe comptable sont des données de production sacrées.
* **Migrations non-destructives :**  
  Toute migration future ajoutant ou ajustant des clés de paramètres doit utiliser :
  - `INSERT OR IGNORE` sur les clés manquantes.
  - Interdiction formelle d'exécuter des `UPDATE settings SET value = '...'` globaux ou monolithiques sans fusion préalable.

---

## 2. CONSULTATION ET VALIDATION PRÉALABLE DU DÉVELOPPEUR
* **Questionner avant toute action financière structurelle :**  
  Avant de toucher, migrer, purger ou restructurer quoi que ce soit dans :
  - Le module Finance (`finance_prices`, `student_fees`, `student_payments`, `cash_journal`).
  - Les tables d'élèves (`students`).
  - La logique de synchronisation Supabase ↔ SQLite.
  l'agent IA **DOIT OBLIGATOIREMENT** poser des questions au développeur / utilisateur, expliquer les impacts et obtenir une validation explicite avant d'écrire ou d'exécuter le code.
* **Interdiction des opérations de purge silencieuse :**  
  Aucune instruction destructive (`DROP TABLE`, `TRUNCATE`, `DELETE FROM settings`, `DELETE FROM student_payments`) ne doit être insérée ou exécutée sans confirmation explicite.

---

## 3. PRINCIPES DE SYNCHRONISATION MULTI-PC NON-DESTRUCTIVE (OFFLINE-FIRST)
* **Fusion Profonde (Deep-Merge) avec Tombstones :**  
  La synchronisation bidirectionnelle de `finance_prices` doit toujours effectuer une fusion intelligente :
  - Union des listes d'axes (`busRoutes`) et d'uniformes (`uniformItems`).
  - Respect des suppressions explicites enregistrées dans `deletedBusRoutes` et `deletedUniformItems` (tombstones) afin d'éviter la résurrection d'éléments supprimés intentionnellement.
  - En cas de conflit de tarif, priorité systématique aux montants positifs (`> 0`) pour interdire tout écrasement à `0 Ar`.
* **Historisation obligatoire (`settings_history`) :**  
  Toute modification locale d'un paramètre doit archiver l'ancienne version dans `settings_history` pour permettre un retour arrière immédiat en cas d'erreur.

---

## 4. INTÉGRITÉ COMPTABLE ET SOUVERAINETÉ DES PAIEMENTS
* **Immuabilité des reçus émis :**  
  Tout paiement validé dans `student_payments` est souverain. Son montant et son numéro de reçu officiel (format `REC-YYYY-C<station>-XXXXX`) ne doivent jamais être recalculés ou rétrogradés d'après la configuration actuelle des tarifs.
* **Renommage assisté :**  
  Si une zone de transport est renommée dans l'application, l'application doit répercuter le renommage dans `student_fees` pour les élèves abonnés afin de garantir la continuité de leur facturation sans rupture.
