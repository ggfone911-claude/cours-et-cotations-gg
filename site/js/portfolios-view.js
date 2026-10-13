// Portefeuilles modèles (Prudent, Équilibré, Dynamique) : fonds en euros, DOP,
// période, cases à cocher, indicateurs, impression. Le bloc « vuePortefeuille »
// est réutilisé par les portefeuilles perso.

import { el, vider, ongletsClavier } from './dom.js';
import {
  pourcent, nombre, dateLongue, classeSigne, VIDE, TYPE_PAR_SRRI, COULEUR_SRRI,
} from './format.js';
import {
  comparer, tauxFondsEuros, fractionAnnee, perfFondsEuros, perfDop, repartirUC,
  indicateursPortefeuille, FENETRE_RISQUE_MOIS,
} from './calc.js';
import { imprimer } from './print.js';
import { afficherSimulateur } from './simulator.js';
import { lienFonds } from './liens.js';

const PERIODES = [
  { cle: 'a1', label: '1 an', annees: 1 },
  { cle: 'a3', label: '3 ans (N−3)', annees: 3 },
  { cle: 'a5', label: '5 ans (N−5)', annees: 5 },
];
const MENTION = 'Performances passées cumulées, non garanties.';

// Réglages communs à tous les portefeuilles affichés (comme l'ancien site).
let reglages = null;
const decoches = new Map();   // id du portefeuille → Set des ISIN décochés
let profilActif = null;

export function reglagesParDefaut(fondsEuros) {
  if (!reglages) {
    reglages = {
      encoursEleve: false,
      allocFE: fondsEuros.euro_fund.allocation.default,
      allocDOP: fondsEuros.dop.allocation.default,
      periode: 'a1',
    };
  }
  return reglages;
}

export function afficherPortefeuilles(conteneur, modele) {
  reglagesParDefaut(modele.fondsEuros);
  const profils = modele.portefeuilles.profiles;
  profilActif = profilActif || profils[0].id;
  vider(conteneur);

  const liste = el('div', { classe: 'sous-onglets', role: 'tablist', 'aria-label': 'Profils' },
    profils.map((p) => el('button', {
      type: 'button', role: 'tab', id: `onglet-profil-${p.id}`,
      'aria-selected': String(p.id === profilActif), tabindex: p.id === profilActif ? '0' : '-1',
      'aria-controls': 'panneau-profil',
      onclick: () => {
        profilActif = p.id;
        afficherPortefeuilles(conteneur, modele);
        document.getElementById(`onglet-profil-${p.id}`).focus();
      },
    }, `${p.emoji} ${p.label}`)));
  ongletsClavier(liste);

  const profil = profils.find((p) => p.id === profilActif);
  if (!decoches.has(profil.id)) {
    // Les fonds « en attente » sont décochés par défaut.
    decoches.set(profil.id, new Set(profil.funds
      .filter((l) => modele.parIsin[l.isin] && modele.parIsin[l.isin].pending).map((l) => l.isin)));
  }

  const panneau = el('div', { id: 'panneau-profil', role: 'tabpanel', 'aria-labelledby': `onglet-profil-${profil.id}` });
  const zoneSimulateur = el('div');
  conteneur.append(liste, panneau, zoneSimulateur);
  const portefeuille = vuePortefeuille(panneau, modele, {
    titre: `Portefeuille ${profil.label}`,
    entete: [
      el('div', { classe: 'entete-section' }, [
        el('h2', { texte: `${profil.emoji} ${profil.label}` }),
        el('span', { classe: 'plage-srri', texte: profil.range }),
      ]),
      el('p', { classe: 'description', texte: profil.description }),
      el('p', { classe: 'note', texte: `Composition : ${profil.note}` }),
    ],
    infos: [profil.description, `Plage de risque : ${profil.range}`],
    lignes: profil.funds,
    decoches: decoches.get(profil.id),
  });
  afficherSimulateur(zoneSimulateur, () => portefeuille);
}

/**
 * Bloc complet d'un portefeuille dans « conteneur ».
 * options : { titre, entete: [Node], infos: [texte], lignes: [{isin, weight}], decoches: Set }
 * Renvoie une fonction qui donne le rendement annualisé affiché (pour le simulateur).
 */
export function vuePortefeuille(conteneur, modele, options) {
  const fe = modele.fondsEuros;
  const r = reglagesParDefaut(fe);
  const zoneReglages = el('div', { classe: 'carte reglages-portefeuille' });
  const zoneTableau = el('section', { classe: 'carte' });
  const zoneKpi = el('div', { classe: 'kpis' });
  let dernierAnnualise = null;
  let dernierA1 = null;

  vider(conteneur).append(
    el('section', { classe: 'carte' }, [...options.entete, zoneKpi]),
    zoneReglages,
    zoneTableau,
  );

  function calculer() {
    const { taux, tranche } = tauxFondsEuros(fe.euro_fund.grid, 100 - r.allocFE, r.encoursEleve);
    const fraction = fractionAnnee();
    const perfFE = perfFondsEuros(taux, fraction);
    const perfDOP = perfDop(fe.dop.rate, fraction);
    const partUc = 100 - r.allocFE - r.allocDOP;
    const lignes = options.lignes.map((l) => ({
      ...l, fonds: modele.parIsin[l.isin], coche: !options.decoches.has(l.isin),
    })).filter((l) => l.fonds);
    const allocs = repartirUC(lignes, partUc);
    lignes.forEach((l, i) => { l.alloc = allocs[i]; });
    const uc = lignes.map((l) => ({
      alloc: l.alloc, a1: l.fonds.eom.a1, a3: l.fonds.eom.a3, a5: l.fonds.eom.a5, vol: l.fonds.volatilite,
    }));
    const kpi = indicateursPortefeuille({
      periode: r.periode, allocFE: r.allocFE, allocDOP: r.allocDOP, perfFE, perfDOP, uc,
    });
    const kpiA1 = r.periode === 'a1' ? kpi : indicateursPortefeuille({
      periode: 'a1', allocFE: r.allocFE, allocDOP: r.allocDOP, perfFE, perfDOP, uc,
    });
    return { taux, tranche, perfFE, perfDOP, partUc, lignes, kpi, kpiA1 };
  }

  function rafraichir() {
    const c = calculer();
    dernierAnnualise = c.kpi.annualise;
    dernierA1 = c.kpiA1.annualise;
    afficherReglages(c);
    afficherKpi(c);
    afficherTableau(c);
    conteneur.dispatchEvent(new CustomEvent('portefeuille-maj', { bubbles: true }));
  }

  // ── Réglages : fonds en euros, DOP, période ──────────────────────────────
  // Construits une seule fois : seuls les textes changent ensuite, pour ne pas
  // remplacer un curseur pendant qu'on le fait glisser.
  const a = fe.euro_fund.allocation;
  const d = fe.dop.allocation;
  const texteFE = el('span', { classe: 'valeur-curseur' });
  const texteDOP = el('span', { classe: 'valeur-curseur' });
  const texteTaux = el('span', { classe: 'taux' });
  const texteTranche = el('span', { classe: 'note-inline' });
  const textePartUc = el('span', { classe: 'note-inline' });
  const boutonEncours = (eleve, texte) => el('button', {
    type: 'button', classe: 'bouton-bascule',
    onclick: () => { r.encoursEleve = eleve; rafraichir(); },
  }, texte);
  const encoursBas = boutonEncours(false, 'Moins de 150 k€');
  const encoursHaut = boutonEncours(true, '150 k€ et plus');
  const curseur = (min, max, valeur, libelle, quandChange) => el('input', {
    type: 'range', min: String(min), max: String(max), step: '1', value: String(valeur),
    'aria-label': libelle,
    oninput: (e) => { quandChange(Number(e.target.value)); rafraichir(); },
  });
  const selectPeriode = el('select', {
    'aria-label': 'Période des performances et des indicateurs',
    onchange: (e) => { r.periode = e.target.value; rafraichir(); },
  }, PERIODES.map((p) => el('option', { value: p.cle, texte: p.label })));
  selectPeriode.value = r.periode;

  zoneReglages.append(
    el('div', { classe: 'ligne-reglage' }, [
      el('strong', { texte: '🏦 Fonds en euros' }),
      el('span', { classe: 'groupe', role: 'group', 'aria-label': 'Encours' }, [
        el('span', { classe: 'etiquette', texte: 'Encours' }), encoursBas, encoursHaut,
      ]),
      el('label', { classe: 'groupe' }, [
        el('span', { classe: 'etiquette', texte: `Allocation (${a.min}–${a.max} %)` }),
        curseur(a.min, a.max, r.allocFE, 'Allocation au fonds en euros', (v) => { r.allocFE = v; }),
        texteFE,
      ]),
      el('span', { classe: 'groupe' }, [
        el('span', { classe: 'etiquette', texte: `Taux ${fe.year}` }), texteTaux, texteTranche,
      ]),
    ]),
    el('div', { classe: 'ligne-reglage' }, [
      el('strong', { texte: `💎 ${fe.dop.label}` }),
      el('label', { classe: 'groupe' }, [
        el('span', { classe: 'etiquette', texte: `Allocation (${d.min}–${d.max} %)` }),
        curseur(d.min, d.max, r.allocDOP, 'Allocation à la DOP', (v) => { r.allocDOP = v; }),
        texteDOP,
      ]),
      el('span', { classe: 'groupe' }, [
        el('span', { classe: 'etiquette', texte: 'Taux fixe' }),
        el('span', { classe: 'taux', texte: `${nombre(fe.dop.rate)} % / an` }),
        el('span', { classe: 'note-inline', texte: 'intérêts simples, hors calcul de la tranche' }),
      ]),
    ]),
    el('div', { classe: 'ligne-reglage' }, [
      el('label', { classe: 'groupe' }, [el('span', { classe: 'etiquette', texte: 'Période' }), selectPeriode]),
      textePartUc,
    ]),
  );

  function afficherReglages(c) {
    texteFE.textContent = `${r.allocFE} %`;
    texteDOP.textContent = `${r.allocDOP} %`;
    texteTaux.textContent = pourcent(c.taux).replace('+', '');
    texteTranche.textContent = `Tranche ${c.tranche}`;
    textePartUc.textContent = `Part UC : ${nombre(c.partUc, 0)} %`;
    encoursBas.setAttribute('aria-pressed', String(!r.encoursEleve));
    encoursHaut.setAttribute('aria-pressed', String(r.encoursEleve));
  }

  // ── Indicateurs ──────────────────────────────────────────────────────────
  function libellesKpi() {
    const p = PERIODES.find((x) => x.cle === r.periode);
    return {
      cumul: `Performance ${p.annees === 1 ? '1 an' : `${p.annees} ans (cumulée)`}`,
      annualise: 'Performance annualisée',
      vol: 'Volatilité pondérée (approx.)',
    };
  }

  function afficherKpi(c) {
    const l = libellesKpi();
    const bloc = (valeur, libelle, classe, aide) => el('div', { classe: 'kpi', title: aide || null }, [
      el('span', { classe: `valeur ${classe || ''}`, texte: valeur }),
      el('span', { classe: 'libelle', texte: libelle }),
    ]);
    vider(zoneKpi).append(
      bloc(pourcent(c.kpi.cumul, 1), l.cumul, classeSigne(c.kpi.cumul)),
      bloc(c.kpi.annualise === null ? VIDE : `${pourcent(c.kpi.annualise, 1)} / an`, l.annualise,
        classeSigne(c.kpi.annualise)),
      bloc(c.kpi.volatilite === null ? VIDE : pourcent(c.kpi.volatilite, 1).replace('+', ''), l.vol, '',
        'Approximation : moyenne des volatilités sur 12 mois des UC, pondérée par leur allocation ; '
        + 'fonds en euros et DOP comptés à 0 ; corrélations ignorées.'),
    );
  }

  // ── Tableau ──────────────────────────────────────────────────────────────
  function afficherTableau(c) {
    const p = PERIODES.find((x) => x.cle === r.periode);
    const barre = (pct, classe) => el('div', { classe: 'allocation' }, [
      el('div', { classe: `barre-alloc ${classe}`, style: { width: `${Math.min(100, pct)}%` } }),
      el('span', { texte: pct > 0 ? `${nombre(pct, 1)} %` : VIDE }),
    ]);
    const perfs = (v) => ['ytd', 'a1', 'a3', 'a5'].map((k) => el('td', {
      classe: `nombre ${classeSigne(v[k])}`, texte: pourcent(v[k]),
    }));
    const dopActive = r.allocDOP > 0;

    const lignesUc = [...c.lignes].sort((x, y) => comparer(x.fonds.eom.a1, y.fonds.eom.a1, -1));
    const corps = [
      el('tr', { classe: 'ligne-fe' }, [
        el('td', {}, '★'),
        el('td', { classe: 'gauche', texte: `Fonds en euros — taux ${fe.year} ${pourcent(c.taux).replace('+', '')}` }),
        el('td', { texte: VIDE }), ...perfs(c.perfFE),
        el('td', { texte: VIDE }), el('td', { texte: VIDE }),
        el('td', {}, barre(r.allocFE, 'fe')),
      ]),
      el('tr', { classe: 'ligne-dop' }, [
        el('td', {}, '★'),
        el('td', { classe: 'gauche', texte: `${fe.dop.label} — taux fixe ${nombre(fe.dop.rate)} % / an` }),
        el('td', { texte: VIDE }),
        ...(dopActive ? perfs(c.perfDOP) : [1, 2, 3, 4].map(() => el('td', { texte: VIDE }))),
        el('td', { texte: VIDE }), el('td', { texte: VIDE }),
        el('td', {}, barre(r.allocDOP, 'dop')),
      ]),
      ...lignesUc.map((l) => {
        const f = l.fonds;
        return el('tr', { classe: [f.pending ? 'ligne-attente' : '', l.coche ? '' : 'decoche'].join(' ').trim() || null }, [
          el('td', {}, el('input', {
            type: 'checkbox', checked: l.coche, 'aria-label': `Inclure ${f.name}`,
            onchange: (e) => {
              if (e.target.checked) options.decoches.delete(l.isin); else options.decoches.add(l.isin);
              rafraichir();
              const n = zoneTableau.querySelector(`input[aria-label="Inclure ${CSS.escape(f.name)}"]`);
              if (n) n.focus();
            },
          })),
          el('td', { classe: 'gauche nom-fonds' }, [
            lienFonds(f),
            el('span', { classe: 'badge-type', texte: TYPE_PAR_SRRI[f.srri] || '' }),
            f.pending ? el('span', { classe: 'badge-attente', title: f.pending, texte: 'En attente' }) : null,
          ]),
          el('td', {}, el('span', { classe: 'pastille-srri', style: { '--srri': COULEUR_SRRI[f.srri] }, texte: String(f.srri) })),
          ...perfs(f.eom),
          el('td', { classe: 'nombre', texte: f.volatilite === null ? VIDE : pourcent(f.volatilite).replace('+', '') }),
          el('td', { classe: `nombre ${classeSigne(f.perteMax)}`, texte: pourcent(f.perteMax) }),
          el('td', {}, barre(l.alloc, 'uc')),
        ]);
      }),
    ];

    const entetes = ['', 'Support', 'SRRI', 'YTD', '1 an', '3 ans', '5 ans',
      `Volatilité ${FENETRE_RISQUE_MOIS} m`, `Perte max ${FENETRE_RISQUE_MOIS} m`, 'Allocation'];
    vider(zoneTableau).append(
      el('div', { classe: 'entete-section' }, [
        el('h3', { texte: `Composition — performances fin de mois, période ${p.label}` }),
        el('button', {
          type: 'button', classe: 'bouton-principal', texte: 'Imprimer / PDF',
          onclick: () => imprimerPortefeuille(c, lignesUc),
        }),
      ]),
      el('div', { classe: 'tableau-defilant' }, el('table', { classe: 'tableau-fonds tableau-portefeuille' }, [
        el('thead', {}, el('tr', {}, entetes.map((t, i) => el('th', {
          scope: 'col', classe: i === 1 ? 'gauche' : null,
        }, i === 0 ? el('span', { classe: 'sr-only', texte: 'Inclure' }) : t)))),
        el('tbody', {}, corps),
      ])),
      el('p', { classe: 'note', texte: MENTION }),
    );
  }

  function imprimerPortefeuille(c, lignesUc) {
    const l = libellesKpi();
    const p = PERIODES.find((x) => x.cle === r.periode);
    imprimer({
      titre: options.titre,
      lignesInfo: [
        ...options.infos,
        `Données au ${dateLongue(modele.dateVlMax)} — performances fin de mois, période ${p.label}.`,
        `Fonds en euros ${r.allocFE} % (taux ${fe.year} ${pourcent(c.taux).replace('+', '')}, `
          + `${r.encoursEleve ? '150 k€ et plus' : 'moins de 150 k€'}) · DOP ${r.allocDOP} % · UC ${c.partUc} %.`,
      ],
      indicateurs: [
        [l.cumul, pourcent(c.kpi.cumul, 1)],
        [l.annualise, c.kpi.annualise === null ? VIDE : `${pourcent(c.kpi.annualise, 1)} / an`],
        [l.vol, c.kpi.volatilite === null ? VIDE : pourcent(c.kpi.volatilite, 1).replace('+', '')],
      ],
      entetes: ['Support', 'SRRI', 'YTD', '1 an', '3 ans', '5 ans', 'Allocation'],
      lignes: [
        ['Fonds en euros', VIDE, ...['ytd', 'a1', 'a3', 'a5'].map((k) => pourcent(c.perfFE[k])), `${r.allocFE} %`],
        ...(r.allocDOP > 0 ? [[fe.dop.label, VIDE, ...['ytd', 'a1', 'a3', 'a5'].map((k) => pourcent(c.perfDOP[k])), `${r.allocDOP} %`]] : []),
        ...lignesUc.filter((x) => x.alloc > 0).map((x) => [
          x.fonds.name, String(x.fonds.srri),
          ...['ytd', 'a1', 'a3', 'a5'].map((k) => pourcent(x.fonds.eom[k])), `${nombre(x.alloc, 1)} %`,
        ]),
      ],
      notes: [MENTION, 'Volatilité pondérée : approximation (moyenne pondérée des volatilités 12 mois des UC, '
        + 'fonds en euros et DOP comptés à 0, corrélations ignorées).'],
    });
  }

  rafraichir();
  return {
    rendementAnnualise: () => dernierAnnualise,
    rendementUnAn: () => dernierA1,
    periode: () => r.periode,
  };
}
