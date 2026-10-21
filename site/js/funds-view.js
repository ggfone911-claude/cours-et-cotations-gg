// Vue Fonds : filtres, convention, sous-onglets par catégorie, tableaux triables,
// graphiques en barres et en courbes, indicateurs de risque.

import { el, vider, ongletsClavier } from './dom.js';
import {
  pourcent, euros, dateCourte, jourMois, classeSigne, VIDE, TYPE_PAR_SRRI, COULEUR_SRRI,
} from './format.js';
import {
  comparer, rebaser, rebaserJournalier, FENETRE_RISQUE_MOIS, FENETRES_COURBES,
} from './calc.js';
import { barres, courbes } from './charts.js';
import { lienFonds } from './liens.js';

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

const etat = {
  recherche: '',
  srri: new Set(),
  convention: 'eom',
  categorie: null,
  tri: null,            // { cle, sens } ; null = classement par la période choisie
  periode: 'ytd',       // médailles et rang du tableau
  periodeBarres: 'ytd', // graphique en barres (choix indépendant, comme pour les courbes)
  fenetre: '1a',        // graphique en courbes
  masques: {},          // catégorie → ISIN décochés : fonds retirés du graphique en courbes
};

const masques = (cat) => (etat.masques[cat] = etat.masques[cat] || new Set());

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
  const compteCourbes = el('span', { classe: 'note' });
  const noteBarres = el('p', { classe: 'note' });

  const panneau = el('div', {
    id: 'panneau-categorie', role: 'tabpanel', 'aria-labelledby': `onglet-cat-${cat.id}`,
  }, [
    el('section', { classe: 'carte' }, [
      el('div', { classe: 'entete-section' }, [el('h2', { texte: cat.label }), selecteurPeriode()]),
      tableau(fonds, false, { masques: masques(cat.id), changer: () => dessinerCourbes() }),
      mention(),
    ]),
    el('div', { classe: 'graphiques' }, [
      el('section', { classe: 'carte' }, [
        el('div', { classe: 'entete-section' }, [
          el('h3', { texte: `Performances (${libelleConvention()})` }), selecteurBarres(),
        ]),
        el('div', { classe: 'zone-graphique' }, canvasBarres),
        noteBarres,
      ]),
      el('section', { classe: 'carte' }, [
        el('div', { classe: 'entete-section' }, [
          el('h3', { texte: 'Évolution des VL (base 100)' }), selecteurAnnees(),
        ]),
        el('div', { classe: 'choix-courbes' }, [
          compteCourbes,
          el('button', { type: 'button', classe: 'bouton-lien', texte: 'Tout cocher',
            onclick: () => { masques(cat.id).clear(); rafraichir(); } }),
          el('button', { type: 'button', classe: 'bouton-lien', texte: 'Tout décocher',
            onclick: () => { fonds.forEach((f) => masques(cat.id).add(f.isin)); rafraichir(); } }),
        ]),
        el('div', { classe: 'zone-graphique' }, canvasCourbes),
        notes,
      ]),
    ]),
  ]);

  // Les graphiques sont dessinés une fois le panneau inséré dans la page.
  requestAnimationFrame(() => {
    const resserre = barres(canvasBarres, fonds.map((f) => ({ nom: f.name, valeur: perf(f, etat.periodeBarres) })));
    noteBarres.textContent = resserre
      ? 'Échelle resserrée pour rendre les écarts visibles : l’axe ne part pas de 0 %.' : '';
    dessinerCourbes();
  });

  // Seuls les fonds cochés dans le tableau sont tracés ; la base 100 est
  // recalculée sur leur première date commune.
  function dessinerCourbes() {
    const choisis = fonds.filter((f) => !masques(cat.id).has(f.isin));
    compteCourbes.textContent = `${choisis.length} fonds sur ${fonds.length} affichés (cases du tableau)`;
    const journalier = etat.fenetre === '1m';
    const r = journalier
      ? rebaserJournalier(Object.fromEntries(choisis.map((f) => [f.isin, f.journalier])))
      : rebaser(Object.fromEntries(choisis.map((f) => [f.isin, f.historique])), etat.fenetre);
    courbes(canvasCourbes, choisis.filter((f) => r.courbes[f.isin])
      .map((f) => ({ nom: f.name, points: r.courbes[f.isin] })));
    const textes = [];
    if (r.base) {
      textes.push(journalier
        ? `Base 100 : dernière VL connue au ${dateCourte(r.base)} (VL journalières).`
        : `Base 100 : dernière VL ${/^[aeiouyéè]/i.test(moisLong(r.base)) ? 'd’' : 'de '}${moisLong(r.base)}.`);
    }
    if (r.exclus.length) {
      textes.push(`Exclus faute d'historique : ${r.exclus.map((i) => modele.parIsin[i].name).join(', ')}.`);
    }
    notes.textContent = textes.join(' ');
  }
  return panneau;
}

function moisLong(cle) {
  const [a, m] = cle.split('-');
  return `${['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
    'septembre', 'octobre', 'novembre', 'décembre'][Number(m) - 1]} ${a}`;
}

const libelleConvention = () => (etat.convention === 'eom' ? 'fin de mois' : 'glissantes');

function selecteurPeriode() {
  const s = el('select', {
    'aria-label': 'Période du classement',
    onchange: (e) => { etat.periode = e.target.value; etat.tri = null; rafraichir(); },
  }, PERIODES.map((p) => el('option', { value: p.cle, texte: p.long })));
  s.value = etat.periode;
  return el('label', { classe: 'selecteur' }, [el('span', { classe: 'etiquette', texte: 'Classement' }), s]);
}

// Mêmes durées, dans le même ordre, que le graphique en courbes.
const PERIODES_BARRES = ['m1', 'm6', 'ytd', 'a1', 'a3', 'a5'];

function selecteurBarres() {
  const s = el('select', {
    'aria-label': 'Période du graphique en barres',
    onchange: (e) => { etat.periodeBarres = e.target.value; rafraichir(); },
  }, PERIODES_BARRES.map((cle) => el('option', { value: cle, texte: PERIODES.find((p) => p.cle === cle).long })));
  s.value = etat.periodeBarres;
  return s;
}

function selecteurAnnees() {
  const s = el('select', {
    'aria-label': 'Durée affichée',
    onchange: (e) => { etat.fenetre = e.target.value; rafraichir(); },
  }, FENETRES_COURBES.map((f) => el('option', { value: f.cle, texte: f.label })));
  s.value = etat.fenetre;
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

// courbes : { masques, changer } ajoute une case à cocher par fonds pour le graphique en courbes.
function tableau(fonds, avecCategorie, courbesChoix = null) {
  const cols = colonnes(avecCategorie);
  const r = rangs(fonds);
  const tri = etat.tri || { cle: 'rang', sens: 1 };
  const col = cols.find((c) => c.cle === tri.cle) || cols[0];
  const lignes = [...fonds].sort((a, b) => comparer(col.val(a, r), col.val(b, r), tri.sens));

  const entete = el('tr', {}, [
    courbesChoix ? el('th', { scope: 'col', title: 'Afficher le fonds sur le graphique en courbes', texte: 'Courbe' }) : null,
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
  ]);

  const corps = lignes.map((f) => el('tr', { classe: f.pending ? 'ligne-attente' : null }, [
    courbesChoix ? caseCourbe(f, courbesChoix) : null,
    ...cols.map((c) => cellule(c, f, r)),
  ]));

  return el('div', { classe: 'tableau-defilant' },
    el('table', { classe: 'tableau-fonds' }, [el('thead', {}, entete), el('tbody', {}, corps)]));
}

function caseCourbe(f, { masques: m, changer }) {
  return el('td', { classe: 'case-courbe' }, el('input', {
    type: 'checkbox', checked: !m.has(f.isin), 'aria-label': `Afficher ${f.name} sur le graphique en courbes`,
    onchange: (e) => { if (e.target.checked) m.delete(f.isin); else m.add(f.isin); changer(); },
  }));
}

function cellule(c, f, r) {
  const v = c.val(f, r);
  switch (c.cle) {
    case 'rang': {
      const rang = r.get(f.isin);
      return el('td', { classe: 'rang', texte: rang ? (MEDAILLES[rang - 1] || String(rang)) : VIDE });
    }
    case 'name': return el('td', { classe: 'gauche nom-fonds' }, [
      lienFonds(f),
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
