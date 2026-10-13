import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  tauxFondsEuros, fractionAnnee, perfFondsEuros, perfDop, repartirUC, indicateursPortefeuille,
} from '../../site/js/calc.js';

const euro = JSON.parse(readFileSync(new URL('../../data/euro_fund.json', import.meta.url), 'utf8'));
const grille = euro.euro_fund.grid;
const proche = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('tranche du fonds en euros selon la part UC et l\'encours', () => {
  assert.deepEqual(tauxFondsEuros(grille, 70, false), { taux: 4.0, tranche: 'UC ≥ 70 %' });
  assert.deepEqual(tauxFondsEuros(grille, 70, true), { taux: 4.25, tranche: 'UC ≥ 70 %' });
  assert.equal(tauxFondsEuros(grille, 69, false).taux, 3.75);
  assert.equal(tauxFondsEuros(grille, 60, true).taux, 4.0);
  assert.equal(tauxFondsEuros(grille, 51, false).taux, 3.25);
  assert.equal(tauxFondsEuros(grille, 51, true).taux, 3.5);
  assert.equal(tauxFondsEuros(grille, 45, false).taux, 2.0);
  assert.deepEqual(tauxFondsEuros(grille, 39, true), { taux: 1.1, tranche: 'UC < 40 %' });
});

test('la DOP n\'entre pas dans la tranche : seule l\'allocation FE compte', () => {
  // FE 30 % + DOP 30 % : 40 % d'UC réelles, mais tranche calculée sur 100 − 30 = 70 %.
  assert.equal(tauxFondsEuros(grille, 100 - 30, false).taux, 4.0);
});

test('fonds en euros : intérêts composés, YTD au prorata', () => {
  const p = perfFondsEuros(4, 0.5);
  proche(p.ytd, 2);
  proche(p.a1, 4);
  proche(p.a3, (1.04 ** 3 - 1) * 100);
  proche(p.a5, (1.04 ** 5 - 1) * 100);
});

test('DOP : intérêts simples', () => {
  assert.deepEqual(perfDop(5, 0.25), { ytd: 1.25, a1: 5, a3: 15, a5: 25 });
});

test('fraction de l\'année écoulée', () => {
  assert.equal(fractionAnnee(new Date(2026, 0, 1)), 0);
  // Heure d'été possible entre les deux dates : tolérance d'une heure.
  proche(fractionAnnee(new Date(2026, 6, 2)), 182 / 365, 1 / (24 * 365) + 1e-9);
});

test('répartition UC au prorata des fonds cochés', () => {
  const lignes = [
    { weight: 50, coche: true }, { weight: 30, coche: true }, { weight: 20, coche: true },
  ];
  assert.deepEqual(repartirUC(lignes, 70), [35, 21, 14]);
  lignes[2].coche = false;  // décocher renormalise les autres
  assert.deepEqual(repartirUC(lignes, 70), [43.8, 26.3, 0]);
  assert.deepEqual(repartirUC(lignes.map((l) => ({ ...l, coche: false })), 70), [0, 0, 0]);
});

test('indicateurs : mélange FE + DOP + UC, renormalisation des UC sans donnée', () => {
  const perfFE = perfFondsEuros(4, 0);
  const perfDOP = perfDop(5, 0);
  const uc = [
    { alloc: 30, a1: 10, a3: 30, a5: null, vol: 12 },
    { alloc: 30, a1: 0, a3: null, a5: null, vol: 6 },
  ];
  const k1 = indicateursPortefeuille({ periode: 'a1', allocFE: 30, allocDOP: 10, perfFE, perfDOP, uc });
  // 0,30 × 4 + 0,10 × 5 + 0,60 × (30×10 + 30×0)/60
  proche(k1.cumul, 1.2 + 0.5 + 3);
  proche(k1.annualise, k1.cumul);
  proche(k1.volatilite, 0.6 * 9);

  const k3 = indicateursPortefeuille({ periode: 'a3', allocFE: 30, allocDOP: 10, perfFE, perfDOP, uc });
  proche(k3.cumul, 0.3 * perfFE.a3 + 0.1 * 15 + 0.6 * 30);  // seul le 1er fonds a un 3 ans
  proche(k3.annualise, ((1 + k3.cumul / 100) ** (1 / 3) - 1) * 100);

  const k5 = indicateursPortefeuille({ periode: 'a5', allocFE: 30, allocDOP: 10, perfFE, perfDOP, uc });
  assert.equal(k5.cumul, null);
  assert.equal(k5.annualise, null);
});
