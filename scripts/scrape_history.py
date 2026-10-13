"""Historique mensuel des VL (60 mois glissants) → data/history.json.

Usage : python scripts/scrape_history.py

Pour chaque fonds : ouverture de la fiche Boursorama (cookies de session),
puis appel de l'endpoint GetTicksEOD (Referer + X-Requested-With,
length=1825, soit 5 ans de cours journaliers). On garde la dernière VL de
chaque mois et les 60 derniers mois.

- Les cotations aberrantes (facteur > 5 par rapport à la médiane d'une
  fenêtre de 5 mois) sont écartées. Cas réel : FR0010106500 à 47 948 € au lieu de 487 € en 09/2021.
- Si un fonds échoue, son historique existant est conservé tel quel.
- Si moins de 60 % des fonds aboutissent, le script sort avec le code 1 et
  history.json n'est pas modifié (seul status.json l'est).
"""
import datetime
import statistics
import sys
import time

import common

TAUX_MIN = 0.60
MOIS_MAX = 60
FACTEUR_ABERRANT = 5
URL_TICKS = ("https://www.boursorama.com/bourse/action/graph/ws/GetTicksEOD"
             "?symbol={}&length=1825&period=0&guid=")
_EPOCH = datetime.date(1970, 1, 1)


def mensualiser(reponse):
    """Réponse GetTicksEOD → [{"date": "AAAA-MM", "vl": float}] trié (dernier cours du mois).

    Format Boursorama : {"d": {"QuoteTab": [{"d": <jours depuis 1970>, "c": <clôture>, …}]}}.
    """
    try:
        ticks = reponse["d"]["QuoteTab"]
    except (KeyError, TypeError):
        return []
    par_mois = {}
    for t in ticks if isinstance(ticks, list) else []:
        try:
            jour = _EPOCH + datetime.timedelta(days=int(t["d"]))
            vl = float(t["c"])
        except (KeyError, TypeError, ValueError, OverflowError):
            continue
        if vl > 0:
            cle = jour.strftime("%Y-%m")
            if cle not in par_mois or jour >= par_mois[cle][0]:
                par_mois[cle] = (jour, vl)
    return [{"date": m, "vl": par_mois[m][1]} for m in sorted(par_mois)]


def journaliser(reponse):
    """Réponse GetTicksEOD → [{"date": "AAAA-MM-JJ", "vl": float}] trié, un point par jour."""
    try:
        ticks = reponse["d"]["QuoteTab"]
    except (KeyError, TypeError):
        return []
    par_jour = {}
    for t in ticks if isinstance(ticks, list) else []:
        try:
            jour = _EPOCH + datetime.timedelta(days=int(t["d"]))
            vl = float(t["c"])
        except (KeyError, TypeError, ValueError, OverflowError):
            continue
        if vl > 0:
            par_jour[jour.isoformat()] = vl
    return [{"date": j, "vl": par_jour[j]} for j in sorted(par_jour)]


def filtrer_aberrants(points):
    """Écarte un point qui s'écarte d'un facteur > 5 de la médiane de son voisinage.

    Le voisinage est une fenêtre de 5 mois contenant le point (centrée, ou
    décalée en début et fin de série pour rester complète). La médiane de 5
    valeurs n'est pas déplacée par un point aberrant isolé, contrairement à
    celle de deux voisins en bout de série. Sous 3 points, rien n'est filtré.
    """
    gardes = []
    for i, p in enumerate(points):
        debut = max(0, min(i - 2, len(points) - 5))
        fenetre = [q["vl"] for q in points[debut:debut + 5]]
        if len(fenetre) >= 3:
            med = statistics.median(fenetre)
            if p["vl"] / med > FACTEUR_ABERRANT or med / p["vl"] > FACTEUR_ABERRANT:
                print(f"      point aberrant écarté : {p['date']} = {p['vl']} "
                      f"(médiane du voisinage {med})")
                continue
        gardes.append(p)
    return gardes


def historique_fonds(reponse):
    return filtrer_aberrants(mensualiser(reponse))[-MOIS_MAX:]


def telecharger_ticks(bid):
    """Ouvre la fiche (cookies) puis appelle GetTicksEOD. Renvoie le JSON décodé."""
    import json

    opener = common.ouvreur()
    fiche = common.URL_FICHE.format(bid)
    common.telecharger(fiche, opener=opener)
    brut = common.telecharger(URL_TICKS.format(bid),
                              headers={**common.HEADERS_XHR, "Referer": fiche},
                              opener=opener)
    return json.loads(brut)


def relever(fonds, telecharger, aujourd_hui, existant, pause=common.PAUSE):
    """Renvoie (code de sortie, history ou None, statut)."""
    donnees = dict((existant or {}).get("data", {}))
    ok, echecs = 0, []
    for n, (isin, bid) in enumerate(fonds, 1):
        try:
            serie = historique_fonds(telecharger(bid))
            erreur = None if serie else "aucun cours exploitable"
        except Exception as e:
            serie, erreur = [], f"erreur : {e}"
        if serie:
            donnees[isin] = serie
            ok += 1
            print(f"[{n:2}/{len(fonds)}] {isin} {len(serie)} mois "
                  f"({serie[0]['date']} → {serie[-1]['date']})")
        else:
            echecs.append(isin)
            garde = " — historique existant conservé" if isin in donnees else ""
            print(f"[{n:2}/{len(fonds)}] {isin} ÉCHEC : {erreur}{garde}")
        if pause and n < len(fonds):
            time.sleep(pause)

    statut = {
        "date": common.maintenant_utc(),
        "ok": False,
        "funds_total": len(fonds),
        "funds_ok": ok,
        "funds_failed": len(echecs),
        "failed_isins": echecs,
        "failed_step": None,
        "message": "",
    }
    if ok < len(fonds) * TAUX_MIN:
        statut.update(failed_step="releve",
                      message=f"{ok}/{len(fonds)} historiques relevés (minimum {TAUX_MIN:.0%})")
        print(f"ÉCHEC : {statut['message']} — history.json inchangé")
        return 1, None, statut

    connus = {isin for isin, _ in fonds}
    history = {
        "last_updated": aujourd_hui.isoformat(),
        "data": {isin: donnees[isin] for isin in sorted(donnees) if isin in connus},
    }
    statut.update(ok=True, message=f"{ok}/{len(fonds)} historiques relevés")
    return 0, history, statut


def main(dossier=common.DATA):
    fonds = common.charger_fonds(dossier)
    aujourd_hui = datetime.date.today()
    print(f"Historique mensuel — {aujourd_hui.isoformat()} — {len(fonds)} fonds")
    existant = common.charger_json(dossier / "history.json")
    code, history, statut = relever(fonds, telecharger_ticks, aujourd_hui, existant)
    if history is not None:
        common.ecrire_json(dossier / "history.json", history)
    common.maj_statut(dossier, "monthly", statut)
    print(statut["message"])
    return code


if __name__ == "__main__":
    sys.exit(main())
