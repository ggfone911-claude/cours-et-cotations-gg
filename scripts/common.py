"""Outils partagés par les scrapers : HTTP, nombres, référentiel, écriture JSON."""
import datetime
import gzip
import http.cookiejar
import json
import os
import re
import tempfile
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DATA = RACINE / "data"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
HEADERS_HTML = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9",
    "Accept-Encoding": "gzip",
}
HEADERS_XHR = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "fr-FR,fr;q=0.9",
    "Accept-Encoding": "gzip",
    "X-Requested-With": "XMLHttpRequest",
}
TIMEOUT = 20      # secondes
PAUSE = 0.8       # secondes entre deux fonds, jamais de requêtes en parallèle

# Remplaçable par la variable d'environnement CCGG_URL_FICHE, uniquement pour
# simuler une panne (recette : workflow lancé avec « simuler_echec »).
URL_FICHE = os.environ.get("CCGG_URL_FICHE") or "https://www.boursorama.com/bourse/opcvm/cours/{}/"


def ouvreur():
    """Client HTTP qui garde les cookies (nécessaire pour GetTicksEOD)."""
    return urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def telecharger(url, headers=HEADERS_HTML, opener=None):
    """Texte de la réponse, décompressé si besoin. Lève une exception en cas d'erreur."""
    req = urllib.request.Request(url, headers=headers)
    ouvrir = opener.open if opener else urllib.request.urlopen
    with ouvrir(req, timeout=TIMEOUT) as resp:
        brut = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            brut = gzip.decompress(brut)
    return brut.decode("utf-8", errors="replace")


_VIDES = {"", "-", "–", "—", "ND", "N/A", "NC"}


def nombre(texte):
    """« +1 234,56 % » → 1234.56 ; « - », « ND », « » → None."""
    if texte is None:
        return None
    s = (str(texte).replace(" ", "").replace(" ", "").replace(" ", "")
         .replace("%", "").replace("€", "").replace(",", ".").replace("−", "-")
         .strip())
    if s.upper() in _VIDES:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def date_fr(texte):
    """« 09/10/2026 » → « 2026-10-09 » ; None si illisible."""
    m = re.match(r"^(\d{2})[/.](\d{2})[/.](\d{4})$", (texte or "").strip())
    if not m:
        return None
    j, mo, a = m.groups()
    try:
        return datetime.date(int(a), int(mo), int(j)).isoformat()
    except ValueError:
        return None


def charger_json(chemin, defaut=None):
    chemin = Path(chemin)
    if not chemin.exists():
        return defaut
    return json.loads(chemin.read_text(encoding="utf-8"))


def ecrire_json(chemin, contenu):
    """Écriture atomique : un fichier n'est jamais laissé à moitié écrit."""
    chemin = Path(chemin)
    fd, tmp = tempfile.mkstemp(dir=chemin.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(contenu, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.chmod(tmp, 0o644)  # mkstemp crée le fichier en 0600
    os.replace(tmp, chemin)


def charger_fonds(dossier=DATA):
    """Liste des fonds à relever : [(isin, bourso_id)], dans l'ordre de funds.json."""
    ref = charger_json(Path(dossier) / "funds.json")
    return [(f["isin"], f["bourso_id"]) for f in ref["funds"]]


def maj_statut(dossier, cle, contenu):
    """Met à jour une section (« daily » ou « monthly ») de status.json."""
    chemin = Path(dossier) / "status.json"
    statut = charger_json(chemin, {}) or {}
    statut[cle] = contenu
    ecrire_json(chemin, statut)


def maintenant_utc():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
