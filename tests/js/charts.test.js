import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bornesResserrees } from '../../site/js/charts.js';

test('échelle resserrée : valeurs positives et proches', () => {
  // Cas des fonds monétaires : +0,66 % à +1,56 %.
  const b = bornesResserrees([1.56, 0.75, 0.66]);
  assert.ok(b.min > 0 && b.min < 0.66);
  assert.equal(b.max, undefined);
});

test('échelle resserrée : valeurs négatives et proches', () => {
  const b = bornesResserrees([-2.1, -2.5, -3.0]);
  assert.ok(b.max < 0 && b.max > -2.1);
  assert.equal(b.min, undefined);
});

test('axe à 0 % : signes mélangés, valeurs dispersées ou fonds unique', () => {
  assert.deepEqual(bornesResserrees([2, -1, 5]), {});
  assert.deepEqual(bornesResserrees([10, 1]), {});
  assert.deepEqual(bornesResserrees([3]), {});
});

test('valeurs identiques : marge non nulle', () => {
  const b = bornesResserrees([2, 2]);
  assert.ok(b.min < 2 && b.min >= 0);
});
