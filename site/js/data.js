// Chargement des JSON et jointure référentiel + cotations + historique.

import { volatilite, perteMaximale } from './calc.js';

const FICHIERS = ['funds', 'quotes', 'history', 'status', 'portfolios', 'euro_fund'];
const OBLIGATOIRES = ['funds', 'quotes'];

async function lire(nom, version) {
  const reponse = await fetch(`data/${nom}.json?v=${version}`);
  if (!reponse.ok) {
    if (OBLIGATOIRES.includes(nom)) throw new Error(`${nom}.json : HTTP ${reponse.status}`);
    return null;
  }
  return reponse.json();
}

export async function charger() {
  // ?v=<date du jour> : évite qu'un navigateur serve une version en cache.
  const version = new Date().toISOString().slice(0, 10);
  const brut = Object.fromEntries(await Promise.all(
    FICHIERS.map(async (nom) => [nom, await lire(nom, version)])));
  return assembler(brut);
}

const PERF_VIDE = { ytd: null, w1: null, m1: null, m6: null, a1: null, a3: null, a5: null, a10: null };

export function assembler({ funds, quotes, history, status, portfolios, euro_fund: euroFund }) {
  const cotations = (quotes && quotes.data) || {};
  const historiques = (history && history.data) || {};
  const categories = [...funds.categories].sort((a, b) => a.order - b.order);
  const parCategorie = Object.fromEntries(categories.map((c) => [c.id, c]));

  const tous = funds.funds.map((f) => {
    const q = cotations[f.isin] || null;
    const serie = historiques[f.isin] || [];
    return {
      ...f,
      categorie: parCategorie[f.category],
      vl: q ? q.vl : null,
      dateVl: q ? q.date : null,
      perimeDepuis: q ? q.stale_since || null : null,
      eom: (q && q.eom) || PERF_VIDE,
      gli: (q && q.gli) || PERF_VIDE,
      historique: serie,
      volatilite: volatilite(serie),
      perteMax: perteMaximale(serie),
    };
  });

  const affiches = tous.filter((f) => f.displayed);
  const datesVl = affiches.map((f) => f.dateVl).filter(Boolean).sort();
  return {
    categories,
    fonds: affiches,
    tousLesFonds: tous,
    parIsin: Object.fromEntries(tous.map((f) => [f.isin, f])),
    dateVlMax: datesVl.length ? datesVl[datesVl.length - 1] : null,
    releve: quotes ? quotes.last_updated : null,
    historiqueMaj: history ? history.last_updated : null,
    statut: status || {},
    portefeuilles: portfolios,
    fondsEuros: euroFund,
  };
}
