// Simulateur de projection (sous les onglets Portefeuilles modèles et perso).

import { el, vider } from './dom.js';
import { euros, nombre } from './format.js';
import { simuler, lignesAffichees } from './calc.js';

const MENTION = 'Projection théorique à rendement constant, hors frais et fiscalité. '
  + 'Les performances passées ne préjugent pas des performances futures.';

// Valeurs gardées d'un onglet à l'autre.
const valeurs = { initial: 10000, mensuel: 200, annees: 10, taux: 5.0 };

/**
 * source() renvoie le portefeuille affiché ({ rendementAnnualise, rendementUnAn, periode })
 * ou null s'il n'y en a pas.
 */
export function afficherSimulateur(conteneur, source) {
  const message = el('p', { classe: 'note', role: 'status' });
  const resultats = el('div');
  const champ = (cle, libelle, attrs, suffixe) => {
    const input = el('input', {
      type: 'number', inputmode: 'decimal', value: String(valeurs[cle]), 'aria-label': libelle, ...attrs,
      oninput: (e) => {
        const v = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(v)) { valeurs[cle] = v; calculer(); }
      },
    });
    return { input, bloc: el('label', { classe: 'champ-sim' }, [
      el('span', { classe: 'etiquette', texte: libelle }), el('span', {}, [input, ` ${suffixe}`]),
    ]) };
  };
  const initial = champ('initial', 'Versement initial', { min: '0', step: '100' }, '€');
  const mensuel = champ('mensuel', 'Versement mensuel', { min: '0', step: '10' }, '€');
  const annees = champ('annees', 'Horizon', { min: '1', max: '40', step: '1' }, 'ans');
  const taux = champ('taux', 'Rendement annuel', { step: '0.1' }, '%');

  const bouton = el('button', {
    type: 'button', classe: 'bouton-secondaire', texte: 'Utiliser le portefeuille affiché',
    onclick: () => {
      const p = source && source();
      let r = p ? p.rendementAnnualise() : null;
      let texte = '';
      if (p && r === null) {
        r = p.rendementUnAn();
        texte = 'Donnée manquante sur la période choisie : rendement 1 an utilisé.';
      }
      if (r === null || r === undefined) {
        message.textContent = 'Aucun rendement disponible pour ce portefeuille.';
        return;
      }
      valeurs.taux = Math.round(r * 10) / 10;
      taux.input.value = String(valeurs.taux);
      message.textContent = texte || `Rendement annualisé du portefeuille repris : ${nombre(valeurs.taux, 1)} %.`;
      calculer();
    },
  });

  function calculer() {
    const horizon = Math.min(40, Math.max(1, Math.round(valeurs.annees)));
    const s = simuler({
      initial: Math.max(0, valeurs.initial), mensuel: Math.max(0, valeurs.mensuel),
      annees: horizon, tauxAnnuel: valeurs.taux,
    });
    const kpi = (valeur, libelle) => el('div', { classe: 'kpi' }, [
      el('span', { classe: 'valeur', texte: valeur }), el('span', { classe: 'libelle', texte: libelle }),
    ]);
    vider(resultats).append(
      el('div', { classe: 'kpis' }, [
        kpi(euros(s.capital), `Capital projeté à ${horizon} an${horizon > 1 ? 's' : ''}`),
        kpi(euros(s.verse), 'Total versé'),
        kpi(euros(s.gains), 'Gains théoriques'),
      ]),
      el('div', { classe: 'tableau-defilant tableau-sim' }, el('table', { classe: 'tableau-fonds' }, [
        el('thead', {}, el('tr', {}, ['Année', 'Versé cumulé', 'Capital', 'Gains'].map((t) => el('th', { scope: 'col', texte: t })))),
        el('tbody', {}, lignesAffichees(s.annees).map((l) => el('tr', {}, [
          el('td', { texte: String(l.annee) }),
          el('td', { classe: 'nombre', texte: euros(l.verse) }),
          el('td', { classe: 'nombre', texte: euros(l.capital) }),
          el('td', { classe: 'nombre', texte: euros(l.gains) }),
        ]))),
      ])),
    );
  }

  vider(conteneur).append(el('section', { classe: 'carte simulateur' }, [
    el('div', { classe: 'entete-section' }, [el('h2', { texte: 'Simulateur de projection' }), source ? bouton : null]),
    el('div', { classe: 'champs-sim' }, [initial.bloc, mensuel.bloc, annees.bloc, taux.bloc]),
    message,
    resultats,
    el('p', { classe: 'note', texte: MENTION }),
  ]));
  calculer();
}
