# Pages Boursorama de test

| Fichier | Origine | Cas testé |
|---|---|---|
| `verticale_0P.html` | Fiche réelle `0P0001CB5C` (Palatine Monétaire CT R), enregistrée le 13/10/2026 | Mise en page verticale, identifiant `0P…`, tableau « fonds partenaires » à ignorer |
| `verticale_MP.html` | Fiche réelle `MP-829413` (Carmignac Patrimoine A), enregistrée le 13/10/2026 | Identifiant `MP-…`, 10 ans renseigné, valeurs négatives |
| `horizontale.html` | Dérivée de `verticale_0P.html` : les deux tableaux du fonds sont réécrits en mise en page horizontale (périodes en colonnes, ligne FONDS), avec les mêmes valeurs | Mise en page horizontale (en place jusqu'au 04/10/2026) |
| `sans_performances.html` | Dérivée de `verticale_0P.html` : les deux tableaux du fonds sont retirés | Fonds sans tableau de performances |
| `ticks_0P0001CB5C.json` | Réponse réelle de `GetTicksEOD` (5 ans), enregistrée le 13/10/2026 | Historique mensuel |

Les pages sont allégées (scripts, images et indentation retirés) sans changer ce que le parseur en lit.

Aucune page horizontale réelle n'a été conservée avant le changement de Boursorama du 05/10/2026 : d'où la page dérivée. Si Boursorama change encore sa mise en page, enregistre la nouvelle fiche ici et ajoute le test correspondant.
