"""Contrôles de cohérence des fichiers de data/.

Usage : python scripts/validate.py [dossier_data]

Sort avec le code 1 et la liste des erreurs si un contrôle échoue.
Les fichiers générés (quotes.json, history.json, daily.json) ne sont contrôlés
que s'ils existent.
"""
import json
import re
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"

ISIN_RE = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$")
BOURSO_RE = re.compile(r"^(0P[0-9A-Z]{8}|MP-\d+)$")
COULEUR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def isin_valide(isin):
    """Format ISIN (12 caractères) et clé de contrôle (algorithme de Luhn)."""
    if not isinstance(isin, str) or not ISIN_RE.match(isin):
        return False
    chiffres = "".join(str(int(c, 36)) for c in isin[:11])
    total = 0
    for i, c in enumerate(reversed(chiffres)):
        n = int(c)
        if i % 2 == 0:  # le chiffre le plus à droite est doublé
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return (10 - total % 10) % 10 == int(isin[11])


def valider_funds(funds):
    erreurs = []
    ids_cat = set()
    for c in funds.get("categories", []):
        if c.get("id") in ids_cat:
            erreurs.append(f"Catégorie en double : {c.get('id')}")
        ids_cat.add(c.get("id"))
        if not c.get("label"):
            erreurs.append(f"Catégorie {c.get('id')} sans libellé")
        if not COULEUR_RE.match(str(c.get("color", ""))):
            erreurs.append(f"Catégorie {c.get('id')} : couleur invalide")

    vus = set()
    for f in funds.get("funds", []):
        isin = f.get("isin")
        if not isin_valide(isin):
            erreurs.append(f"ISIN invalide : {isin}")
        if isin in vus:
            erreurs.append(f"ISIN en double : {isin}")
        vus.add(isin)
        if not BOURSO_RE.match(str(f.get("bourso_id") or "")):
            erreurs.append(f"{isin} : identifiant Boursorama absent ou invalide")
        if not f.get("name"):
            erreurs.append(f"{isin} : nom absent")
        if f.get("category") not in ids_cat:
            erreurs.append(f"{isin} : catégorie inconnue {f.get('category')!r}")
        srri = f.get("srri")
        if not isinstance(srri, int) or isinstance(srri, bool) or not 1 <= srri <= 7:
            erreurs.append(f"{isin} : SRRI hors de 1 à 7 ({srri!r})")
        if not isinstance(f.get("displayed"), bool):
            erreurs.append(f"{isin} : champ displayed absent")
        if f.get("pending") is not None and not isinstance(f["pending"], str):
            erreurs.append(f"{isin} : pending doit être un texte ou null")
    return erreurs


def valider_portfolios(portfolios, funds):
    erreurs = []
    connus = {f["isin"] for f in funds.get("funds", [])}
    for p in portfolios.get("profiles", []):
        nom = p.get("label", p.get("id"))
        lignes = p.get("funds", [])
        total = sum(l.get("weight", 0) for l in lignes)
        if total != 100:
            erreurs.append(f"Portefeuille {nom} : pondérations = {total}, attendu 100")
        isins = [l.get("isin") for l in lignes]
        for isin in isins:
            if isin not in connus:
                erreurs.append(f"Portefeuille {nom} : {isin} absent de funds.json")
        if len(isins) != len(set(isins)):
            erreurs.append(f"Portefeuille {nom} : fonds en double")
        for l in lignes:
            if not isinstance(l.get("weight"), (int, float)) or l["weight"] <= 0:
                erreurs.append(f"Portefeuille {nom} : pondération invalide pour {l.get('isin')}")
    return erreurs


def _allocation(nom, a):
    if not (isinstance(a, dict) and a.get("min", -1) <= a.get("default", -1) <= a.get("max", -1)):
        return [f"{nom} : allocation incohérente (min ≤ défaut ≤ max)"]
    return []


def valider_euro_fund(ef):
    erreurs = []
    fe = ef.get("euro_fund", {})
    erreurs += _allocation("Fonds en euros", fe.get("allocation"))
    grille = fe.get("grid", [])
    if not grille:
        erreurs.append("Fonds en euros : grille vide")
    seuils = [g.get("uc_min") for g in grille]
    if seuils != sorted(seuils, reverse=True) or (seuils and seuils[-1] != 0):
        erreurs.append("Fonds en euros : tranches non décroissantes ou sans tranche à 0 %")
    for g in grille:
        if not (0 <= g.get("rate_low", -1) <= g.get("rate_high", -1)):
            erreurs.append(f"Fonds en euros : taux incohérents pour {g.get('label')}")
    dop = ef.get("dop", {})
    erreurs += _allocation("DOP", dop.get("allocation"))
    if not isinstance(dop.get("rate"), (int, float)) or dop["rate"] < 0:
        erreurs.append("DOP : taux invalide")
    return erreurs


def valider_quotes(quotes, funds):
    erreurs = []
    connus = {f["isin"] for f in funds.get("funds", [])}
    if not DATE_RE.match(str(quotes.get("last_updated", ""))):
        erreurs.append("quotes.json : last_updated invalide")
    for isin, q in quotes.get("data", {}).items():
        if isin not in connus:
            erreurs.append(f"quotes.json : {isin} absent de funds.json")
        vl = q.get("vl")
        if vl is not None and (not isinstance(vl, (int, float)) or vl <= 0):
            erreurs.append(f"quotes.json : VL invalide pour {isin}")
    return erreurs


def valider_history(history, funds):
    erreurs = []
    connus = {f["isin"] for f in funds.get("funds", [])}
    for isin, points in history.get("data", {}).items():
        if isin not in connus:
            erreurs.append(f"history.json : {isin} absent de funds.json")
        dates = [p.get("date") for p in points]
        if dates != sorted(dates) or len(dates) != len(set(dates)):
            erreurs.append(f"history.json : dates non triées ou en double pour {isin}")
        if len(points) > 61:  # 60 mois glissants + le mois de base
            erreurs.append(f"history.json : plus de 61 points mensuels pour {isin}")
    return erreurs


def valider_daily(daily, funds):
    erreurs = []
    connus = {f["isin"] for f in funds.get("funds", [])}
    for isin, points in daily.get("data", {}).items():
        if isin not in connus:
            erreurs.append(f"daily.json : {isin} absent de funds.json")
        dates = [p.get("date") for p in points]
        if dates != sorted(dates) or len(dates) != len(set(dates)) \
                or not all(DATE_RE.match(str(d)) for d in dates):
            erreurs.append(f"daily.json : dates invalides, non triées ou en double pour {isin}")
        if any(not isinstance(p.get("vl"), (int, float)) or p["vl"] <= 0 for p in points):
            erreurs.append(f"daily.json : VL invalide pour {isin}")
    return erreurs


def charger(dossier, nom, obligatoire=True):
    chemin = dossier / nom
    if not chemin.exists():
        if obligatoire:
            raise FileNotFoundError(f"{nom} introuvable")
        return None
    return json.loads(chemin.read_text(encoding="utf-8"))


def valider(dossier=DATA):
    try:
        funds = charger(dossier, "funds.json")
        portfolios = charger(dossier, "portfolios.json")
        euro_fund = charger(dossier, "euro_fund.json")
        quotes = charger(dossier, "quotes.json", obligatoire=False)
        history = charger(dossier, "history.json", obligatoire=False)
        daily = charger(dossier, "daily.json", obligatoire=False)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        return [str(e)]

    erreurs = valider_funds(funds)
    erreurs += valider_portfolios(portfolios, funds)
    erreurs += valider_euro_fund(euro_fund)
    if quotes is not None:
        erreurs += valider_quotes(quotes, funds)
    if history is not None:
        erreurs += valider_history(history, funds)
    if daily is not None:
        erreurs += valider_daily(daily, funds)
    return erreurs


def main(argv):
    dossier = Path(argv[1]) if len(argv) > 1 else DATA
    erreurs = valider(dossier)
    if erreurs:
        print(f"{len(erreurs)} erreur(s) :")
        for e in erreurs:
            print(f"  - {e}")
        return 1
    print("Données valides.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
