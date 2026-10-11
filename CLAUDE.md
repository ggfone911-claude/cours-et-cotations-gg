# CLAUDE.md — Cours et Cotations GG

Ce fichier donne les règles de travail sur ce dépôt. La spécification complète est dans `CAHIER_DES_CHARGES.md` : lis-la avant toute modification importante.

## Le projet en bref
Site statique public (GitHub Pages, `ggfone911-claude/cours-et-cotations-gg`) qui suit les VL et les performances des fonds Conservateur Finance, relevées chaque jour sur Boursorama par GitHub Actions. On y trouve aussi des portefeuilles modèles et personnels et un simulateur de projection. Utilisateur : Guillaume, conseiller en gestion de patrimoine, non développeur. **Tu lui parles en français, simplement, sans jargon.**

## Commandes
- Tests Python : `pytest -q`
- Tests JS : `node --test tests/js`
- Validation des données : `python scripts/validate.py`
- Relevé quotidien en local : `python scripts/scrape_daily.py` (le réseau peut être bloqué en dehors de GitHub Actions ; dans ce cas, lance le workflow avec `gh workflow run daily.yml`)
- Prévisualisation : `python -m http.server -d site 8000` (copie d'abord `data/*.json` dans `site/data/`)

## Règles impératives
1. **Jamais de chiffre inventé ni de repli silencieux.** Une donnée manquante vaut `null` et s'affiche `—`.
2. **Jamais de `continue-on-error`** dans les workflows. Les scrapers sortent avec le code 1 et ne modifient pas les fichiers de données si le relevé est vide, inférieur à 60 %, périmé de plus de 8 jours, ou si la performance 1 an manque sur plus de 50 % des fonds.
3. **Parseurs Boursorama :** lis les libellés d'en-tête, jamais des positions fixes. Gère la mise en page horizontale (ligne FONDS) et la verticale (colonne FONDS). Ignore le tableau « fonds partenaires ». Toute modification du parseur s'accompagne d'une page de test dans `tests/fixtures/`.
4. **`eom` (fin de mois) a une à deux semaines de retard** au début de chaque mois (Morningstar). C'est normal : ne le « corrige » pas. Pour les contrôles croisés, utilise `gli`.
5. **Les courbes de VL viennent uniquement de `history.json`**, rebasées à 100 sur une date commune. Jamais à partir des colonnes de performances.
6. **Données métier dans `data/*.json`**, jamais dans le code : fonds, portefeuilles, grille du fonds en euros.
7. **Ne supprime jamais un fonds faute de données.** Mets-le en `pending` (badge « En attente »).
8. **Ne décide pas à la place de Guillaume** sur les points ouverts (section 11 du cahier des charges) : SRRI ou SRI, parts D, taux du fonds en euros. Pose la question.
9. Le site n'a ni build ni framework. Dépendances dans `site/vendor/` avec une version fixe. Les données sont insérées dans le DOM avec `textContent`.
10. Le dépôt `ggfone911-claude/conservateur-fonds` est **en lecture seule** : on le consulte, on n'y pousse jamais, sauf au lot 7 (bascule), et seulement avec l'accord explicite de Guillaume.
11. Pour vérifier si le site est à jour, `git fetch` puis contrôle `origin/main` et le site en ligne, pas le fichier local.

## Façon de travailler
- Avance **lot par lot** (section 9 du cahier des charges). À la fin de chaque lot : tests verts, commit avec un message clair en français, résumé de 5 lignes maximum pour Guillaume, puis attends sa validation.
- Messages de commit des workflows : « Relevé VL — JJ/MM/AAAA HH:MM » et « Historique mensuel — JJ/MM/AAAA ».
- Avant de pousser : `pytest`, `node --test` et `validate.py` doivent passer.
- Mentions légales obligatoires en pied de page et sur chaque impression (texte exact : section 5.7 du cahier des charges).
