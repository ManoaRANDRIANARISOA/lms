# Note de version 2.4.0 — LMS École
**Lycée Manjary Soa — 16 novembre 2026**

## Fiabilité renforcée de la synchronisation, des impayés et des clôtures de caisse

Cette version consolide la fiabilité du logiciel dans ses conditions réelles
d'exploitation : plusieurs postes, connexion intermittente, saisies quotidiennes
nombreuses. Elle corrige les écarts constatés et intègre des mécanismes de
récupération automatique, **sans jamais effacer de données**.

---

## Contexte des écarts constatés

Les divergences observées entre postes (élèves payés affichés impayés, écarts de
caisse, doublons) résultent de la combinaison de deux facteurs :

1. **Une limite technique de synchronisation, aujourd'hui corrigée.** Un défaut
   de schéma bloquait silencieusement la reprise des données entre postes après
   une interruption. Le flux inter-postes est désormais rétabli intégralement.

2. **Des conditions d'exploitation réelles.** Coupures de connexion en cours de
   synchronisation, saisies effectuées simultanément sur plusieurs postes,
   doublons d'élèves ou de paiements, interventions manuelles sur les fiches :
   ces situations, normales dans un environnement multi-postes connecté de façon
   intermittente, produisaient des écarts que les versions précédentes ne
   savaient pas résorber automatiquement.

La version 2.4.0 traite ces deux facteurs : elle corrige la limite technique et
rend le logiciel **tolérant aux aléas d'exploitation**, avec une récupération
automatique et une résolution assistée et tracée.

---

## Ce que la version 2.4.0 apporte

### Synchronisation multi-postes
- Reprise **automatique et complète** de la synchronisation après une coupure.
- Tableau de bord de **cohérence inter-postes** : visibilité en direct des écarts
  entre chaque caisse et la référence Cloud.

### Impayés et tarifs
- Page *Alertes impayés* corrigée et fiabilisée (calcul unifié fiche élève ↔ liste).
- **Protection des tarifs d'écolage** : les tarifs négociés et les gratuités
  accordées aux élèves sont **préservés**. Le logiciel ne réécrit plus jamais un
  tarif automatiquement : tout écart avec la grille standard est **soumis à votre
  décision**, élève par élève, avec une recommandation claire.

### Clôture de caisse
- Clôture **journalière par poste et par compte** : chaque comptable clôture les
  opérations de son compte sur son poste du jour.
- **Toutes les opérations sont comptabilisées**, y compris les dépenses sans reçu
  (rattachées au bon caissier) : plus de dépenses « disparues » du bilan.
- **Verrouillage des journées clôturées** (Ticket Z) : une caisse scellée ne peut
  plus être modifiée sans déverrouillage formel, garantissant l'intégrité de
  l'historique comptable.

### Traçabilité et résolution assistée
- Onglet **Traçabilité des paiements** : visibilité complète sur les écritures
  actives et supprimées.
- **Assistant de cohérence** : il détecte les doublons et écritures orphelines,
  explique chaque cas et propose une correction. **Aucune suppression automatique** :
  les cas évidents sont corrigés en un clic, les cas ambigus restent soumis à
  votre arbitrage. Chaque action est historisée.

---

## Recommandations d'exploitation

Pour garantir la fiabilité dans la durée :

- **Configurer le code poste** (`pos_station_code`) sur chaque machine
  (ex. C1, C2, C3…). C'est indispensable pour la clôture par poste.
- **Privilégier un compte par opérateur** et éviter les saisies simultanées d'un
  même élève sur plusieurs postes.
- **Laisser la synchronisation se terminer** avant d'éteindre un poste. En cas de
  coupure, la version 2.4.0 reprend automatiquement au redémarrage.
- **Renseigner les secrets** du rapport financier quotidien (dépôt GitHub) pour
  assurer l'envoi automatique du bilan.

---

## Engagement

Aucune donnée existante n'est effacée ou renumérotée par cette version. Les reçus
émis conservent leur numérotation d'origine. Toute correction est proposée,
expliquée, tracée et propagée au Cloud uniquement après confirmation réelle.