// Portefeuilles perso : sauvegarde navigateur, export / import JSON, lien de
// partage. Fonctions pures, sauf lire / ecrire (localStorage, sous try/catch).

export const CLE_STOCKAGE = 'ccgg.perso.v1';
export const FORMAT_EXPORT = 'ccgg.perso';
const NOM_MAX = 80;

export function etatVide() {
  return { version: 1, actif: null, portefeuilles: [] };
}

export function nouvelId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Garde uniquement ce qui est sûr et connu : nom texte, ISIN présents dans le
 * référentiel, pondérations numériques ≥ 0 (une seule ligne par ISIN).
 * Renvoie { portefeuille: {nom, lignes}, ignores: [ISIN inconnus ou invalides] }.
 */
export function nettoyer(brut, isinsConnus) {
  const nom = (typeof brut?.nom === 'string' ? brut.nom : '').trim().slice(0, NOM_MAX)
    || 'Portefeuille importé';
  const lignes = [];
  const ignores = [];
  const vus = new Set();
  for (const l of Array.isArray(brut?.lignes) ? brut.lignes : []) {
    const isin = Array.isArray(l) ? l[0] : l?.isin;
    const poids = Number(Array.isArray(l) ? l[1] : l?.weight);
    if (typeof isin !== 'string' || !isinsConnus.has(isin) || !Number.isFinite(poids) || poids < 0) {
      ignores.push(String(isin));
      continue;
    }
    if (vus.has(isin)) continue;
    vus.add(isin);
    lignes.push({ isin, weight: Math.round(poids * 100) / 100 });
  }
  return { portefeuille: { nom, lignes }, ignores };
}

export function lireEtat(isinsConnus, stockage = globalThis.localStorage) {
  try {
    const brut = JSON.parse(stockage.getItem(CLE_STOCKAGE));
    if (!brut || !Array.isArray(brut.portefeuilles)) return etatVide();
    const portefeuilles = brut.portefeuilles.map((p) => ({
      id: typeof p.id === 'string' ? p.id : nouvelId(),
      ...nettoyer(p, isinsConnus).portefeuille,
    }));
    const actif = portefeuilles.some((p) => p.id === brut.actif) ? brut.actif
      : (portefeuilles[0] ? portefeuilles[0].id : null);
    return { version: 1, actif, portefeuilles };
  } catch {
    return etatVide();
  }
}

// Renvoie false si le navigateur refuse la sauvegarde (navigation privée, quota…).
export function ecrireEtat(etat, stockage = globalThis.localStorage) {
  try {
    stockage.setItem(CLE_STOCKAGE, JSON.stringify(etat));
    return true;
  } catch {
    return false;
  }
}

export function totalPoids(lignes) {
  return Math.round(lignes.reduce((s, l) => s + (Number(l.weight) || 0), 0) * 100) / 100;
}

// Parts égales au dixième de point ; la dernière ligne absorbe l'arrondi
// pour que le total fasse exactement 100.
export function partsEgales(lignes) {
  if (!lignes.length) return [];
  const part = Math.floor((100 / lignes.length) * 10) / 10;
  return lignes.map((l, i) => ({
    ...l,
    weight: i === lignes.length - 1
      ? Math.round((100 - part * (lignes.length - 1)) * 10) / 10 : part,
  }));
}

export function nomUnique(nom, existants) {
  const noms = new Set(existants);
  if (!noms.has(nom)) return nom;
  let n = 2;
  while (noms.has(`${nom} (${n})`)) n += 1;
  return `${nom} (${n})`;
}

// ── Export / import de fichier ────────────────────────────────────────────
export function versExport(portefeuille) {
  return {
    format: FORMAT_EXPORT,
    version: 1,
    nom: portefeuille.nom,
    lignes: portefeuille.lignes.map((l) => ({ isin: l.isin, weight: l.weight })),
  };
}

export function depuisExport(texte, isinsConnus) {
  const brut = JSON.parse(texte);
  if (!brut || brut.format !== FORMAT_EXPORT) throw new Error('fichier non reconnu');
  return nettoyer(brut, isinsConnus);
}

// ── Lien de partage : #perso=<base64url du JSON> ───────────────────────────
export function encoderPartage(portefeuille) {
  const json = JSON.stringify({ v: 1, nom: portefeuille.nom, lignes: portefeuille.lignes.map((l) => [l.isin, l.weight]) });
  const octets = new TextEncoder().encode(json);
  let binaire = '';
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decoderPartage(code, isinsConnus) {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const binaire = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const octets = Uint8Array.from(binaire, (c) => c.charCodeAt(0));
  return nettoyer(JSON.parse(new TextDecoder().decode(octets)), isinsConnus);
}
