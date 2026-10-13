// Calculs purs, sans accès au DOM : testés par node --test (tests/js).

// Fenêtre des indicateurs de risque : 12 derniers mois, soit 13 points mensuels
// (le dernier est la VL la plus récente du mois en cours).
export const FENETRE_RISQUE_MOIS = 12;
export const RENDEMENTS_MIN = 5;

function derniersPoints(serie, mois) {
  const vls = (serie || []).map((p) => p.vl).filter((v) => typeof v === 'number' && v > 0);
  return vls.slice(-(mois + 1));
}

export function rendementsMensuels(vls) {
  const r = [];
  for (let i = 1; i < vls.length; i++) r.push(vls[i] / vls[i - 1] - 1);
  return r;
}

// Volatilité annualisée en % : écart-type (n−1) des rendements mensuels × √12.
// null s'il y a moins de 5 rendements dans la fenêtre.
export function volatilite(serie, mois = FENETRE_RISQUE_MOIS) {
  const r = rendementsMensuels(derniersPoints(serie, mois));
  if (r.length < RENDEMENTS_MIN) return null;
  const moyenne = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, x) => a + (x - moyenne) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance) * Math.sqrt(12) * 100;
}

// Perte maximale en % (valeur ≤ 0) : pire baisse d'un sommet vers un creux suivant.
// null s'il y a moins de 5 rendements dans la fenêtre.
export function perteMaximale(serie, mois = FENETRE_RISQUE_MOIS) {
  const vls = derniersPoints(serie, mois);
  if (vls.length - 1 < RENDEMENTS_MIN) return null;
  let sommet = vls[0];
  let pire = 0;
  for (const v of vls) {
    if (v > sommet) sommet = v;
    pire = Math.min(pire, (v / sommet - 1) * 100);
  }
  return pire;
}

// « 2026-10 » − 12 mois → « 2025-10 »
export function moisMoins(cle, n) {
  const [a, m] = cle.split('-').map(Number);
  const total = a * 12 + (m - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * Courbes rebasées à 100 sur une date commune.
 * series : { isin: [{date: 'AAAA-MM', vl}] } ; annees : 1, 3 ou 5.
 * La fenêtre se termine au mois le plus récent présent dans les séries. La
 * base est le premier mois de la fenêtre : un fonds sans VL à cette date est
 * exclu (jamais rebasé sur une autre date que les autres).
 * Renvoie { base, fin, courbes: {isin: [{date, valeur}]}, exclus: [isin] }.
 */
export function rebaser(series, annees) {
  const isins = Object.keys(series);
  const tous = isins.flatMap((i) => (series[i] || []).map((p) => p.date));
  if (!tous.length) return { base: null, fin: null, courbes: {}, exclus: isins };
  const fin = tous.reduce((a, b) => (b > a ? b : a));
  const base = moisMoins(fin, annees * 12);

  const courbes = {};
  const exclus = [];
  for (const isin of isins) {
    const points = (series[isin] || []).filter((p) => p.date >= base && p.date <= fin);
    const depart = points.find((p) => p.date === base);
    if (!depart || !(depart.vl > 0)) {
      exclus.push(isin);
      continue;
    }
    courbes[isin] = points.map((p) => ({ date: p.date, valeur: (p.vl / depart.vl) * 100 }));
  }
  return { base, fin, courbes, exclus };
}

// Tri : les valeurs absentes vont toujours en bas, quel que soit le sens.
export function comparer(a, b, sens = 1) {
  const va = a === undefined ? null : a;
  const vb = b === undefined ? null : b;
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  if (typeof va === 'string') return sens * va.localeCompare(vb, 'fr');
  return sens * (va - vb);
}

// Nombre de jours ouvrés (lundi–vendredi) écoulés entre deux dates ISO.
export function joursOuvresEntre(debutIso, finIso) {
  const d = new Date(`${debutIso}T00:00:00Z`);
  const f = new Date(`${finIso}T00:00:00Z`);
  let n = 0;
  while (d < f) {
    d.setUTCDate(d.getUTCDate() + 1);
    const j = d.getUTCDay();
    if (j !== 0 && j !== 6) n += 1;
  }
  return n;
}

// ── Portefeuilles : fonds en euros, DOP, répartition UC, indicateurs ────────

// Taux du fonds en euros selon la part d'UC (100 − allocation FE ; la DOP
// n'entre pas dans le calcul de la tranche) et l'encours (seuil 150 000 €).
export function tauxFondsEuros(grille, partUcPourTranche, encoursEleve) {
  const lignes = [...grille].sort((a, b) => b.uc_min - a.uc_min);
  const ligne = lignes.find((g) => partUcPourTranche >= g.uc_min) || lignes[lignes.length - 1];
  return { taux: encoursEleve ? ligne.rate_high : ligne.rate_low, tranche: ligne.label };
}

// Part de l'année civile écoulée (base 365 jours), pour le YTD des taux fixes.
export function fractionAnnee(date = new Date()) {
  const debut = new Date(date.getFullYear(), 0, 1);
  return (date - debut) / (1000 * 60 * 60 * 24 * 365);
}

// Fonds en euros : intérêts composés ; YTD au prorata du temps écoulé.
export function perfFondsEuros(taux, fraction) {
  const t = taux / 100;
  return {
    ytd: taux * fraction,
    a1: taux,
    a3: ((1 + t) ** 3 - 1) * 100,
    a5: ((1 + t) ** 5 - 1) * 100,
  };
}

// DOP : intérêts simples (taux × années).
export function perfDop(taux, fraction) {
  return { ytd: taux * fraction, a1: taux, a3: taux * 3, a5: taux * 5 };
}

// Répartit la part UC au prorata des pondérations des fonds cochés
// (arrondi au dixième de point, comme l'ancien site). Décoché → 0.
export function repartirUC(lignes, partUc) {
  const total = lignes.filter((l) => l.coche).reduce((s, l) => s + l.weight, 0);
  return lignes.map((l) => (l.coche && total > 0
    ? Math.round((l.weight / total) * partUc * 10) / 10 : 0));
}

const ANNEES = { a1: 1, a3: 3, a5: 5 };

/**
 * Indicateurs du portefeuille pour une période (a1, a3 ou a5).
 * - performance cumulée = FE % × perf FE + DOP % × perf DOP + part UC × moyenne
 *   des perfs UC pondérée par les allocations réelles ; les fonds sans valeur
 *   sur la période sont exclus de cette moyenne (renormalisation) ;
 * - annualisée = (1 + cumul)^(1/années) − 1 ;
 * - volatilité : approximation documentée = part UC × moyenne pondérée des
 *   volatilités des UC (FE et DOP comptés à 0, corrélations ignorées).
 * Renvoie null pour un indicateur sans aucune donnée UC.
 */
export function indicateursPortefeuille({ periode, allocFE, allocDOP, perfFE, perfDOP, uc }) {
  const partUc = (100 - allocFE - allocDOP) / 100;
  const moyenne = (cle) => {
    let somme = 0;
    let poids = 0;
    for (const l of uc) {
      if (l.alloc > 0 && l[cle] !== null && l[cle] !== undefined) {
        somme += l.alloc * l[cle];
        poids += l.alloc;
      }
    }
    return poids > 0 ? somme / poids : null;
  };
  const moyUc = moyenne(periode);
  const cumul = moyUc === null ? null
    : (allocFE / 100) * perfFE[periode] + (allocDOP / 100) * perfDOP[periode] + partUc * moyUc;
  const annees = ANNEES[periode];
  const annualise = cumul === null ? null : ((1 + cumul / 100) ** (1 / annees) - 1) * 100;
  const moyVol = moyenne('vol');
  return { cumul, annualise, volatilite: moyVol === null ? null : partUc * moyVol };
}

// ── Simulateur de projection ────────────────────────────────────────────────

/**
 * Projection mensuelle à rendement constant, hors frais et fiscalité.
 * taux mensuel = (1 + r)^(1/12) − 1 ; chaque mois :
 * capital = capital × (1 + taux mensuel) + versement mensuel.
 * Renvoie { capital, verse, gains, annees: [{annee, verse, capital, gains}] }.
 */
export function simuler({ initial, mensuel, annees, tauxAnnuel }) {
  const tm = (1 + tauxAnnuel / 100) ** (1 / 12) - 1;
  let capital = initial;
  let verse = initial;
  const lignes = [];
  for (let mois = 1; mois <= annees * 12; mois++) {
    capital = capital * (1 + tm) + mensuel;
    verse += mensuel;
    if (mois % 12 === 0) lignes.push({ annee: mois / 12, verse, capital, gains: capital - verse });
  }
  return { capital, verse, gains: capital - verse, annees: lignes };
}

// Lignes du tableau annuel : toutes jusqu'à 12 ans, puis une sur deux
// (jusqu'à 24 ans) ou une sur trois ; la dernière année est toujours gardée.
export function lignesAffichees(lignes) {
  const n = lignes.length;
  const pas = n <= 12 ? 1 : n <= 24 ? 2 : 3;
  return lignes.filter((l) => l.annee % pas === 0 || l.annee === n);
}
