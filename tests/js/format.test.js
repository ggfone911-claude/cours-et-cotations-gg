import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pourcent, euros, nombre, dateLongue, dateCourte, jourMois, moisAnnee, classeSigne,
} from '../../site/js/format.js';

// Intl fr-FR sépare les milliers par une espace fine insécable (U+202F).
const norm = (s) => s.replace(/ | /g, ' ');

test('pourcentages : signe toujours affiché', () => {
  assert.equal(norm(pourcent(3.45)), '+3,45 %');
  assert.equal(norm(pourcent(-1.16)), '−1,16 %');
  assert.equal(norm(pourcent(0)), '0,00 %');
  assert.equal(norm(pourcent(-0.001)), '0,00 %');
  assert.equal(norm(pourcent(1234.5)), '+1 234,50 %');
});

test('montants', () => {
  assert.equal(norm(euros(1234.56)), '1 234,56 €');
  assert.equal(norm(euros(171412.91)), '171 412,91 €');
  assert.equal(norm(nombre(-2.5, 1)), '−2,5');
});

test('valeurs absentes : « — »', () => {
  for (const f of [pourcent, euros, nombre, dateLongue, dateCourte, jourMois, moisAnnee]) {
    assert.equal(f(null), '—');
    assert.equal(f(undefined), '—');
  }
  assert.equal(pourcent(Number.NaN), '—');
});

test('dates', () => {
  assert.equal(dateLongue('2026-10-11'), '11 octobre 2026');
  assert.equal(dateLongue('2026-08-01'), '1er août 2026');
  assert.equal(dateCourte('2026-10-09'), '09/10/2026');
  assert.equal(jourMois('2026-10-09'), '09/10');
  assert.equal(moisAnnee('2025-02'), 'févr. 2025');
  assert.equal(dateLongue('n/a'), '—');
});

test('classe de couleur', () => {
  assert.equal(classeSigne(1), 'positif');
  assert.equal(classeSigne(-1), 'negatif');
  assert.equal(classeSigne(0), 'neutre');
  assert.equal(classeSigne(null), 'neutre');
});
