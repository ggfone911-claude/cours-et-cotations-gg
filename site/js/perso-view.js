// Portefeuilles perso : création, duplication, renommage, suppression,
// sélection des fonds et pondérations, sauvegarde, export / import, partage.

import { el, vider, ongletsClavier } from './dom.js';
import { nombre, TYPE_PAR_SRRI } from './format.js';
import {
  lireEtat, ecrireEtat, nouvelId, totalPoids, partsEgales, nomUnique,
  versExport, depuisExport, encoderPartage, decoderPartage,
} from './perso-store.js';
import { vuePortefeuille } from './portfolios-view.js';
import { afficherSimulateur } from './simulator.js';
import { lienFonds } from './liens.js';

let etat = null;
let modele = null;
let racine = null;
let message = null;          // { texte, type: 'info' | 'alerte' }
let confirmation = null;     // action en attente de confirmation dans la page
let renommage = false;
let partageEnAttente = null; // portefeuille proposé par un lien de partage
const decoches = new Map();

const isinsConnus = () => new Set(modele.fonds.map((f) => f.isin));
const actif = () => etat.portefeuilles.find((p) => p.id === etat.actif) || null;

export function afficherPerso(conteneur, donnees, codePartage) {
  modele = donnees;
  racine = conteneur;
  if (!etat) etat = lireEtat(isinsConnus());
  if (codePartage) {
    try {
      partageEnAttente = decoderPartage(codePartage, isinsConnus());
    } catch {
      partageEnAttente = null;
      message = { texte: 'Le lien de partage est illisible ou incomplet.', type: 'alerte' };
    }
    history.replaceState(null, '', '#perso');
  }
  rendre();
}

function sauver() {
  if (!ecrireEtat(etat)) {
    message = { texte: 'Ce navigateur refuse la sauvegarde : vos portefeuilles seront perdus à la fermeture. '
      + 'Pensez à les exporter.', type: 'alerte' };
  }
}

function informer(texte, type = 'info') {
  message = { texte, type };
  rendre();
}

function decochesDe(p) {
  if (!decoches.has(p.id)) {
    decoches.set(p.id, new Set(p.lignes.filter((l) => modele.parIsin[l.isin]?.pending).map((l) => l.isin)));
  }
  return decoches.get(p.id);
}

// ── Rendu ──────────────────────────────────────────────────────────────────
function rendre() {
  const focus = document.activeElement && racine.contains(document.activeElement)
    ? document.activeElement.getAttribute('data-focus') : null;
  vider(racine);
  if (partageEnAttente) racine.append(bandeauPartage());
  if (message) racine.append(el('p', { classe: `message ${message.type}`, role: 'status', texte: message.texte }));
  racine.append(cartePortefeuilles());

  const p = actif();
  if (p) {
    racine.append(carteComposition(p));
    const total = totalPoids(p.lignes);
    const zoneVue = el('div');
    const zoneSim = el('div');
    racine.append(zoneVue, zoneSim);
    if (p.lignes.length && total === 100) {
      const vue = vuePortefeuille(zoneVue, modele, {
        titre: `Portefeuille ${p.nom}`,
        entete: [el('h2', { texte: p.nom }), el('p', { classe: 'note', texte: 'Portefeuille personnalisé' })],
        infos: ['Portefeuille personnalisé.'],
        lignes: p.lignes,
        decoches: decochesDe(p),
      });
      afficherSimulateur(zoneSim, () => vue);
    } else {
      zoneVue.append(el('section', { classe: 'carte' }, el('p', {
        classe: 'vide',
        texte: p.lignes.length
          ? `Les pondérations totalisent ${nombre(total, 1)} % : elles doivent faire 100 % pour afficher les indicateurs.`
          : 'Ajoutez des fonds pour composer ce portefeuille.',
      })));
      afficherSimulateur(zoneSim, null);
    }
  }
  if (focus) {
    const n = racine.querySelector(`[data-focus="${CSS.escape(focus)}"]`);
    if (n) n.focus();
  }
}

function bandeauPartage() {
  const p = partageEnAttente.portefeuille;
  const ignores = partageEnAttente.ignores.length
    ? ` ${partageEnAttente.ignores.length} fonds inconnu(s) seront ignorés.` : '';
  return el('div', { classe: 'message info bandeau-partage', role: 'region', 'aria-label': 'Portefeuille partagé' }, [
    el('span', { texte: `Un portefeuille partagé « ${p.nom} » (${p.lignes.length} fonds) est proposé.${ignores}` }),
    el('button', {
      type: 'button', classe: 'bouton-principal', texte: 'L\'importer', 'data-focus': 'importer-partage',
      onclick: () => {
        ajouter({ ...p, nom: nomUnique(p.nom, etat.portefeuilles.map((x) => x.nom)) });
        partageEnAttente = null;
        informer(`Portefeuille « ${actif().nom} » importé.`);
      },
    }),
    el('button', {
      type: 'button', classe: 'bouton-secondaire', texte: 'Ignorer',
      onclick: () => { partageEnAttente = null; message = null; rendre(); },
    }),
  ]);
}

function ajouter(p) {
  const nouveau = { id: nouvelId(), nom: p.nom, lignes: p.lignes.map((l) => ({ ...l })) };
  etat.portefeuilles.push(nouveau);
  etat.actif = nouveau.id;
  sauver();
  return nouveau;
}

// ── Liste des portefeuilles et actions ─────────────────────────────────────
function cartePortefeuilles() {
  const p = actif();
  const noms = etat.portefeuilles.map((x) => x.nom);
  const onglets = el('div', { classe: 'sous-onglets', role: 'tablist', 'aria-label': 'Mes portefeuilles' },
    etat.portefeuilles.map((x) => el('button', {
      type: 'button', role: 'tab', 'aria-selected': String(x.id === etat.actif),
      tabindex: x.id === etat.actif ? '0' : '-1', 'data-focus': `onglet-${x.id}`,
      onclick: () => {
        etat.actif = x.id; confirmation = null; renommage = false; message = null; sauver(); rendre();
      },
    }, x.nom)));
  ongletsClavier(onglets);

  const bouton = (texte, action, attrs = {}) => el('button', {
    type: 'button', classe: 'bouton-secondaire', texte, onclick: action, ...attrs,
  });
  const fichier = el('input', {
    type: 'file', accept: 'application/json,.json', classe: 'sr-only', tabindex: '-1',
    onchange: (e) => importerFichier(e.target.files[0]),
  });

  const actions = [
    bouton('Nouveau', () => {
      ajouter({ nom: nomUnique('Mon portefeuille', noms), lignes: [] });
      message = null; renommage = true; rendre();
    }, { 'data-focus': 'nouveau' }),
    p && bouton('Dupliquer', () => {
      ajouter({ nom: nomUnique(`${p.nom} (copie)`, noms), lignes: p.lignes });
      informer('Portefeuille dupliqué.');
    }),
    p && bouton('Renommer', () => { renommage = true; confirmation = null; rendre(); }),
    p && bouton('Supprimer', () => { confirmation = 'supprimer'; renommage = false; rendre(); }),
    p && bouton('Exporter (JSON)', () => exporter(p)),
    bouton('Importer (JSON)', () => fichier.click()),
    p && p.lignes.length ? bouton('Copier le lien de partage', () => partager(p)) : null,
    fichier,
  ];

  return el('section', { classe: 'carte' }, [
    el('div', { classe: 'entete-section' }, [el('h2', { texte: 'Mes portefeuilles' })]),
    etat.portefeuilles.length ? onglets
      : el('p', { classe: 'vide', texte: 'Aucun portefeuille pour l\'instant. Créez-en un avec « Nouveau ».' }),
    el('div', { classe: 'actions-perso' }, actions),
    renommage && p ? formulaireRenommage(p) : null,
    confirmation === 'supprimer' && p ? confirmationSuppression(p) : null,
    el('p', { classe: 'note', texte: 'Vos portefeuilles sont enregistrés dans ce navigateur uniquement. '
      + 'Exportez-les ou partagez un lien pour les retrouver ailleurs.' }),
  ]);
}

function formulaireRenommage(p) {
  const champ = el('input', { type: 'text', value: p.nom, maxlength: '80', 'aria-label': 'Nouveau nom', classe: 'champ-texte' });
  const formulaire = el('form', {
    classe: 'ligne-confirmation',
    onsubmit: (e) => {
      e.preventDefault();
      const nom = champ.value.trim();
      if (!nom) return;
      p.nom = nomUnique(nom.slice(0, 80), etat.portefeuilles.filter((x) => x !== p).map((x) => x.nom));
      renommage = false; sauver(); rendre();
    },
  }, [
    el('label', {}, [el('span', { classe: 'etiquette', texte: 'Nom' }), champ]),
    el('button', { type: 'submit', classe: 'bouton-principal', texte: 'Enregistrer' }),
    el('button', { type: 'button', classe: 'bouton-secondaire', texte: 'Annuler', onclick: () => { renommage = false; rendre(); } }),
  ]);
  requestAnimationFrame(() => { champ.focus(); champ.select(); });
  return formulaire;
}

function confirmationSuppression(p) {
  const oui = el('button', {
    type: 'button', classe: 'bouton-danger', texte: 'Supprimer définitivement',
    onclick: () => {
      etat.portefeuilles = etat.portefeuilles.filter((x) => x !== p);
      etat.actif = etat.portefeuilles[0] ? etat.portefeuilles[0].id : null;
      decoches.delete(p.id);
      confirmation = null; sauver();
      informer(`Portefeuille « ${p.nom} » supprimé.`);
    },
  });
  requestAnimationFrame(() => oui.focus());
  return el('div', { classe: 'ligne-confirmation alerte', role: 'alertdialog', 'aria-label': 'Confirmer la suppression' }, [
    el('span', { texte: `Supprimer « ${p.nom} » ? Cette action est irréversible.` }),
    oui,
    el('button', { type: 'button', classe: 'bouton-secondaire', texte: 'Annuler', onclick: () => { confirmation = null; rendre(); } }),
  ]);
}

function exporter(p) {
  const blob = new Blob([JSON.stringify(versExport(p), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const lien = el('a', { href: url, download: `portefeuille-${p.nom.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.json` });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importerFichier(f) {
  if (!f) return;
  f.text().then((texte) => {
    const { portefeuille, ignores } = depuisExport(texte, isinsConnus());
    ajouter({ ...portefeuille, nom: nomUnique(portefeuille.nom, etat.portefeuilles.map((x) => x.nom)) });
    informer(`Portefeuille « ${actif().nom} » importé.${ignores.length
      ? ` Fonds inconnus ignorés : ${ignores.join(', ')}.` : ''}`);
  }).catch(() => informer('Ce fichier n\'est pas un export de portefeuille Cours et Cotations GG.', 'alerte'));
}

function partager(p) {
  const lien = `${location.origin}${location.pathname}#perso=${encoderPartage(p)}`;
  const repli = () => informer(`Copiez ce lien : ${lien}`);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(lien).then(() => informer('Lien de partage copié dans le presse-papiers.'), repli);
  } else {
    repli();
  }
}

// ── Composition : fonds et pondérations ────────────────────────────────────
function carteComposition(p) {
  const total = totalPoids(p.lignes);
  const lignes = p.lignes.map((l, i) => {
    const f = modele.parIsin[l.isin];
    return el('tr', {}, [
      el('td', { classe: 'gauche nom-fonds' }, [
        lienFonds(f),
        el('span', { classe: 'badge-type', texte: TYPE_PAR_SRRI[f.srri] || '' }),
        f.pending ? el('span', { classe: 'badge-attente', title: f.pending, texte: 'En attente' }) : null,
      ]),
      el('td', {}, el('input', {
        type: 'number', min: '0', max: '100', step: '0.1', value: String(l.weight), classe: 'champ-poids',
        'aria-label': `Pondération de ${f.name} (%)`, 'data-focus': `poids-${l.isin}`,
        onchange: (e) => {
          const v = Number(e.target.value);
          l.weight = Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0;
          sauver(); rendre();
        },
      })),
      el('td', {}, el('button', {
        type: 'button', classe: 'bouton-icone', 'aria-label': `Retirer ${f.name}`, texte: '✕',
        onclick: () => { p.lignes.splice(i, 1); sauver(); rendre(); },
      })),
    ]);
  });

  return el('section', { classe: 'carte' }, [
    el('div', { classe: 'entete-section' }, [
      el('h3', { texte: `Composition de « ${p.nom} »` }),
      el('div', { classe: 'actions-perso' }, [
        el('button', {
          type: 'button', classe: 'bouton-principal', texte: 'Ajouter / retirer des fonds',
          'data-focus': 'selection', onclick: () => ouvrirSelection(p),
        }),
        el('button', {
          type: 'button', classe: 'bouton-secondaire', texte: 'Répartir à parts égales',
          disabled: !p.lignes.length,
          onclick: () => { p.lignes = partsEgales(p.lignes); sauver(); rendre(); },
        }),
      ]),
    ]),
    p.lignes.length ? el('div', { classe: 'tableau-defilant' }, el('table', { classe: 'tableau-fonds tableau-composition' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { scope: 'col', classe: 'gauche', texte: 'Fonds' }),
        el('th', { scope: 'col', texte: 'Pondération (%)' }),
        el('th', { scope: 'col' }, el('span', { classe: 'sr-only', texte: 'Retirer' })),
      ])),
      el('tbody', {}, lignes),
    ])) : null,
    p.lignes.length ? el('p', {
      classe: `total-poids ${total === 100 ? 'ok' : 'ko'}`, role: 'status',
      texte: total === 100 ? 'Total : 100 % ✓' : `Total : ${nombre(total, 1)} % — il doit faire 100 %`,
    }) : null,
  ]);
}

// ── Fenêtre de sélection des fonds ─────────────────────────────────────────
function ouvrirSelection(p) {
  const choisis = new Set(p.lignes.map((l) => l.isin));
  const recherche = el('input', {
    type: 'search', classe: 'champ-recherche', placeholder: 'Nom, gérant ou ISIN',
    'aria-label': 'Rechercher un fonds', oninput: () => remplir(),
  });
  const liste = el('div', { classe: 'liste-selection' });
  const compteur = el('span', { classe: 'note-inline', role: 'status' });

  function remplir() {
    const q = recherche.value.trim().toLowerCase();
    vider(liste);
    for (const c of modele.categories) {
      const fonds = modele.fonds.filter((f) => f.category === c.id
        && (!q || [f.name, f.manager, f.isin].some((t) => (t || '').toLowerCase().includes(q))));
      if (!fonds.length) continue;
      liste.append(el('fieldset', {}, [
        el('legend', { texte: c.label }),
        ...fonds.map((f) => el('label', { classe: 'choix-fonds' }, [
          el('input', {
            type: 'checkbox', checked: choisis.has(f.isin),
            onchange: (e) => {
              if (e.target.checked) choisis.add(f.isin); else choisis.delete(f.isin);
              compteur.textContent = `${choisis.size} fonds sélectionné(s)`;
            },
          }),
          el('span', { texte: f.name }),
          el('span', { classe: 'note-inline', texte: ` SRRI ${f.srri} · ${f.manager}` }),
          f.pending ? el('span', { classe: 'badge-attente', title: f.pending, texte: 'En attente' }) : null,
        ])),
      ]));
    }
    if (!liste.firstChild) liste.append(el('p', { classe: 'vide', texte: 'Aucun fonds ne correspond.' }));
  }

  const fenetre = el('dialog', { classe: 'fenetre-selection', 'aria-label': 'Choisir les fonds' }, [
    el('div', { classe: 'entete-section' }, [el('h2', { texte: 'Choisir les fonds' }), compteur]),
    recherche,
    liste,
    el('div', { classe: 'actions-perso pied-fenetre' }, [
      el('button', {
        type: 'button', classe: 'bouton-principal', texte: 'Valider',
        onclick: () => {
          const etaitVide = !p.lignes.length || totalPoids(p.lignes) === 0;
          const gardees = p.lignes.filter((l) => choisis.has(l.isin));
          const ajoutees = [...choisis].filter((i) => !gardees.some((l) => l.isin === i))
            .map((isin) => ({ isin, weight: 0 }));
          p.lignes = [...gardees, ...ajoutees];
          if (etaitVide) p.lignes = partsEgales(p.lignes);
          decoches.delete(p.id);
          sauver();
          fenetre.close();
          if (ajoutees.length && !etaitVide) {
            informer('Fonds ajoutés avec une pondération de 0 % : ajustez les pondérations pour totaliser 100 %.');
          } else {
            rendre();
          }
        },
      }),
      el('button', { type: 'button', classe: 'bouton-secondaire', texte: 'Annuler', onclick: () => fenetre.close() }),
    ]),
  ]);
  fenetre.addEventListener('close', () => fenetre.remove());
  document.body.append(fenetre);
  compteur.textContent = `${choisis.size} fonds sélectionné(s)`;
  remplir();
  fenetre.showModal();
  recherche.focus();
}
