# Cours et Cotations GG

Site de suivi des valeurs liquidatives (VL) et des performances des fonds Conservateur Finance.

**Adresse du site :** https://ggfone911-claude.github.io/cours-et-cotations-gg/

## Ce que fait ce site

- Il affiche chaque jour la VL et les performances des fonds, relevées automatiquement sur Boursorama.
- Il présente les portefeuilles modèles (Prudent, Équilibré, Dynamique) et vos portefeuilles personnels.
- Il propose un simulateur de projection d'un capital dans le temps.

## État d'avancement

Le site est en construction. Il est réalisé par étapes (« lots »), et chaque étape est validée par Guillaume avant de passer à la suivante.

| Étape | Contenu | État |
|---|---|---|
| 0 | Mise en place du dépôt et page « Bientôt disponible » | Validé |
| 1 | Liste des fonds et portefeuilles | Validé |
| 2 | Relevés automatiques Boursorama | Validé |
| 3 | Onglet Fonds | Validé |
| 4 | Portefeuilles modèles | En cours de validation |
| 5 | Portefeuilles perso et simulateur | À faire |
| 6 | Automatisation complète et onglet État | À faire |
| 7 | Bascule depuis l'ancien site | À faire |

L'ancien site (`conservateur-fonds`) continue de fonctionner normalement en parallèle.

## Modifier les données à la main

Trois fichiers du dossier `data/` se modifient sans toucher au reste :

- `funds.json` : la liste des fonds ;
- `portfolios.json` : la composition des portefeuilles modèles ;
- `euro_fund.json` : la grille des taux du fonds en euros et la DOP.

Après une modification, le contrôle automatique sur GitHub vérifie que tout est cohérent (pondérations à 100 %, ISIN valides, SRRI entre 1 et 7…).

### La liste des fonds en chiffres

- **61 fonds relevés** chaque jour sur Boursorama :
  - 51 figurent sur la liste officielle Conservateur Finance du 01/10/2026 ;
  - 10 ont été ajoutés le 08/10/2026.
- **50 fonds affichés** sur le site.
- **11 parts de distribution (D)** sont relevées mais pas affichées, par choix.
- **1 fonds « En attente »** : Lazard Japanese Strategic Equity, car Boursorama ne publie pas encore ses données.

## Mentions légales

Les performances passées ne préjugent pas des performances futures. L'assureur ne s'engage que sur le nombre d'unités de compte et non sur leur valeur. Données issues de Boursorama, fournies à titre informatif, sans garantie d'exactitude. Document établi à titre informatif, ne constitue pas un conseil en investissement.
