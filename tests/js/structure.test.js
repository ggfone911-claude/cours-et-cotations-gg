// Contrôle de base du lot 0 : la page d'accueil existe et est en français.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('la page d\'accueil existe et est en français', () => {
  const html = readFileSync(new URL('../../site/index.html', import.meta.url), 'utf8');
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /Cours et Cotations GG/);
});
