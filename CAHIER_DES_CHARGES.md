# Cours et Cotations GG — Cahier des charges pour Claude Code

> Ce document décrit tout ce qu'il faut construire. Lis-le en entier avant d'écrire du code, puis travaille lot par lot (section 9), en t'arrêtant à la fin de chaque lot pour faire valider.

---

## 1. Contexte et objectif

**Cours et Cotations GG** est un site web statique, public, qui suit la valeur liquidative (VL) et les performances des fonds (OPC) proposés par Conservateur Finance dans les contrats Le Conservateur. Il sert à un conseiller en gestion de patrimoine (Guillaume Gorge) pour :

- consulter chaque jour les VL et les performances des fonds, classés par catégorie ;
- comparer les fonds (performances, risque SRRI, volatilité, perte maximale) ;
- présenter à ses clients trois **portefeuilles modèles** (Prudent, Équilibré, Dynamique) qui combinent fonds en euros, DOP et unités de compte ;
- construire des **portefeuilles personnalisés** et projeter un capital dans le temps.

Le site **remplace** le dépôt actuel `ggfone911-claude/conservateur-fonds` (site généré par un script Python de 2 800 lignes, `gen_app_v2.py`, qui mélange données, HTML, CSS et JavaScript). La refonte garde **toutes les fonctionnalités et toutes les règles métier éprouvées** de l'existant, mais avec une architecture propre : données en JSON, site statique qui lit ces JSON, scrapers testés, publication automatique.

| Élément | Valeur |
|---|---|
| Nom affiché | **Cours et Cotations GG** |
| Compte GitHub | `ggfone911-claude` |
| Dépôt | `ggfone911-claude/cours-et-cotations-gg` (public) |
| URL publique | `https://ggfone911-claude.github.io/cours-et-cotations-gg/` |
| Hébergement | GitHub Pages, déployé par GitHub Actions |
| Langue | Français uniquement (formats `fr-FR` : `1 234,56 €`, `+3,45 %`, dates `11 octobre 2026`) |
| Dépôt source à reprendre | `git@github.com:ggfone911-claude/conservateur-fonds.git` (clone en lecture seule, ne jamais y pousser) |

---

## 2. Principes non négociables

1. **Un chiffre faux est pire qu'une case vide.** Une donnée absente ou illisible s'affiche `—`. Il n'y a jamais de repli vers des valeurs codées en dur ni vers d'anciennes valeurs déguisées en données du jour. (Dans l'existant, ce repli a fait afficher +3,92 % au lieu de −1,16 %.)
2. **Échouer bruyamment.** Un scraping vide, trop partiel ou périmé fait sortir le script avec un code non nul. Le run GitHub passe au rouge et **les fichiers de données ne sont pas modifiés**. Jamais de `continue-on-error`. (Un échec silencieux a déjà figé le site pendant deux mois, du 09/07 au 08/09/2026.)
3. **Lire les en-têtes, jamais des positions fixes.** Boursorama change sa mise en page sans prévenir (voir 4.3).
4. **Séparer les données du code.** Le référentiel des fonds, les portefeuilles et la grille des taux sont des fichiers JSON modifiables sans toucher au code.
5. **Pas d'étape de build.** Le site est en HTML, CSS et JavaScript natifs (modules ES). Pas de framework ni de `npm build`. Les dépendances externes sont copiées dans le dépôt (`site/vendor/`) avec une version fixe.
6. **Tout est testé.** Les parseurs sont testés sur des pages Boursorama enregistrées, et les calculs (portefeuilles, fonds en euros, simulateur, rebasage) par des tests unitaires.
7. **Vérifier en ligne, pas en local.** Un audit de fraîcheur se fait sur `origin/main` et sur le site déployé, jamais sur un clone local qui peut être en retard.

---

## 3. Architecture

```
cours-et-cotations-gg/
├── CLAUDE.md                     # Règles de travail pour Claude Code (fourni)
├── CAHIER_DES_CHARGES.md         # Ce document
├── README.md                     # Mode d'emploi pour Guillaume (non technique)
├── data/
│   ├── funds.json                # Référentiel des fonds (édité à la main)
│   ├── portfolios.json           # Portefeuilles modèles (édité à la main)
│   ├── euro_fund.json            # Grille des taux fonds en euros + DOP (édité à la main)
│   ├── quotes.json               # VL + perfs du jour (généré par le scraper)
│   ├── history.json              # Historique mensuel 60 mois (généré)
│   └── status.json               # État du dernier run (généré)
├── scripts/
│   ├── common.py                 # HTTP, nettoyage des nombres, chargement du référentiel
│   ├── scrape_daily.py           # Relevé quotidien Boursorama → quotes.json
│   ├── scrape_history.py         # Historique mensuel → history.json
│   ├── validate.py               # Contrôles de cohérence de tous les JSON
│   ├── compare_legacy.py         # Comparaison avec conservateur-fonds pendant la bascule
│   └── import_legacy.py          # Extraction unique du référentiel depuis gen_app_v2.py
├── tests/
│   ├── fixtures/                 # Pages Boursorama enregistrées (.html)
│   ├── test_parse_daily.py
│   ├── test_parse_history.py
│   ├── test_validate.py
│   └── js/                       # Tests des calculs JS (node --test)
├── site/
│   ├── index.html
│   ├── css/styles.css
│   ├── js/
│   │   ├── app.js                # Point d'entrée, routage par onglets (#fonds, #portefeuilles…)
│   │   ├── data.js               # Chargement des JSON, jointure référentiel + cotations
│   │   ├── format.js             # Formats fr-FR (nombres, %, dates)
│   │   ├── funds-view.js         # Vue Fonds (tableaux, filtres, tri)
│   │   ├── charts.js             # Graphiques (barres + courbes)
│   │   ├── calc.js               # Calculs purs : rebasage, volatilité, drawdown, mélanges
│   │   ├── portfolios-view.js    # Portefeuilles modèles + FE/DOP
│   │   ├── perso-view.js         # Portefeuilles personnels
│   │   ├── simulator.js          # Simulateur de projection
│   │   └── print.js              # Impression / PDF
│   └── vendor/                   # Chart.js 4.4.x (copie locale, version fixe)
├── .github/workflows/
│   ├── daily.yml
│   ├── monthly.yml
│   ├── deploy.yml
│   └── tests.yml
└── requirements.txt              # Python ≥ 3.11 ; pytest ; pas de dépendance réseau lourde
```

**Flux de données :**

```
funds.json ─┐
            ├─► scrape_daily.py ──► quotes.json ─┐
            └─► scrape_history.py ─► history.json ├─► validate.py ─► commit ─► deploy.yml ─► GitHub Pages
                                                  │
portfolios.json, euro_fund.json ──────────────────┘   (le navigateur lit les JSON et calcule l'affichage)
```

Au déploiement, `deploy.yml` copie `data/*.json` dans `site/data/` puis publie le dossier `site/` (via `actions/upload-pages-artifact` et `actions/deploy-pages`). Le navigateur charge les JSON avec `fetch()`, en ajoutant `?v=<date>` à l'URL pour éviter le cache.

---

## 4. Données

### 4.1 `data/funds.json` — référentiel

```json
{
  "version": 1,
  "source_list": "Liste des OPC commercialisés par Conservateur Finance — 01/10/2026",
  "categories": [
    { "id": "monetaire", "label": "Monétaire / Oblig. CT", "color": "#3266ad", "order": 1 }
  ],
  "funds": [
    {
      "isin": "FR0013287315",
      "bourso_id": "0P0001CB5C",
      "name": "Palatine Monétaire Court Terme (R)",
      "manager": "Palatine AM",
      "category": "monetaire",
      "srri": 1,
      "share_class": "C",
      "displayed": true,
      "pending": null
    }
  ]
}
```

Règles :

- `bourso_id` prend deux formes : `0P000…` ou `MP-…`. URL de la fiche : `https://www.boursorama.com/bourse/opcvm/cours/<bourso_id>/`.
- `displayed: false` concerne les parts de distribution (D). Elles sont relevées mais pas affichées, par choix.
- `pending` vaut un texte (par exemple « En attente — Boursorama ne publie ni date de VL ni performances pour cette part ») quand un fonds n'a pas de données. Le fonds reste affiché avec un badge coloré **« En attente »**, il est décoché par défaut dans les portefeuilles, et **il n'est jamais supprimé** pour ce motif.
- `srri` suit l'échelle 1 à 7 du site. Le SRI du PDF Conservateur n'utilise pas la même échelle et ne doit **pas** remplacer cette valeur (décision en attente de Guillaume).
- Le type affiché (badge) découle du SRRI : 1 Monétaire, 2 Oblig. daté, 3 Obligataire, 4 Flexible, 5 Mixte, 6 Actions, 7 Thématique.
- Catégories actuelles : Monétaire / Oblig. CT · Obligataire LT · Oblig. à Horizon · Mixtes Obligataires · Actions Françaises · Actions Européennes · Actions Internationales · Flexibles.

**Contenu initial :** `scripts/import_legacy.py` l'extrait une seule fois du dépôt `conservateur-fonds` : `CATEGORIES` dans `gen_app_v2.py`, `FUNDS` (ISIN → identifiant Boursorama) dans `scraper.py`, et les fonds `pending`. Le résultat attendu compte environ 61 ISIN relevés, dont environ 50 affichés. Vérifie ces chiffres sur le dépôt plutôt que de les supposer.

### 4.2 `data/quotes.json` — relevé du jour (généré)

```json
{
  "last_updated": "2026-10-11",
  "source": "Boursorama — tableau PERFORMANCES DU FONDS",
  "data": {
    "FR0013287315": {
      "vl": 642.78,
      "date": "2026-10-09",
      "eom": { "ytd": 1.37, "w1": null, "m1": 0.18, "m6": 1.04, "a1": 2.02, "a3": 8.98, "a5": 11.13, "a10": null },
      "gli": { "ytd": 1.56, "w1": 0.03, "m1": 0.17, "m6": 1.02, "a1": 2.05, "a3": 9.01, "a5": 11.20, "a10": null }
    }
  }
}
```

- `eom` vient de l'onglet « À LA FIN DE MOIS » : 7 colonnes (1er janv., 1 mois, 6 mois, 1 an, 3 ans, 5 ans, 10 ans).
- `gli` vient de l'onglet « GLISSANTES » : 8 colonnes, avec « 1 semaine » en plus.
- Toutes les performances sont **cumulées, en %**, pas annualisées.
- Un fonds non relevé ce jour-là garde sa dernière entrée, avec un champ `"stale_since": "AAAA-MM-JJ"`. Le site affiche alors une pastille « donnée du JJ/MM ».

### 4.3 Règles de scraping Boursorama (quotidien)

Reprends la logique de `conservateur-fonds/scraper.py`, déjà corrigée deux fois :

1. **VL**, avec quatre motifs de repli dans cet ordre : classe `c-instrument--last`, attribut `data-ist-last`, JSON `"currentPrice"`, JSON `"last"`. Une VL ≤ 0 ou illisible signifie « fonds en échec ».
2. **Date de VL** : texte « DERNIER COURS CONNU AU JJ/MM/AAAA ».
3. **Tableaux de performances** : retiens les `<table>` dont les en-têtes contiennent « 1ER JANV ». Le premier est `eom`, le second `gli`. **Deux mises en page existent et doivent toutes les deux être lues :**
   - *horizontale* : une ligne `<th scope=row>FONDS</th>` suivie des valeurs, avec les périodes en en-têtes de colonnes ;
   - *verticale* (en place depuis le 05/10/2026) : colonnes FONDS / CATÉGORIE / RANG, une ligne par période (`<th scope=row>1er JANV.</th>` puis la valeur du fonds).
   - Le tableau « fonds partenaires » (colonne LIBELLÉ, sans ligne ni colonne FONDS) est ignoré.
   - Les périodes sont reconnues par expression régulière sur le libellé (`1ER JANV`, `1 SEMAINE`, `1 MOIS`, `6 MOIS`, `1 AN`, `3 ANS`, `5 ANS`, `10 ANS`), jamais par position.
4. **Nombres** : `"1 234,56 %"` donne `1234.56`. Les valeurs `-`, `–`, `ND`, `N/A` et la chaîne vide donnent `null`. Gère les espaces insécables (U+00A0 et U+202F).
5. **Politesse** : 0,8 s de pause entre deux fonds, délai d'attente de 20 s, User-Agent de navigateur, `Accept-Language: fr-FR`, décompression gzip. Pas de requêtes en parallèle.
6. **Garde-fous** (code de sortie 1, fichiers inchangés) :
   - aucun fonds relevé ;
   - moins de 60 % des fonds relevés ;
   - VL la plus récente datée de plus de 8 jours ;
   - performance 1 an lue sur moins de 50 % des fonds relevés (tableau absent ou mise en page inconnue).
7. Le script écrit un résumé dans `data/status.json` : date, nombre de fonds relevés et en échec, ISIN en échec, étape en échec. Il l'écrit **même en cas d'échec**, et c'est le seul fichier modifié dans ce cas.

**Piège Morningstar, à documenter dans le code :** le jeu `eom` est calculé par Morningstar sur la dernière VL du mois précédent et n'est mis à jour qu'une à deux semaines après le début du mois. Pendant cette période, il reste identique alors que la VL bouge, ce qui est **normal**. Un vrai gel se détecte sur une fenêtre longue : `eom` inchangé depuis plus de 45 jours alors que les VL ont bougé. Pour tout contrôle croisé avec l'historique des VL, utilise `gli`, le seul jeu synchronisé avec la dernière VL.

### 4.4 `data/history.json` — historique mensuel (généré)

```json
{ "last_updated": "2026-10-01", "data": { "FR0013287315": [ { "date": "2021-10", "vl": 598.12 } ] } }
```

- Source : endpoint `GetTicksEOD` de Boursorama. Ouvre d'abord la fiche du fonds pour obtenir les cookies, puis appelle l'endpoint avec les en-têtes `Referer` et `X-Requested-With: XMLHttpRequest` et `length=1825` (5 ans). Reprends le détail exact de `conservateur-fonds/scraper_monthly.py`.
- Garde la dernière VL de chaque mois et conserve **60 mois glissants**.
- **Filtre des cotations aberrantes** : écarte un point qui s'écarte d'un facteur supérieur à 5 de la médiane de ses voisins. Cas réel : FR0010106500 à 47 948 € au lieu de 487 € en 09/2021.
- Si un fonds échoue, son historique existant est **conservé** sans être écrasé. Le script échoue globalement si moins de 60 % des fonds aboutissent.
- Pour un fonds récent (moins de 60 mois d'existence), garde ce qui existe. Le site gère les séries courtes.

### 4.5 `data/portfolios.json`

```json
{
  "as_of": "2026-10-08",
  "profiles": [
    {
      "id": "pru", "label": "Prudent", "emoji": "🔵", "range": "SRRI 1–3",
      "description": "Horizon 3–5 ans · Préservation du capital · Rendement cible ~2–3 %/an",
      "note": "31 % SRRI 1 (monétaire) · 15 % SRRI 2 (oblig. horizon) · 54 % SRRI 3 (obligataire & long-short)",
      "funds": [ { "isin": "FR0013287315", "weight": 10 } ]
    }
  ]
}
```

- Importe les trois profils actuels (Prudent, Équilibré, Dynamique) avec leurs ISIN et pondérations depuis `_PORTFOLIOS_DEF` dans `gen_app_v2.py`.
- Dans chaque profil, la somme des pondérations UC vaut **100**. `validate.py` le vérifie.
- Règle métier : les fonds **long-short** sont classés Prudent.

### 4.6 `data/euro_fund.json`

```json
{
  "year": 2025,
  "euro_fund": {
    "allocation": { "min": 20, "max": 49, "default": 30 },
    "threshold_eur": 150000,
    "grid": [
      { "uc_min": 70, "rate_low": 4.00, "rate_high": 4.25, "label": "UC ≥ 70 %" },
      { "uc_min": 60, "rate_low": 3.75, "rate_high": 4.00, "label": "60 % ≤ UC < 70 %" },
      { "uc_min": 50, "rate_low": 3.25, "rate_high": 3.50, "label": "50 % ≤ UC < 60 %" },
      { "uc_min": 40, "rate_low": 2.00, "rate_high": 2.25, "label": "40 % ≤ UC < 50 %" },
      { "uc_min": 0,  "rate_low": 1.10, "rate_high": 1.10, "label": "UC < 40 %" }
    ]
  },
  "dop": { "label": "DOP", "rate": 5.00, "allocation": { "min": 0, "max": 30, "default": 0 }, "interest": "simple" }
}
```

`rate_low` s'applique sous 150 000 € d'encours, `rate_high` à partir de 150 000 €. Guillaume met cette grille à jour chaque année.

---

## 5. Fonctionnalités du site

Le site est une page unique avec quatre onglets accessibles par l'URL (`#fonds`, `#portefeuilles`, `#perso`, `#etat`).

### 5.1 En-tête (toujours visible)

- Titre « Cours et Cotations GG », sous-titre « VL et performances Boursorama au *11 octobre 2026* ». La date est celle de la VL la plus récente.
- Bandeau de chiffres clés : nombre de fonds suivis, nombre de catégories, meilleur YTD (avec le nom du fonds), moins bon YTD.
- **Alerte de fraîcheur** : si `status.json` indique un échec ou si la donnée a plus de 3 jours ouvrés, un bandeau orange s'affiche : « Données du JJ/MM — dernière mise à jour en échec ».

### 5.2 Onglet Fonds

- **Barre de filtres** :
  - recherche plein texte sur le nom, le gérant et l'ISIN ;
  - boutons SRRI 1 à 7, cumulables (code couleur : 1 `#22c55e`, 2 `#84cc16`, 3 `#eab308`, 4 `#f59e0b`, 5 `#f97316`, 6 `#ef4444`, 7 `#991b1b`) ;
  - bouton « Effacer ».
  - Dès qu'un filtre est actif, on affiche un tableau unique des résultats, toutes catégories confondues, avec le nombre de résultats.
- **Sélecteur de convention** : « Fin de mois » (par défaut, stable pour le reporting client) ou « Glissantes ». Il bascule toutes les colonnes de performances et les graphiques. Une infobulle explique le décalage Morningstar.
- **Sous-onglets par catégorie**, avec le nombre de fonds. Pour chaque catégorie :
  - un **tableau** avec rang, nom (+ badge de type + badge « En attente »), gérant, SRRI, VL, date de VL, YTD, 1 mois, 6 mois, 1 an, 3 ans, 5 ans, volatilité, perte maximale et un lien ↗ vers la fiche Boursorama. Toutes les colonnes se trient au clic (`—` toujours en bas). Les médailles 🥇🥈🥉 vont aux trois meilleurs de la période choisie. Les valeurs positives sont en vert, les négatives en rouge ;
  - un **graphique en barres horizontales** des performances, avec choix de la période (YTD / 1 mois / 6 mois / 1 an / 3 ans / 5 ans) ;
  - un **graphique en courbes** de l'évolution des VL sur 1 an, 3 ans ou 5 ans, **rebasées à 100 à la première date commune de la fenêtre**. Un fonds sans VL à cette date est exclu et signalé sous le graphique (« Exclus faute d'historique : … »). L'axe des abscisses est un vrai axe chronologique (mois réels). Il ne faut **jamais** construire une courbe à partir des colonnes de performances (5A, 3A, 1A…) : c'était l'erreur de l'ancien site.
- **Indicateurs de risque**, calculés à partir de `history.json` :
  - volatilité annualisée = écart-type (n−1) des rendements mensuels × √12, en %, calculée à partir de 5 rendements ;
  - perte maximale = pire baisse entre un sommet et un creux suivant, sur la série mensuelle ;
  - fenêtre : **12 derniers mois**, indiquée dans l'en-tête de colonne.

### 5.3 Onglet Portefeuilles modèles

- Trois sous-onglets : 🔵 Prudent · 🟢 Équilibré · 🔴 Dynamique, chacun avec sa description, sa plage SRRI et sa note de composition.
- **Bloc Fonds en euros** :
  - choix de l'encours : « Moins de 150 k€ » ou « 150 k€ et plus » ;
  - curseur d'allocation au fonds en euros de 20 à 49 % (30 % par défaut) ;
  - affichage du taux applicable et de la tranche, calculés sur la part d'UC (100 − allocation FE).
- **Bloc DOP** : curseur de 0 à 30 % (0 par défaut), taux fixe de 5,00 % par an en intérêts simples. La DOP **n'entre pas** dans le calcul de la tranche du fonds en euros.
- **Sélecteur de période** : 1 an, 3 ans (N−3) ou 5 ans (N−5).
- **Tableau** :
  - ligne ★ Fonds en euros (YTD au prorata du temps écoulé dans l'année, 1 an = taux, 3 ans = (1+t)³−1, 5 ans = (1+t)⁵−1) ;
  - ligne ★ DOP (intérêts simples : taux × années) ;
  - puis les UC triées par performance 1 an, chacune avec une case à cocher pour l'inclure ou l'exclure, son SRRI, YTD, 1 an, 3 ans, 5 ans, volatilité, perte maximale et une barre d'allocation.
  - La part UC réelle vaut 100 − FE − DOP. Elle est répartie au prorata des pondérations des fonds **cochés** : décocher un fonds renormalise les autres.
- **Indicateurs (KPI)** du portefeuille : performance cumulée sur la période choisie, performance annualisée et volatilité pondérée (approximation documentée : moyenne pondérée des volatilités). Ils sont recalculés à chaque changement.
- Les performances des UC suivent toujours la convention **fin de mois**, quel que soit le sélecteur de l'onglet Fonds.
- Bouton **« Imprimer / PDF »** : ouvre une version imprimable (titre, date, composition, KPI, mentions légales).
- Mention sous chaque tableau : « Performances passées cumulées, non garanties. »

### 5.4 Onglet Portefeuilles perso

- Barre d'onglets des portefeuilles personnels, avec les actions : créer, dupliquer, renommer, supprimer (avec confirmation dans la page, sans `alert()` ni `confirm()` natifs).
- Une **fenêtre de sélection** des fonds, avec recherche et regroupement par catégorie. On y choisit les fonds puis leurs pondérations, avec un contrôle du total à 100 % (bouton « Répartir à parts égales »).
- Les mêmes blocs Fonds en euros, DOP, période et KPI que pour les portefeuilles modèles.
- **Sauvegarde dans le navigateur** (`localStorage`, clé `ccgg.perso.v1`, lecture et écriture entourées de `try/catch`).
- **Export / import JSON** d'un portefeuille.
- **Lien de partage** : le portefeuille est encodé dans l'URL (`#perso=<base64url>`). À l'ouverture du lien, on propose de l'importer.
- Impression / PDF comme pour les portefeuilles modèles.

### 5.5 Simulateur de projection (sous les onglets Portefeuilles et Perso)

- Champs : versement initial (10 000 € par défaut), versement mensuel (200 €), horizon de 1 à 40 ans (10 ans), rendement annuel (5,0 %).
- Bouton « Utiliser le portefeuille affiché » : reprend le rendement annualisé du portefeuille actif selon la période choisie, ou le 1 an s'il manque une donnée.
- Calcul mensuel : taux mensuel = (1+r)^(1/12) − 1 ; capital = capital × (1 + taux mensuel) + versement mensuel.
- KPI : capital projeté, total versé, gains théoriques. Un tableau annuel donne le versé cumulé, le capital et les gains (une ligne sur deux ou sur trois au-delà de 12 ans).
- Mention : « Projection théorique à rendement constant, hors frais et fiscalité. Les performances passées ne préjugent pas des performances futures. »

### 5.6 Onglet État des données (nouveau)

- Date et résultat du dernier relevé quotidien et du dernier historique mensuel, à partir de `status.json`.
- Nombre de fonds relevés, liste des ISIN en échec ou « en attente », âge de la VL de chaque fonds.
- Lien vers la page Actions du dépôt.

### 5.7 Pied de page (toutes les vues)

> Les performances passées ne préjugent pas des performances futures. L'assureur ne s'engage que sur le nombre d'unités de compte et non sur leur valeur. Données issues de Boursorama, fournies à titre informatif, sans garantie d'exactitude. Document établi à titre informatif, ne constitue pas un conseil en investissement.

Plus la date de génération et un lien vers l'onglet État.

---

## 6. Exigences non fonctionnelles

- **Responsive** : utilisable sur téléphone (largeur 375 px), tableaux à défilement horizontal, en-têtes figés.
- **Performance** : premier affichage en moins de 2 s sur une connexion 4G, `history.json` compris (environ 350 Ko).
- **Accessibilité** : contrastes conformes WCAG AA, navigation au clavier sur les onglets et les tris, `aria-sort` sur les colonnes triées. Le vert et le rouge ne sont jamais le seul signal : le signe + ou − est toujours affiché.
- **Impression** : feuille de style `@media print` dédiée.
- **Sécurité** : site statique sans secret. Les textes issus des JSON sont insérés via `textContent` (jamais `innerHTML` avec une donnée).
- **Charte** : sobre et professionnelle. Bleu `#3266ad` en couleur principale, vert `#1D9E75`, orange `#D85A30`, gris `#888780`. Polices système. Mode sombre facultatif.
- **Navigateurs** : les deux dernières versions de Safari, Chrome, Firefox et Edge.

---

## 7. Automatisation (GitHub Actions)

| Workflow | Déclencheur | Étapes |
|---|---|---|
| `daily.yml` | `cron: '0 6 * * 1-5'` et `'0 7 * * 6'` (UTC) + manuel | checkout → Python 3.11 → `scrape_daily.py` → `validate.py` → commit `data/quotes.json` + `data/status.json` si changement (message « Relevé VL — JJ/MM/AAAA HH:MM ») → push |
| `monthly.yml` | `cron: '0 7 1 * *'` + manuel | `scrape_history.py` → `validate.py` → commit `history.json` |
| `deploy.yml` | push sur `main` touchant `site/**` ou `data/**` + manuel | copie de `data/` vers `site/data/` → `upload-pages-artifact` → `deploy-pages` |
| `tests.yml` | push et pull request | `pytest` + `node --test tests/js` |

- Autorisations minimales : `contents: write` pour daily et monthly ; `pages: write` et `id-token: write` pour deploy.
- `concurrency: group: data-update` sur daily et monthly, avec `git pull --rebase` avant le push, pour éviter les conflits.
- **Aucun** `continue-on-error`. Un run rouge signale un vrai problème à examiner.
- Un push fait avec le `GITHUB_TOKEN` ne déclenche pas d'autre workflow. Daily et monthly appellent donc deploy à la fin, via `workflow_call` ou `gh workflow run deploy.yml`.
- **Script local de secours** `mettre_a_jour_maintenant.command` (macOS) : clone en SSH, lance daily puis monthly, valide, pousse, et attend « Entrée » avant de fermer. Il sert quand GitHub Actions est en panne.

---

## 8. Tests et critères de recette

**Tests automatisés obligatoires**

- `test_parse_daily.py` : au moins 4 pages enregistrées (mise en page horizontale, mise en page verticale, fonds sans tableau de performances, identifiant `MP-`). On vérifie la VL, la date et les jeux `eom` et `gli` complets.
- Nettoyage des nombres : espaces insécables, virgule, `ND`, `-`, `–`, valeurs négatives.
- Garde-fous : un relevé vide, partiel ou périmé donne un code de sortie 1 et des fichiers inchangés.
- Historique : filtre des cotations aberrantes, conservation de l'historique existant en cas d'échec, découpe à 60 mois.
- `validate.py` : ISIN au bon format (12 caractères, clé de contrôle Luhn), `bourso_id` présent, pondérations = 100, tout ISIN d'un portefeuille présent dans `funds.json`, SRRI entre 1 et 7.
- JS : rebasage sur date commune, volatilité, perte maximale, répartition FE/DOP/UC avec fonds décochés, tranche du taux fonds en euros, simulateur (cas de référence : 10 000 € + 200 €/mois, 10 ans à 5 % → 47 161,58 €).

**Recette fonctionnelle (à faire valider par Guillaume)**

1. Pour 10 fonds tirés au hasard, la VL, la date et les performances 1 an et 3 ans affichées sont identiques à la fiche Boursorama du jour, dans la même convention.
2. Pendant 5 jours ouvrés, le nouveau site et `conservateur-fonds` affichent les mêmes chiffres (`compare_legacy.py`, écart maximal 0,00 pt sur les performances et 0,01 % sur la VL).
3. Le portefeuille Équilibré avec 30 % de fonds en euros, moins de 150 k€ et 0 % de DOP donne des KPI identiques à ceux de l'ancien site.
4. Un fonds « en attente » est visible, signalé, décoché par défaut et sans erreur dans la console.
5. Un portefeuille perso survit au rechargement de la page, s'exporte, se réimporte et s'ouvre depuis un lien de partage dans un autre navigateur.
6. Un échec simulé du scraper (URL invalide) fait passer le run au rouge, laisse `quotes.json` inchangé et affiche l'alerte de fraîcheur sur le site.

---

## 9. Plan de réalisation par lots

Chaque lot se termine par des tests verts, un commit, un résumé en français pour Guillaume et une **pause pour validation**.

| Lot | Contenu | Livrable vérifiable |
|---|---|---|
| **0. Initialisation** | Créer le dépôt `cours-et-cotations-gg`, l'arborescence, `CLAUDE.md`, `README.md`, `tests.yml`. Activer Pages en mode « GitHub Actions ». | Page « Bientôt disponible » en ligne |
| **1. Référentiel** | Cloner `conservateur-fonds` en lecture seule, écrire `import_legacy.py`, produire `funds.json`, `portfolios.json` et `euro_fund.json`, puis `validate.py`. | Les 3 JSON sont validés et le décompte des fonds est expliqué |
| **2. Scrapers** | `common.py`, `scrape_daily.py`, `scrape_history.py`, pages de test, tests. Premier relevé lancé via `workflow_dispatch`, puisque le réseau de GitHub Actions accède à Boursorama. | `quotes.json` et `history.json` réels committés |
| **3. Vue Fonds** | En-tête, filtres, tableaux triables, sélecteur de convention, graphiques en barres et en courbes, risque. | Recette points 1 et 4 |
| **4. Portefeuilles modèles** | Fonds en euros, DOP, période, cases à cocher, KPI, impression. | Recette point 3 |
| **5. Perso + simulateur** | Gestion des portefeuilles perso, sauvegarde, export, partage, simulateur. | Recette point 5 |
| **6. Automatisation** | `daily.yml`, `monthly.yml`, `deploy.yml`, `status.json`, onglet État, script local de secours. | Recette point 6 |
| **7. Bascule** | `compare_legacy.py` pendant 5 jours ouvrés, puis désactivation des workflows de `conservateur-fonds` (renommer le dossier en `workflows-desactives/`, comme pour `Analyse-Le-Conservateur`) et ajout d'une page de redirection sur l'ancien site. | Recette point 2, ancien site redirigé |

---

## 10. Historique des incidents à ne pas reproduire

| Date | Incident | Leçon appliquée ici |
|---|---|---|
| 09/07 → 08/09/2026 | Site figé deux mois, aucun run en échec (`continue-on-error`) | Garde-fous et codes de sortie (4.3, 7) |
| 12/05 → 08/09/2026 | Colonnes 1 mois → 5 ans figées : tableau `_RAW` codé en dur, `bourso_perf.json` jamais lu | Aucune donnée en dur, `null` plutôt qu'un repli (principe 1) |
| 08/09/2026 | Courbe 3 ans / 5 ans tracée à partir des colonnes de performances (fausse chronologie), rebasage fonds par fonds | Courbes uniquement à partir de `history.json`, rebasage sur une date commune (5.2) |
| 08/09/2026 | Tri cassé (doubles accolades dans une f-string Python) | Pas de génération de JS par Python, tests JS |
| 08/09/2026 | Cotation aberrante ×100 (FR0010106500) | Filtre des cotations aberrantes (4.4) |
| 02/10/2026 | Fausse alerte « données figées » au début du mois | Décalage Morningstar documenté, contrôles sur `gli` (4.3) |
| 05/10/2026 | Run en échec : Boursorama a passé son tableau en mise en page verticale | Parseur double mise en page + pages de test (4.3, 8) |
| 08/09/2026 | Audit fait sur un clone local en retard de 52 commits | Toujours auditer `origin/main` et le site en ligne (principe 7) |

---

## 11. Points ouverts (à trancher par Guillaume, ne pas décider à sa place)

1. Remplacer ou non le SRRI du site par le SRI du PDF Conservateur.
2. Taux du fonds en euros 2026, une fois publié : mettre à jour `euro_fund.json`.
3. Nom de domaine personnalisé (par exemple `cotations.mely-melloni.fr`) : possible plus tard avec un fichier `CNAME`.
4. Afficher ou non les parts D.
