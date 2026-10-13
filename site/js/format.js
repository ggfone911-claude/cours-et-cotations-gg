// Formats français (fr-FR). Une valeur absente (null, undefined, NaN) s'affiche « — ».

export const VIDE = '—';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.',
  'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const absent = (v) => v === null || v === undefined || Number.isNaN(v);

// Espace fine insécable (U+202F) entre milliers, comme Intl fr-FR.
function nombreBrut(v, decimales) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(Math.abs(v));
}

export function nombre(v, decimales = 2) {
  if (absent(v)) return VIDE;
  return (v < 0 ? '−' : '') + nombreBrut(v, decimales);
}

// « +3,45 % », « −1,16 % », « 0,00 % ». Le signe est toujours affiché.
export function pourcent(v, decimales = 2) {
  if (absent(v)) return VIDE;
  const arrondi = Number(v.toFixed(decimales));
  const signe = arrondi > 0 ? '+' : arrondi < 0 ? '−' : '';
  return `${signe}${nombreBrut(v, decimales)} %`;
}

export function euros(v, decimales = 2) {
  if (absent(v)) return VIDE;
  return `${nombre(v, decimales)} €`;
}

// « 2026-10-09 » → « 9 octobre 2026 »
export function dateLongue(iso) {
  const d = lireDate(iso);
  if (!d) return VIDE;
  return `${d.j === 1 ? '1er' : d.j} ${MOIS[d.m - 1]} ${d.a}`;
}

// « 2026-10-09 » → « 09/10/2026 »
export function dateCourte(iso) {
  const d = lireDate(iso);
  if (!d) return VIDE;
  return `${pad(d.j)}/${pad(d.m)}/${d.a}`;
}

// « 2026-10-09 » → « 09/10 »
export function jourMois(iso) {
  const d = lireDate(iso);
  if (!d) return VIDE;
  return `${pad(d.j)}/${pad(d.m)}`;
}

// « 2025-10 » → « oct. 2025 »
export function moisAnnee(cle) {
  const m = /^(\d{4})-(\d{2})/.exec(cle || '');
  if (!m) return VIDE;
  return `${MOIS_COURTS[Number(m[2]) - 1]} ${m[1]}`;
}

// Classe de couleur ; la couleur n'est jamais le seul signal (le signe est affiché).
export function classeSigne(v) {
  if (absent(v) || v === 0) return 'neutre';
  return v > 0 ? 'positif' : 'negatif';
}

function lireDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  return { a: Number(m[1]), m: Number(m[2]), j: Number(m[3]) };
}

const pad = (n) => String(n).padStart(2, '0');

// Badge de type, déduit du SRRI (cahier des charges, 4.1).
export const TYPE_PAR_SRRI = {
  1: 'Monétaire', 2: 'Oblig. daté', 3: 'Obligataire', 4: 'Flexible',
  5: 'Mixte', 6: 'Actions', 7: 'Thématique',
};

export const COULEUR_SRRI = {
  1: '#22c55e', 2: '#84cc16', 3: '#eab308', 4: '#f59e0b',
  5: '#f97316', 6: '#ef4444', 7: '#991b1b',
};
