// Construction du DOM sans innerHTML : tout texte passe par textContent.

export function el(balise, attributs = {}, enfants = []) {
  const n = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(attributs)) {
    if (valeur === null || valeur === undefined || valeur === false) continue;
    if (cle === 'texte') n.textContent = valeur;
    else if (cle === 'classe') n.className = valeur;
    else if (cle === 'style') {
      // setProperty gère aussi les variables CSS (« --srri »), ignorées par Object.assign.
      for (const [p, v] of Object.entries(valeur)) n.style.setProperty(p, v);
    }
    else if (cle.startsWith('on')) n.addEventListener(cle.slice(2), valeur);
    else n.setAttribute(cle, valeur === true ? '' : valeur);
  }
  for (const enfant of [].concat(enfants)) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    n.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
  }
  return n;
}

export function vider(n) {
  while (n.firstChild) n.removeChild(n.firstChild);
  return n;
}

// Barre d'onglets accessible au clavier (flèches gauche/droite, Début, Fin).
export function ongletsClavier(liste) {
  liste.addEventListener('keydown', (e) => {
    const onglets = [...liste.querySelectorAll('[role="tab"]')];
    const i = onglets.indexOf(document.activeElement);
    if (i < 0) return;
    const cible = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: onglets.length - 1 }[e.key];
    if (cible === undefined) return;
    e.preventDefault();
    const o = onglets[(cible + onglets.length) % onglets.length];
    o.focus();
    o.click();
  });
}
