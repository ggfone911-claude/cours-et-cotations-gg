// Nom de fonds cliquable vers sa fiche Boursorama, avec l'ISIN en dessous.

import { el } from './dom.js';

const URL_FICHE = 'https://www.boursorama.com/bourse/opcvm/cours/';

export function lienFonds(f) {
  return el('span', { classe: 'bloc-nom' }, [
    el('a', {
      href: `${URL_FICHE}${encodeURIComponent(f.bourso_id)}/`, target: '_blank', rel: 'noopener',
      classe: 'lien-fonds', title: `Fiche Boursorama de ${f.name} (nouvel onglet)`, texte: f.name,
    }),
    el('span', { classe: 'isin', texte: f.isin }),
  ]);
}
