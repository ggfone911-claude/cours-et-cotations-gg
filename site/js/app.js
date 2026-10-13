// Point d'entrée : chargement des données, en-tête, alerte de fraîcheur,
// routage par onglets (#fonds, #portefeuilles, #perso, #etat).

import { charger } from './data.js';
import { el, vider, ongletsClavier } from './dom.js';
import { pourcent, dateLongue, jourMois, VIDE } from './format.js';
import { joursOuvresEntre } from './calc.js';
import { afficherFonds } from './funds-view.js';

const ONGLETS = [
  { id: 'fonds', label: 'Fonds' },
  { id: 'portefeuilles', label: 'Portefeuilles modèles' },
  { id: 'perso', label: 'Portefeuilles perso' },
  { id: 'etat', label: 'État des données' },
];
const JOURS_OUVRES_MAX = 3;

let modele = null;

async function demarrer() {
  try {
    modele = await charger();
  } catch (e) {
    document.getElementById('contenu').replaceChildren(el('p', {
      classe: 'erreur', texte: `Les données n'ont pas pu être chargées (${e.message}).`,
    }));
    return;
  }
  enTete();
  alerteFraicheur();
  piedDePage();
  construireOnglets();
  window.addEventListener('hashchange', router);
  router();
}

function enTete() {
  document.getElementById('sous-titre').textContent = modele.dateVlMax
    ? `VL et performances Boursorama au ${dateLongue(modele.dateVlMax)}`
    : 'VL et performances Boursorama';

  const avecYtd = modele.fonds.filter((f) => f.eom.ytd !== null);
  const tries = [...avecYtd].sort((a, b) => b.eom.ytd - a.eom.ytd);
  const meilleur = tries[0];
  const moinsBon = tries[tries.length - 1];
  const chiffre = (valeur, libelle, detail) => el('div', { classe: 'chiffre-cle' }, [
    el('span', { classe: 'valeur', texte: valeur }),
    el('span', { classe: 'libelle', texte: libelle }),
    detail ? el('span', { classe: 'detail', texte: detail }) : null,
  ]);
  document.getElementById('chiffres-cles').replaceChildren(
    chiffre(String(modele.fonds.length), 'fonds suivis'),
    chiffre(String(modele.categories.length), 'catégories'),
    chiffre(meilleur ? pourcent(meilleur.eom.ytd) : VIDE, 'meilleur YTD', meilleur && meilleur.name),
    chiffre(moinsBon ? pourcent(moinsBon.eom.ytd) : VIDE, 'moins bon YTD', moinsBon && moinsBon.name),
  );
}

function alerteFraicheur() {
  const quotidien = modele.statut.daily;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const enEchec = quotidien && quotidien.ok === false;
  const enRetard = !modele.releve || joursOuvresEntre(modele.releve, aujourdhui) > JOURS_OUVRES_MAX;
  if (!enEchec && !enRetard) return;
  const date = modele.releve ? jourMois(modele.releve) : VIDE;
  const zone = document.getElementById('alerte');
  zone.textContent = enEchec
    ? `Données du ${date} — dernière mise à jour en échec`
    : `Données du ${date} — dernière mise à jour en retard`;
  zone.hidden = false;
}

function piedDePage() {
  document.getElementById('date-generation').textContent = modele.releve
    ? `Relevé du ${dateLongue(modele.releve)}.` : '';
}

function construireOnglets() {
  const liste = document.getElementById('onglets');
  liste.replaceChildren(...ONGLETS.map((o) => el('a', {
    href: `#${o.id}`, role: 'tab', id: `onglet-${o.id}`, 'aria-controls': 'contenu', texte: o.label,
  })));
  ongletsClavier(liste);
}

function router() {
  const id = (location.hash.slice(1).split('=')[0]) || 'fonds';
  const onglet = ONGLETS.find((o) => o.id === id) || ONGLETS[0];
  for (const o of ONGLETS) {
    const lien = document.getElementById(`onglet-${o.id}`);
    lien.setAttribute('aria-selected', String(o === onglet));
    lien.setAttribute('tabindex', o === onglet ? '0' : '-1');
  }
  const contenu = vider(document.getElementById('contenu'));
  contenu.setAttribute('aria-labelledby', `onglet-${onglet.id}`);
  if (onglet.id === 'fonds') afficherFonds(contenu, modele);
  else contenu.append(el('section', { classe: 'carte' }, [
    el('h2', { texte: onglet.label }),
    el('p', { texte: 'Cette partie du site arrive dans une prochaine étape.' }),
  ]));
}

demarrer();
