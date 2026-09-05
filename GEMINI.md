# CONSIGNES GEMINI / ANTIGRAVITY - RÈGLES DE SÉCURITÉ DU PROJET LMS

## RÈGLES DE DÉVELOPPEMENT OBLIGATOIRES

1. **AUCUN ÉCRASEMENT DES CONFIGURATIONS UTILISATEUR** :
   - Ne jamais écraser ou réinitialiser les configurations financières (`finance_prices` : axes de transport, tarifs d'uniformes, grille d'écolage) avec des valeurs d'usine ou par défaut.
   - Les modifications ou migrations doivent être additives et utiliser le `deep-merge`.
   - Respecter les tombstones (`deletedBusRoutes`, `deletedUniformItems`) lors des fusions de synchro pour que les suppressions confirmées par l'utilisateur ne soient jamais ressuscitées.

2. **CONSULTATION SYSTÉMATIQUE DU DÉVELOPPEUR** :
   - Pour toute action touchant aux tables financières, aux flux de synchronisation Supabase ou aux structures de base de données, questionner obligatoirement le développeur avant de modifier ou d'exécuter du code.

3. **HISTORISATION ET TRAÇABILITÉ** :
   - Toute modification de paramètre est tracée dans `settings_history`.
   - Les numéros de reçus doivent strictement respecter le format `REC-YYYY-C<station>-XXXXX`.
