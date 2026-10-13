// Onglet État des données : derniers relevés (status.json), fonds en échec ou
// en attente, âge de la VL de chaque fonds.

import { el, vider } from './dom.js';
import { dateLongue, dateCourte, VIDE } from './format.js';
import { comparer } from './calc.js';
import { lienFonds } from './liens.js';

const URL_ACTIONS = 'https://github.com/ggfone911-claude/cours-et-cotations-gg/actions';
const AGE_ALERTE_JOURS = 8;   // même seuil que le garde-fou du relevé

function ageEnJours(iso, aujourdhui) {
  if (!iso) return null;
  return Math.round((Date.parse(`${aujourdhui}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86400000);
}

function dateHeure(iso) {
  if (!iso) return VIDE;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return VIDE;
  return d.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function carteStatut(titre, statut, nom, extra) {
  if (!statut) {
    return el('section', { classe: 'carte' }, [el('h3', { texte: titre }), el('p', { classe: 'vide', texte: 'Aucun relevé enregistré.' })]);
  }
  return el('section', { classe: 'carte' }, [
    el('div', { classe: 'entete-section' }, [
      el('h3', { texte: titre }),
      el('span', { classe: `badge-statut ${statut.ok ? 'ok' : 'ko'}`, texte: statut.ok ? 'Réussi' : 'En échec' }),
    ]),
    el('dl', { classe: 'liste-statut' }, [
      el('dt', { texte: 'Date' }), el('dd', { texte: dateHeure(statut.date) }),
      el('dt', { texte: 'Fonds relevés' }), el('dd', { texte: `${statut.funds_ok} / ${statut.funds_total}` }),
      el('dt', { texte: 'Fonds en échec' }),
      el('dd', {}, listeEchecs(statut.failed_isins || [], nom)),
      statut.failed_step ? el('dt', { texte: 'Étape en échec' }) : null,
      statut.failed_step ? el('dd', { texte: statut.failed_step }) : null,
      el('dt', { texte: 'Message' }), el('dd', { texte: statut.message || VIDE }),
      ...(extra || []),
    ]),
  ]);
}

// Liste courte affichée directement ; au-delà de 5 fonds, repliée.
function listeEchecs(isins, nom) {
  if (!isins.length) return 'aucun';
  const texte = isins.map(nom).join(', ');
  if (isins.length <= 5) return texte;
  return el('details', {}, [el('summary', { texte: `${isins.length} fonds (afficher la liste)` }), el('p', { texte })]);
}

export function afficherEtat(conteneur, modele) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const s = modele.statut || {};
  const enAttente = modele.tousLesFonds.filter((f) => f.pending);
  const nom = (isin) => (modele.parIsin[isin] ? `${modele.parIsin[isin].name} (${isin})` : isin);

  const fonds = [...modele.tousLesFonds].map((f) => ({ ...f, age: ageEnJours(f.dateVl, aujourdhui) }))
    // Les plus anciennes d'abord ; une VL absente est la plus à surveiller.
    .sort((a, b) => comparer(a.age ?? Infinity, b.age ?? Infinity, -1));
  const lignes = fonds.map((f) => {
    const vieux = f.age === null || f.age > AGE_ALERTE_JOURS;
    return el('tr', { classe: vieux ? 'ligne-attente' : null }, [
      el('td', { classe: 'gauche' }, lienFonds(f)),
      el('td', { texte: f.displayed ? 'Affiché' : 'Masqué (part D)' }),
      el('td', { texte: dateCourte(f.dateVl) }),
      el('td', { classe: 'nombre', texte: f.age === null ? VIDE : `${f.age} j` }),
      el('td', { classe: 'gauche', texte: [
        f.pending ? 'En attente' : '',
        f.perimeDepuis ? `non relevé depuis le ${dateCourte(f.perimeDepuis)}` : '',
      ].filter(Boolean).join(' · ') || VIDE }),
    ]);
  });

  vider(conteneur).append(
    el('section', { classe: 'carte' }, [
      el('h2', { texte: 'État des données' }),
      el('p', { texte: `VL la plus récente : ${dateLongue(modele.dateVlMax)}. Dernier relevé enregistré : ${dateLongue(modele.releve)}. `
        + `Historique mensuel mis à jour le ${dateLongue(modele.historiqueMaj)}.` }),
      el('p', {}, [
        'Le détail de chaque exécution est visible sur la ',
        el('a', { href: URL_ACTIONS, target: '_blank', rel: 'noopener', texte: 'page Actions du dépôt GitHub' }),
        '.',
      ]),
    ]),
    el('div', { classe: 'graphiques' }, [
      carteStatut('Relevé quotidien', s.daily, nom, s.daily && s.daily.newest_vl_date
        ? [el('dt', { texte: 'VL la plus récente' }), el('dd', { texte: dateCourte(s.daily.newest_vl_date) })] : []),
      carteStatut('Historique mensuel', s.monthly, nom),
    ]),
    el('section', { classe: 'carte' }, [
      el('h3', { texte: `Fonds en attente (${enAttente.length})` }),
      enAttente.length ? el('ul', {}, enAttente.map((f) => el('li', { texte: `${f.name} (${f.isin}) — ${f.pending}` })))
        : el('p', { classe: 'vide', texte: 'Aucun.' }),
    ]),
    el('section', { classe: 'carte' }, [
      el('h3', { texte: `Âge de la VL de chaque fonds (${fonds.length} relevés)` }),
      el('p', { classe: 'note', texte: `Surlignés : VL absente ou datée de plus de ${AGE_ALERTE_JOURS} jours.` }),
      el('div', { classe: 'tableau-defilant' }, el('table', { classe: 'tableau-fonds' }, [
        el('thead', {}, el('tr', {}, ['Fonds', 'Affichage', 'Date VL', 'Âge', 'Remarque']
          .map((t, i) => el('th', { scope: 'col', classe: [0, 4].includes(i) ? 'gauche' : null, texte: t })))),
        el('tbody', {}, lignes),
      ])),
    ]),
  );
}
