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
