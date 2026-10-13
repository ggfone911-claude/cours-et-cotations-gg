import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simuler, lignesAffichees } from '../../site/js/calc.js';
import {
  nettoyer, lireEtat, ecrireEtat, totalPoids, partsEgales, nomUnique, versExport, depuisExport,
  encoderPartage, decoderPartage, CLE_STOCKAGE, etatVide,
} from '../../site/js/perso-store.js';

// ── Simulateur ─────────────────────────────────────────────────────────────
test('cas de référence : 10 000 € + 200 €/mois, 10 ans à 5 % → 47 161,58 €', () => {
  const s = simuler({ initial: 10000, mensuel: 200, annees: 10, tauxAnnuel: 5 });
  assert.equal(Math.round(s.capital * 100) / 100, 47161.58);
  assert.equal(s.verse, 34000);
  assert.equal(Math.round(s.gains * 100) / 100, 13161.58);
  assert.equal(s.annees.length, 10);
  assert.equal(s.annees[9].capital, s.capital);
});

test('simulateur : rendement nul ou négatif', () => {
  assert.equal(simuler({ initial: 1000, mensuel: 100, annees: 2, tauxAnnuel: 0 }).capital, 3400);
  assert.ok(simuler({ initial: 1000, mensuel: 0, annees: 1, tauxAnnuel: -10 }).capital < 1000);
});

test('tableau annuel : 1 ligne sur 2 au-delà de 12 ans, 1 sur 3 au-delà de 24', () => {
  const lignes = (n) => Array.from({ length: n }, (_, i) => ({ annee: i + 1 }));
  assert.equal(lignesAffichees(lignes(12)).length, 12);
  assert.deepEqual(lignesAffichees(lignes(15)).map((l) => l.annee), [2, 4, 6, 8, 10, 12, 14, 15]);
  assert.deepEqual(lignesAffichees(lignes(40)).map((l) => l.annee).slice(-3), [36, 39, 40]);
});

// ── Portefeuilles perso ────────────────────────────────────────────────────
const CONNUS = new Set(['FR0013287315', 'FR0010135103', 'LU0512124107']);

function stockageMemoire() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m };
}

test('nettoyage : ISIN inconnus, doublons et poids invalides écartés', () => {
  const { portefeuille, ignores } = nettoyer({
    nom: '  Mon PEA  ',
    lignes: [
      { isin: 'FR0013287315', weight: 40 }, ['FR0010135103', '60'], { isin: 'FR0013287315', weight: 5 },
      { isin: 'XX0000000000', weight: 10 }, { isin: 'LU0512124107', weight: -1 }, { isin: 'LU0512124107', weight: 'abc' },
    ],
  }, CONNUS);
  assert.equal(portefeuille.nom, 'Mon PEA');
  assert.deepEqual(portefeuille.lignes, [{ isin: 'FR0013287315', weight: 40 }, { isin: 'FR0010135103', weight: 60 }]);
  assert.deepEqual(ignores, ['XX0000000000', 'LU0512124107', 'LU0512124107']);
  assert.equal(nettoyer({ nom: 42, lignes: 'x' }, CONNUS).portefeuille.nom, 'Portefeuille importé');
});

test('sauvegarde navigateur : aller-retour', () => {
  const st = stockageMemoire();
  const etat = { version: 1, actif: 'a', portefeuilles: [{ id: 'a', nom: 'A', lignes: [{ isin: 'FR0013287315', weight: 100 }] }] };
  assert.equal(ecrireEtat(etat, st), true);
  assert.deepEqual(lireEtat(CONNUS, st), etat);
});

test('sauvegarde navigateur : contenu illisible ou accès refusé sans plantage', () => {
  const st = stockageMemoire();
  st.setItem(CLE_STOCKAGE, '{pas du json');
  assert.deepEqual(lireEtat(CONNUS, st), etatVide());
  const refuse = { getItem: () => { throw new Error('refusé'); }, setItem: () => { throw new Error('quota'); } };
  assert.deepEqual(lireEtat(CONNUS, refuse), etatVide());
  assert.equal(ecrireEtat(etatVide(), refuse), false);
  assert.deepEqual(lireEtat(CONNUS, undefined), etatVide());
});

test('parts égales : total exactement 100', () => {
  const l = partsEgales([{ isin: 'a' }, { isin: 'b' }, { isin: 'c' }]);
  assert.deepEqual(l.map((x) => x.weight), [33.3, 33.3, 33.4]);
  assert.equal(totalPoids(l), 100);
  assert.equal(totalPoids(partsEgales(Array.from({ length: 7 }, (_, i) => ({ isin: String(i) })))), 100);
  assert.deepEqual(partsEgales([]), []);
});

test('noms uniques', () => {
  assert.equal(nomUnique('A', ['B']), 'A');
  assert.equal(nomUnique('A', ['A', 'A (2)']), 'A (3)');
});

test('export / import JSON', () => {
  const p = { id: 'x', nom: 'Retraite', lignes: [{ isin: 'FR0013287315', weight: 100 }] };
  const texte = JSON.stringify(versExport(p));
  assert.deepEqual(depuisExport(texte, CONNUS), { portefeuille: { nom: 'Retraite', lignes: p.lignes }, ignores: [] });
  assert.throws(() => depuisExport('{"format":"autre"}', CONNUS));
  assert.throws(() => depuisExport('pas du json', CONNUS));
});

test('lien de partage : aller-retour avec accents, sans caractère interdit dans l\'URL', () => {
  const p = { nom: 'Équilibré — Élodie & co', lignes: [{ isin: 'FR0013287315', weight: 33.3 }, { isin: 'FR0010135103', weight: 66.7 }] };
  const code = encoderPartage(p);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decoderPartage(code, CONNUS), { portefeuille: p, ignores: [] });
  assert.throws(() => decoderPartage('%%%', CONNUS));
});
