// Vue Fonds : filtres, convention, sous-onglets par catégorie, tableaux triables,
// graphiques en barres et en courbes, indicateurs de risque.

import { el, vider, ongletsClavier } from './dom.js';
import {
  pourcent, euros, dateCourte, jourMois, classeSigne, VIDE, TYPE_PAR_SRRI, COULEUR_SRRI,
} from './format.js';
import { comparer, rebaser, FENETRE_RISQUE_MOIS } from './calc.js';
import { barres, courbes } from './charts.js';

const PERIODES = [
  { cle: 'ytd', label: 'YTD', long: 'Depuis le 1er janvier' },
  { cle: 'm1', label: '1 mois', long: '1 mois' },
  { cle: 'm6', label: '6 mois', long: '6 mois' },
  { cle: 'a1', label: '1 an', long: '1 an' },
  { cle: 'a3', label: '3 ans', long: '3 ans' },
  { cle: 'a5', label: '5 ans', long: '5 ans' },
];
const MEDAILLES = ['🥇', '🥈', '🥉'];
const AIDE_CONVENTION = 'Fin de mois : performances arrêtées à la dernière VL du mois '
  + 'précédent (calcul Morningstar). Elles ne sont mises à jour qu\'une à deux semaines '
  + 'après le début du mois : c\'est normal, et stable pour le reporting client. '
  + 'Glissantes : performances calculées jusqu\'à la dernière VL connue.';
const URL_FICHE = 'https://www.boursorama.com/bourse/opcvm/cours/';

const etat = {
  recherche: '',
  srri: new Set(),
  convention: 'eom',
  categorie: null,
  tri: null,            // { cle, sens } ; null = classement par la période choisie
  periode: 'ytd',       // médailles, rang et graphique en barres
  annees: 1,            // graphique en courbes
};

let modele = null;
let zone = null;

export function afficherFonds(conteneur, donnees) {
  modele = donnees;
  etat.categorie = etat.categorie || (modele.categories[0] && modele.categories[0].id);
  vider(conteneur);
  zone = el('div', { classe: 'fonds-contenu' });
  conteneur.append(barreFiltres(), zone);
  rafraichir();
}

const perf = (f, cle) => f[etat.convention][cle];
const filtreActif = () => etat.recherche.trim() !== '' || etat.srri.size > 0;

function rafraichir() {
  vider(zone);
  if (filtreActif()) zone.append(resultatsFiltres());
  else zone.append(ongletsCategories(), vueCategorie());
}

// ── Filtres ────────────────────────────────────────────────────────────────
function barreFiltres() {
  const recherche = el('input', {
    type: 'search', classe: 'champ-recherche', placeholder: 'Nom, gérant ou ISIN',
    'aria-label': 'Rechercher un fonds par nom, gérant ou ISIN',
    oninput: (e) => { etat.recherche = e.target.value; rafraichir(); },
  });
  const boutonsSrri = [1, 2, 3, 4, 5, 6, 7].map((n) => el('button', {
    type: 'button', classe: 'srri-filtre', 'aria-pressed': 'false',
    'aria-label': `SRRI ${n}`, style: { '--srri': COULEUR_SRRI[n] }, texte: String(n),
    onclick: (e) => {
      if (etat.srri.has(n)) etat.srri.delete(n); else etat.srri.add(n);
      e.currentTarget.setAttribute('aria-pressed', String(etat.srri.has(n)));
      rafraichir();
    },
  }));
  const effacer = el('button', {
    type: 'button', classe: 'bouton-secondaire', texte: 'Effacer',
    onclick: () => {
      etat.recherche = '';
      etat.srri.clear();
      recherche.value = '';
      boutonsSrri.forEach((b) => b.setAttribute('aria-pressed', 'false'));
      rafraichir();
    },
  });
  const convention = el('select', {
    'aria-label': 'Convention de calcul des performances',
    onchange: (e) => { etat.convention = e.target.value; rafraichir(); },
  }, [
    el('option', { value: 'eom', texte: 'Fin de mois' }),
    el('option', { value: 'gli', texte: 'Glissantes' }),
  ]);
  convention.value = etat.convention;

  return el('div', { classe: 'barre-filtres' }, [
    recherche,
    el('div', { classe: 'groupe-srri', role: 'group', 'aria-label': 'Filtrer par SRRI' },
      [el('span', { classe: 'etiquette', texte: 'SRRI' }), ...boutonsSrri]),
    effacer,
    el('label', { classe: 'convention' }, [
      el('span', { classe: 'etiquette', texte: 'Performances' }), convention,
      el('span', {
        classe: 'info', tabindex: '0', role: 'img', title: AIDE_CONVENTION,
        'aria-label': AIDE_CONVENTION, texte: 'ⓘ',
      }),
    ]),
  ]);
}

function fondsFiltres() {
  const q = etat.recherche.trim().toLowerCase();
  return modele.fonds.filter((f) => {
    if (etat.srri.size && !etat.srri.has(f.srri)) return false;
    if (!q) return true;
    return [f.name, f.manager, f.isin].some((t) => (t || '').toLowerCase().includes(q));
  });
}

function resultatsFiltres() {
  const fonds = fondsFiltres();
  const n = fonds.length;
  return el('section', { classe: 'carte' }, [
    el('div', { classe: 'entete-section' }, [
      el('h2', { texte: `${n} résultat${n > 1 ? 's' : ''}` }),
      selecteurPeriode(),
    ]),
    n ? tableau(fonds, true) : el('p', { classe: 'vide', texte: 'Aucun fonds ne correspond à ces filtres.' }),
    mention(),
  ]);
}

// ── Catégories ─────────────────────────────────────────────────────────────
function ongletsCategories() {
  const liste = el('div', { classe: 'sous-onglets', role: 'tablist', 'aria-label': 'Catégories' },
    modele.categories.map((c) => {
      const n = modele.fonds.filter((f) => f.category === c.id).length;
      const actif = c.id === etat.categorie;
      return el('button', {
        type: 'button', role: 'tab', id: `onglet-cat-${c.id}`,
        'aria-selected': String(actif), 'aria-controls': 'panneau-categorie',
        tabindex: actif ? '0' : '-1', style: { '--cat': c.color },
        onclick: () => { etat.categorie = c.id; etat.tri = null; rafraichir(); focusOnglet(c.id); },
      }, [c.label, el('span', { classe: 'compteur', texte: String(n) })]);
    }));
  ongletsClavier(liste);
  return liste;
}

function focusOnglet(id) {
  const o = document.getElementById(`onglet-cat-${id}`);
  if (o) o.focus();
}

function vueCategorie() {
  const cat = modele.categories.find((c) => c.id === etat.categorie);
  const fonds = modele.fonds.filter((f) => f.category === etat.categorie);
  const canvasBarres = el('canvas', { role: 'img', 'aria-label': `Performances des fonds ${cat.label}` });
  const canvasCourbes = el('canvas', { role: 'img', 'aria-label': `Évolution des VL des fonds ${cat.label}, base 100` });
  const notes = el('p', { classe: 'note' });

  const panneau = el('div', {
    id: 'panneau-categorie', role: 'tabpanel', 'aria-labelledby': `onglet-cat-${cat.id}`,
  }, [
    el('section', { classe: 'carte' }, [
      el('div', { classe: 'entete-section' }, [el('h2', { texte: cat.label }), selecteurPeriode()]),
      tableau(fonds, false),
      mention(),
    ]),
    el('div', { classe: 'graphiques' }, [
      el('section', { classe: 'carte' }, [
        el('h3', { texte: `Performances — ${libellePeriode()} (${libelleConvention()})` }),
        el('div', { classe: 'zone-graphique' }, canvasBarres),
      ]),
      el('section', { classe: 'carte' }, [
        el('div', { classe: 'entete-section' }, [
          el('h3', { texte: 'Évolution des VL (base 100)' }), selecteurAnnees(),
        ]),
        el('div', { classe: 'zone-graphique' }, canvasCourbes),
        notes,
      ]),
    ]),
  ]);

  // Les graphiques sont dessinés une fois le panneau inséré dans la page.
  requestAnimationFrame(() => {
    barres(canvasBarres, fonds.map((f) => ({ nom: f.name, valeur: perf(f, etat.periode) })));
    const r = rebaser(Object.fromEntries(fonds.map((f) => [f.isin, f.historique])), etat.annees);
    courbes(canvasCourbes, fonds.filter((f) => r.courbes[f.isin])
      .map((f) => ({ nom: f.name, points: r.courbes[f.isin] })));
    const textes = [];
    if (r.base) textes.push(`Base 100 : dernière VL de ${moisLong(r.base)}.`);
    if (r.exclus.length) {
      textes.push(`Exclus faute d'historique : ${r.exclus.map((i) => modele.parIsin[i].name).join(', ')}.`);
    }
    notes.textContent = textes.join(' ');
  });
  return panneau;
}

function moisLong(cle) {
  const [a, m] = cle.split('-');
  return `${['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
    'septembre', 'octobre', 'novembre', 'décembre'][Number(m) - 1]} ${a}`;
}

const libellePeriode = () => PERIODES.find((p) => p.cle === etat.periode).long;
const libelleConvention = () => (etat.convention === 'eom' ? 'fin de mois' : 'glissantes');

function selecteurPeriode() {
  const s = el('select', {
    'aria-label': 'Période du classement et du graphique',
    onchange: (e) => { etat.periode = e.target.value; etat.tri = null; rafraichir(); },
  }, PERIODES.map((p) => el('option', { value: p.cle, texte: p.long })));
  s.value = etat.periode;
  return el('label', { classe: 'selecteur' }, [el('span', { classe: 'etiquette', texte: 'Classement' }), s]);
}

function selecteurAnnees() {
  const s = el('select', {
    'aria-label': 'Durée affichée',
    onchange: (e) => { etat.annees = Number(e.target.value); rafraichir(); },
  }, [1, 3, 5].map((n) => el('option', { value: String(n), texte: n === 1 ? '1 an' : `${n} ans` })));
  s.value = String(etat.annees);
  return s;
}

const mention = () => el('p', { classe: 'note', texte: 'Performances passées cumulées, non garanties.' });

// ── Tableau ────────────────────────────────────────────────────────────────
function colonnes(avecCategorie) {
  const cols = [
    { cle: 'rang', label: 'Rang', val: (f, rangs) => rangs.get(f.isin) ?? null },
    { cle: 'name', label: 'Fonds', val: (f) => f.name, texte: true },
  ];
  if (avecCategorie) cols.push({ cle: 'cat', label: 'Catégorie', val: (f) => f.categorie.label, texte: true });
  cols.push(
    { cle: 'manager', label: 'Gérant', val: (f) => f.manager, texte: true },
    { cle: 'srri', label: 'SRRI', val: (f) => f.srri },
    { cle: 'vl', label: 'VL', val: (f) => f.vl },
    { cle: 'dateVl', label: 'Date VL', val: (f) => f.dateVl, texte: true },
    ...PERIODES.map((p) => ({ cle: p.cle, label: p.label, val: (f) => perf(f, p.cle), perf: true })),
    { cle: 'vol', label: `Volatilité ${FENETRE_RISQUE_MOIS} m`, val: (f) => f.volatilite },
    { cle: 'mdd', label: `Perte max ${FENETRE_RISQUE_MOIS} m`, val: (f) => f.perteMax },
  );
  return cols;
}

function rangs(fonds) {
  const classes = fonds.filter((f) => perf(f, etat.periode) !== null)
    .sort((a, b) => comparer(perf(a, etat.periode), perf(b, etat.periode), -1));
  return new Map(classes.map((f, i) => [f.isin, i + 1]));
}

function tableau(fonds, avecCategorie) {
  const cols = colonnes(avecCategorie);
  const r = rangs(fonds);
  const tri = etat.tri || { cle: 'rang', sens: 1 };
  const col = cols.find((c) => c.cle === tri.cle) || cols[0];
  const lignes = [...fonds].sort((a, b) => comparer(col.val(a, r), col.val(b, r), tri.sens));

  const entete = el('tr', {}, [
    ...cols.map((c) => {
      const actif = c.cle === tri.cle;
      const sens = actif ? (tri.sens === 1 ? 'ascending' : 'descending') : 'none';
      return el('th', { scope: 'col', 'aria-sort': sens, classe: c.texte ? 'gauche' : null }, el('button', {
        type: 'button', classe: 'tri',
        onclick: () => {
          // Premier clic : ordre naturel (A→Z pour le texte, meilleur d'abord pour les nombres).
          const defaut = c.texte || c.cle === 'rang' || c.cle === 'srri' ? 1 : -1;
          etat.tri = { cle: c.cle, sens: actif ? -tri.sens : defaut };
          rafraichir();
        },
      }, [c.label, el('span', { classe: 'fleche', 'aria-hidden': 'true', texte: actif ? (tri.sens === 1 ? '▲' : '▼') : '' })]));
    }),
    el('th', { scope: 'col' }, el('span', { classe: 'sr-only', texte: 'Fiche Boursorama' })),
  ]);

  const corps = lignes.map((f) => el('tr', { classe: f.pending ? 'ligne-attente' : null },
    cols.map((c) => cellule(c, f, r)).concat(el('td', {}, el('a', {
      href: `${URL_FICHE}${f.bourso_id}/`, target: '_blank', rel: 'noopener',
      'aria-label': `Fiche Boursorama de ${f.name}`, texte: '↗',
    })))));

  return el('div', { classe: 'tableau-defilant' },
    el('table', { classe: 'tableau-fonds' }, [el('thead', {}, entete), el('tbody', {}, corps)]));
}

function cellule(c, f, r) {
  const v = c.val(f, r);
  switch (c.cle) {
    case 'rang': {
      const rang = r.get(f.isin);
      return el('td', { classe: 'rang', texte: rang ? (MEDAILLES[rang - 1] || String(rang)) : VIDE });
    }
    case 'name': return el('td', { classe: 'gauche nom-fonds' }, [
      el('span', { texte: f.name }),
      el('span', { classe: 'badge-type', texte: TYPE_PAR_SRRI[f.srri] || '' }),
      f.pending ? el('span', { classe: 'badge-attente', title: f.pending, texte: 'En attente' }) : null,
    ]);
    case 'srri': return el('td', {}, el('span', {
      classe: 'pastille-srri', style: { '--srri': COULEUR_SRRI[f.srri] }, texte: String(f.srri),
    }));
    case 'vl': return el('td', { classe: 'nombre', texte: euros(v) });
    case 'dateVl': return el('td', {}, [
      dateCourte(v),
      f.perimeDepuis ? el('span', {
        classe: 'pastille-perime', title: 'Fonds non relevé lors du dernier passage',
        texte: `donnée du ${jourMois(f.dateVl)}`,
      }) : null,
    ]);
    case 'vol': return el('td', { classe: 'nombre', texte: v === null ? VIDE : pourcent(v).replace('+', '') });
    case 'mdd': return el('td', { classe: `nombre ${classeSigne(v)}`, texte: pourcent(v) });
    default:
      if (c.perf) return el('td', { classe: `nombre ${classeSigne(v)}`, texte: pourcent(v) });
      return el('td', { classe: c.texte ? 'gauche' : null, texte: v ?? VIDE });
  }
}
