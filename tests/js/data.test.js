import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assembler } from '../../site/js/data.js';

const lire = (nom) => JSON.parse(readFileSync(new URL(`../../data/${nom}.json`, import.meta.url), 'utf8'));

const funds = {
  categories: [{ id: 'b', label: 'B', color: '#000000', order: 2 },
    { id: 'a', label: 'A', color: '#000000', order: 1 }],
  funds: [
    { isin: 'X1', name: 'Un', category: 'a', srri: 1, displayed: true, pending: null },
    { isin: 'X2', name: 'Deux', category: 'b', srri: 6, displayed: true, pending: 'En attente — test' },
    { isin: 'X3', name: 'Trois (D)', category: 'a', srri: 1, displayed: false, pending: null },
  ],
};
const quotes = {
  last_updated: '2026-10-13',
  data: {
    X1: { vl: 10, date: '2026-10-09', eom: { ytd: 1 }, gli: { ytd: 2 } },
    X3: { vl: 5, date: '2026-10-12', eom: {}, gli: {}, stale_since: '2026-10-13' },
  },
};

test('jointure : fonds affichés seulement, catégories dans l\'ordre', () => {
  const m = assembler({ funds, quotes, history: null, status: null });
  assert.deepEqual(m.categories.map((c) => c.id), ['a', 'b']);
  assert.deepEqual(m.fonds.map((f) => f.isin), ['X1', 'X2']);
  assert.equal(m.tousLesFonds.length, 3);
  assert.equal(m.dateVlMax, '2026-10-09');  // la part D masquée ne compte pas
});

test('fonds sans cotation : valeurs nulles, jamais inventées', () => {
  const x2 = assembler({ funds, quotes, history: null, status: null }).parIsin.X2;
  assert.equal(x2.vl, null);
  assert.equal(x2.dateVl, null);
  assert.equal(x2.eom.a1, null);
  assert.equal(x2.volatilite, null);
  assert.equal(x2.perteMax, null);
  assert.equal(x2.pending, 'En attente — test');
});

test('fonds non relevé ce jour : date de péremption transmise', () => {
  const m = assembler({ funds, quotes, history: null, status: null });
  assert.equal(m.parIsin.X3.perimeDepuis, '2026-10-13');
  assert.equal(m.parIsin.X1.perimeDepuis, null);
});

test('données réelles : 50 fonds affichés, 8 catégories', () => {
  const m = assembler({ funds: lire('funds'), quotes: lire('quotes'), history: lire('history'), status: lire('status') });
  assert.equal(m.fonds.length, 50);
  assert.equal(m.categories.length, 8);
  assert.ok(m.fonds.every((f) => f.categorie));
});
