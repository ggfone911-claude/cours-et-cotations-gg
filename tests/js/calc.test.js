import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  volatilite, perteMaximale, rebaser, comparer, moisMoins, joursOuvresEntre,
} from '../../site/js/calc.js';

const serie = (vls, debut = 2025) => vls.map((vl, i) => ({
  date: `${debut + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, vl,
}));
const proche = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// ── Risque ─────────────────────────────────────────────────────────────────
test('volatilité annualisée : écart-type (n−1) × √12', () => {
  // Référence calculée avec statistics.stdev de Python.
  proche(volatilite(serie([100, 102, 101, 105, 103, 108, 110])), 9.207228577784786);
});

test('volatilité : null sous 5 rendements, calculée à partir de 5', () => {
  assert.equal(volatilite(serie([100, 101, 102, 103, 104])), null);
  assert.notEqual(volatilite(serie([100, 101, 102, 103, 104, 106])), null);
  assert.equal(volatilite([]), null);
  assert.equal(volatilite(undefined), null);
});

test('volatilité : seuls les 12 derniers mois comptent', () => {
  const ancien = [500, 50, 900, 10];  // très volatils, hors fenêtre
  const recent = [100, 102, 101, 105, 103, 108, 110, 109, 111, 112, 114, 113, 115];
  proche(volatilite(serie([...ancien, ...recent])), volatilite(serie(recent)));
});

test('perte maximale : pire baisse sommet → creux suivant', () => {
  proche(perteMaximale(serie([100, 110, 99, 104, 95, 120, 118])), -13.636363636363635);
  assert.equal(perteMaximale(serie([100, 101, 102, 103, 104, 105])), 0);
  assert.equal(perteMaximale(serie([100, 90, 80])), null);
});

// ── Rebasage ───────────────────────────────────────────────────────────────
test('rebasage à 100 sur la même date pour tous les fonds', () => {
  const r = rebaser({
    A: [{ date: '2025-09', vl: 50 }, { date: '2025-10', vl: 40 }, { date: '2026-10', vl: 60 }],
    B: [{ date: '2025-10', vl: 200 }, { date: '2026-04', vl: 210 }, { date: '2026-10', vl: 220 }],
  }, 1);
  assert.equal(r.base, '2025-10');
  assert.equal(r.fin, '2026-10');
  assert.deepEqual(r.courbes.A, [{ date: '2025-10', valeur: 100 }, { date: '2026-10', valeur: 150 }]);
  r.courbes.B.forEach((p, i) => proche(p.valeur, [100, 105, 110][i]));
  assert.deepEqual(r.exclus, []);
});

test('rebasage : un fonds sans VL à la date de base est exclu, pas rebasé ailleurs', () => {
  const r = rebaser({
    ancien: [{ date: '2023-10', vl: 10 }, { date: '2026-10', vl: 12 }],
    recent: [{ date: '2025-01', vl: 100 }, { date: '2026-10', vl: 130 }],
  }, 3);
  assert.equal(r.base, '2023-10');
  assert.deepEqual(Object.keys(r.courbes), ['ancien']);
  assert.deepEqual(r.exclus, ['recent']);
});

test('rebasage sans données', () => {
  assert.deepEqual(rebaser({ A: [] }, 1), { base: null, fin: null, courbes: {}, exclus: ['A'] });
});

test('soustraction de mois', () => {
  assert.equal(moisMoins('2026-10', 12), '2025-10');
  assert.equal(moisMoins('2026-02', 3), '2025-11');
  assert.equal(moisMoins('2026-10', 60), '2021-10');
});

// ── Tri ────────────────────────────────────────────────────────────────────
test('tri : les valeurs absentes restent en bas dans les deux sens', () => {
  const v = [3, null, -1, undefined, 7];
  assert.deepEqual([...v].sort((a, b) => comparer(a, b, 1)), [-1, 3, 7, null, undefined]);
  assert.deepEqual([...v].sort((a, b) => comparer(a, b, -1)), [7, 3, -1, null, undefined]);
  assert.deepEqual(['Échiquier', 'Carmignac', null, 'DNCA'].sort((a, b) => comparer(a, b, 1)),
    ['Carmignac', 'DNCA', 'Échiquier', null]);
});

test('jours ouvrés', () => {
  assert.equal(joursOuvresEntre('2026-10-09', '2026-10-13'), 2);  // ven. → mar.
  assert.equal(joursOuvresEntre('2026-10-13', '2026-10-13'), 0);
  assert.equal(joursOuvresEntre('2026-10-02', '2026-10-09'), 5);
});
