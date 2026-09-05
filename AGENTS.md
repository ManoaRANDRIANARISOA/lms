# CONSIGNES DE DÉVELOPPEMENT & RÈGLES DE SÉCURITÉ IA (LMS ÉCOLE)

Ce document régit les directives fondamentales pour tout agent IA (Antigravity, Gemini, Claude, Copilot, Cursor) opérant sur le projet LMS École.

## 1. RÈGLE D'OR : INTÉGRITÉ FINANCIÈRE & AUCUN ÉCRASEMENT DE CONFIGURATION
- **NE JAMAIS écraser les données par défaut :** Tout paramètre créé ou modifié par les utilisateurs (axes de transport comme `ambodivodava B`, `Tsilazaina`, uniformes personnalisés, tarifs d'écolage) doit être préservé quoi qu'il arrive.
- **Interdiction de migrations SQL destructives :** Ne jamais créer de migration remplaçant l'objet JSON `finance_prices` par une version d'usine. Utiliser systématiquement `INSERT OR IGNORE` sur les clés manquantes.
- **Deep-Merge obligatoire :** Toute synchronisation cloud ↔ local sur les configurations financières doit fusionner les données sans écraser (union des tableaux, conservation des tarifs non nuls, respect des tombstones `deletedBusRoutes` / `deletedUniformItems`).

## 2. OBLIGATION DE QUESTIONNER LE DÉVELOPPEUR
- Pour toute modification impactant la structure financière, les tables de paiement, les élèves ou les mécanismes de synchronisation, **l'agent DOIT impérativement questionner le développeur avant de modifier ou d'exécuter du code**.
- Ne jamais présumer ou décider unilatéralement d'une réinitialisation de données.

## 3. TRAÇABILITÉ ET REÇUS
- Toute modification de paramètre est historisée dans `settings_history`.
- Les reçus financiers respectent strictement la norme de numérotation par station `REC-YYYY-C<station>-XXXXX`.
