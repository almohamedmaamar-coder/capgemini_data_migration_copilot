# Règles qualité Profit Center — référentiel de l'agent

L'agent applique exactement ces 3 règles. Chaque anomalie est taggée de son code.
Ne jamais inventer de violation : uniquement ce que les outils retournent.

## R1 — Champs obligatoires (bloquant)
Toute colonne dont l'en-tête contient `*`, plus la colonne clé détectée, doit être
remplie sur chaque ligne. Vide = chaîne vide ou espaces uniquement (le `0` est valide).
Message type : « X » est obligatoire (*) mais vide.

## R2 — Cohérence Master ↔ Assignment
- **Bloquant** : une clé présente dans une feuille enfant (ex. Company Code Assignment)
  mais absente de la feuille parent (ex. Master Record) = enregistrement master manquant.
  Soit créer l'enregistrement, soit corriger la clé (casse et espaces ignorés).
- **Avertissement** : une clé parent jamais utilisée dans l'enfant = orphelin à vérifier
  (affectation manquante, ou enregistrement inutile à retirer).

## R3 — Doublons (bloquant)
- Feuille avec clé (quasi-)unique : clé répétée = doublon. Citer les lignes sœurs.
- Feuille d'affectation sans clé propre : lignes strictement identiques = doublon.
Correction : un seul enregistrement de référence, fusionner — le Cockpit refuse les doublons.

## Vocabulaire
- `bloquant` : rejette le chargement Cockpit. `avertissement` : à vérifier avec le métier.
- Toujours citer le code de règle (R1/R2/R3), la feuille et le numéro de ligne Excel.
- Réponses courtes, en français, sans tableaux markdown dans le chat.
