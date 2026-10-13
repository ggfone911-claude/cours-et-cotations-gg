// Version imprimable (ou PDF via « Enregistrer au format PDF ») d'un portefeuille.

import { el, vider } from './dom.js';

export const MENTIONS = 'Les performances passées ne préjugent pas des performances futures. '
  + 'L\'assureur ne s\'engage que sur le nombre d\'unités de compte et non sur leur valeur. '
  + 'Données issues de Boursorama, fournies à titre informatif, sans garantie d\'exactitude. '
  + 'Document établi à titre informatif, ne constitue pas un conseil en investissement.';

/**
 * contenu : { titre, lignesInfo: [texte], indicateurs: [[libellé, valeur]],
 *             entetes: [texte], lignes: [[texte]], notes: [texte] }
 */
export function imprimer(contenu) {
  let zone = document.getElementById('impression');
  if (!zone) {
    zone = el('div', { id: 'impression', 'aria-hidden': 'true' });
    document.body.append(zone);
  }
  vider(zone).append(
    el('h1', { texte: 'Cours et Cotations GG' }),
    el('h2', { texte: contenu.titre }),
    ...contenu.lignesInfo.map((t) => el('p', { classe: 'info-impression', texte: t })),
    el('div', { classe: 'kpi-impression' }, contenu.indicateurs.map(([libelle, valeur]) => el('div', {}, [
      el('span', { classe: 'valeur', texte: valeur }), el('span', { texte: libelle }),
    ]))),
    el('table', {}, [
      el('thead', {}, el('tr', {}, contenu.entetes.map((t) => el('th', { texte: t })))),
      el('tbody', {}, contenu.lignes.map((l) => el('tr', {}, l.map((t) => el('td', { texte: t }))))),
    ]),
    ...contenu.notes.map((t) => el('p', { classe: 'info-impression', texte: t })),
    el('p', { classe: 'mentions-impression', texte: MENTIONS }),
  );
  document.body.classList.add('mode-impression');
  const fin = () => {
    document.body.classList.remove('mode-impression');
    window.removeEventListener('afterprint', fin);
  };
  window.addEventListener('afterprint', fin);
  window.print();
}
