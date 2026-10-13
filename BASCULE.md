# Journal de la bascule (lot 7)

Recette 2 du cahier des charges : pendant 5 jours ouvrés, l'ancien site (`conservateur-fonds`) et le nouveau doivent donner les mêmes chiffres (écart maximal 0,00 point sur les performances, 0,01 % sur la VL).

## Méthode

Chaque fiche Boursorama est téléchargée **une seule fois**, puis lue par l'ancien parseur (`scraper.py` de `conservateur-fonds`, cloné en lecture seule) et par le nouveau. On compare la VL, la date de VL et les performances « fin de mois » et « glissantes » (YTD à 10 ans) des 61 fonds.

Pourquoi pas les deux sites publiés ? Les relevés programmés partent avec plusieurs heures de retard selon GitHub, et Boursorama sert parfois des versions différentes d'une même page à quelques secondes d'intervalle (cache). Deux relevés séparés ne sont donc jamais strictement comparables.

Automatisme : `.github/workflows/compare.yml`, du lundi au vendredi (onglet *Actions* → *Comparaison avec l'ancien site*). Un run vert signifie « identique ».

## Résultats

| Jour | Fonds comparés | Résultat |
|---|---|---|
| 13/10/2026 (lancé depuis le Mac) | 61 / 61 | Identique |

## Après les 5 jours (avec l'accord de Guillaume uniquement)

1. Dans `conservateur-fonds` : renommer `.github/workflows/` en `workflows-desactives/`.
2. Remplacer la page de l'ancien site par une redirection vers https://ggfone911-claude.github.io/cours-et-cotations-gg/.
3. Supprimer `compare.yml` de ce dépôt.
