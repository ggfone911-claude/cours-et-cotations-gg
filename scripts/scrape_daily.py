"""Relevé quotidien Boursorama → data/quotes.json (+ data/status.json).

Usage : python scripts/scrape_daily.py

Pour chaque fonds de funds.json : VL, date de VL et deux jeux de
performances cumulées (en %), lus dans le tableau « PERFORMANCES DU FONDS » :
  eom = onglet « À LA FIN DE MOIS » (7 périodes) ;
  gli = onglet « GLISSANTES » (8 périodes, avec « 1 SEMAINE »).

Piège Morningstar : le jeu eom est calculé sur la dernière VL du mois
précédent et n'est mis à jour qu'une à deux semaines après le début du mois.
Pendant ce délai il reste identique alors que la VL bouge : c'est NORMAL, ce
n'est pas un gel. Un vrai gel se détecte sur une fenêtre longue (eom inchangé
depuis plus de 45 jours alors que les VL bougent). Pour tout contrôle croisé
avec l'historique des VL, utiliser gli, seul jeu synchronisé avec la dernière VL.

VL journalières (courbe « 1 mois » du site) : après le relevé, les cours des
90 derniers jours sont lus pour chaque fonds via GetTicksEOD (une seule visite
de fiche pour les cookies de session) et écrits dans data/daily.json. Un fonds
en échec garde sa série précédente ; si moins de 60 % des séries aboutissent,
daily.json n'est pas modifié et le script sort avec le code 1.

Garde-fous : le script sort avec le code 1, sans toucher à quotes.json (seul
status.json est mis à jour), si aucun fonds n'est relevé, si moins de 60 %
le sont, si la VL la plus récente a plus de 8 jours, ou si la performance
1 an manque sur plus de 50 % des fonds relevés.
"""
import datetime
import re
import sys
import time

import common
import scrape_history

TAUX_MIN = 0.60            # part minimale de fonds relevés
AGE_MAX_JOURS = 8          # âge maximal de la VL la plus récente
TAUX_MIN_PERF_1AN = 0.50   # part minimale de fonds relevés avec une perf 1 an

CLES = ("ytd", "w1", "m1", "m6", "a1", "a3", "a5", "a10")
PERIODES = [  # reconnues par leur libellé, jamais par leur position
    ("ytd", re.compile(r"^1\s*ER\s*JANV")),
    ("w1", re.compile(r"^1\s*SEMAINE\.?$")),
    ("m1", re.compile(r"^1\s*MOIS\.?$")),
    ("m6", re.compile(r"^6\s*MOIS\.?$")),
    ("a1", re.compile(r"^1\s*AN\.?$")),
    ("a3", re.compile(r"^3\s*ANS\.?$")),
    ("a5", re.compile(r"^5\s*ANS\.?$")),
    ("a10", re.compile(r"^10\s*ANS\.?$")),
]

_BALISE = re.compile(r"<[^>]+>")
_TABLE = re.compile(r"<table\b.*?</table>", re.I | re.S)
_THEAD = re.compile(r"<thead\b.*?</thead>", re.I | re.S)
_TR = re.compile(r"<tr\b.*?</tr>", re.I | re.S)
_CELLULE = re.compile(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", re.I | re.S)
_VL = [  # quatre motifs de repli, dans cet ordre
    re.compile(r"c-instrument--last[^>]*>\s*([\d\s  ,.]+)", re.I),
    re.compile(r'data-ist-last="([\d\s  ,.]+)"', re.I),
    re.compile(r'"currentPrice"\s*:\s*"?([\d.,]+)', re.I),
    re.compile(r'"last"\s*:\s*"?([\d.,]+)', re.I),
]
_DATE_VL = re.compile(r"DERNIER COURS CONNU AU\s*(\d{2}[/.]\d{2}[/.]\d{4})", re.I)


def texte(fragment):
    """Retire les balises et normalise les espaces (insécables compris)."""
    t = _BALISE.sub(" ", fragment)
    t = t.replace("&nbsp;", " ").replace(" ", " ").replace(" ", " ")
    return re.sub(r"\s+", " ", t).strip()


def _perf(paires):
    """[(libellé de période, valeur)] → {ytd, w1, …, a10}."""
    perf = dict.fromkeys(CLES)
    for libelle, valeur in paires:
        for cle, motif in PERIODES:
            if perf[cle] is None and motif.search(libelle.upper()):
                perf[cle] = common.nombre(valeur)
    return perf


def tableaux_performances(html):
    """Jeux de performances du fonds trouvés dans la page, dans l'ordre du HTML.

    Chaque élément est (paires (libellé, valeur), contient_1_semaine).
    Deux mises en page sont lues :
    - verticale (depuis le 05/10/2026) : colonnes FONDS / CATÉGORIE / RANG,
      une ligne par période (<th scope=row>1er JANV.</th> puis les valeurs) ;
    - horizontale : périodes en en-têtes de colonnes, puis une ligne FONDS.
    Le tableau « fonds partenaires » (colonne LIBELLE, sans FONDS) est ignoré.
    """
    trouves = []
    for tableau in _TABLE.findall(html):
        if not re.search(r"1\s*ER\s*JANV", texte(tableau).upper()):
            continue
        thead = _THEAD.search(tableau)
        entetes = [texte(c).upper() for c in _CELLULE.findall(thead.group(0) if thead else "")]
        corps = tableau[thead.end():] if thead else tableau
        lignes = [[texte(c) for c in _CELLULE.findall(tr)] for tr in _TR.findall(corps)]
        lignes = [l for l in lignes if l]

        if "FONDS" in entetes:  # verticale
            col = entetes.index("FONDS")
            if lignes and len(entetes) == len(lignes[0]) - 1:
                col += 1  # en-tête sans cellule vide au-dessus des libellés
            paires = [(l[0], l[col]) for l in lignes if len(l) > col]
        else:  # horizontale
            ligne_fonds = next((l for l in lignes if l[0].upper() == "FONDS"), None)
            if not ligne_fonds:
                continue  # fonds partenaires ou tableau inconnu
            paires = list(zip(entetes, ligne_fonds))
            if len(entetes) == len(ligne_fonds) - 1:
                paires = list(zip(entetes, ligne_fonds[1:]))

        semaine = any(re.search(r"^1\s*SEMAINE", lib.upper()) for lib, _ in paires)
        trouves.append((paires, semaine))
    return trouves


def lire_page(html):
    """VL, date de VL, eom et gli. None si la VL est illisible ou ≤ 0."""
    vl = None
    for motif in _VL:
        m = motif.search(html)
        if m:
            v = common.nombre(m.group(1))
            if v is not None and v > 0:
                vl = v
                break
    if vl is None:
        return None

    m = _DATE_VL.search(texte(html))
    eom = gli = None
    for paires, semaine in tableaux_performances(html):
        # « 1 SEMAINE » n'existe que dans l'onglet glissantes : c'est lui qui
        # distingue les deux jeux, pas l'ordre (une page n'en a parfois qu'un).
        if semaine and gli is None:
            gli = _perf(paires)
        elif not semaine and eom is None:
            eom = _perf(paires)
    return {
        "vl": vl,
        "date": common.date_fr(m.group(1)) if m else None,
        "eom": eom or dict.fromkeys(CLES),
        "gli": gli or dict.fromkeys(CLES),
    }


def relever(fonds, telecharger_page, aujourd_hui, precedent, pause=common.PAUSE):
    """Relève tous les fonds. Renvoie (code de sortie, quotes ou None, statut)."""
    resultats, echecs = {}, []
    for n, (isin, bid) in enumerate(fonds, 1):
        try:
            donnees = lire_page(telecharger_page(bid))
            erreur = None if donnees else "VL introuvable dans la page"
        except Exception as e:  # réseau, délai dépassé, page illisible
            donnees, erreur = None, f"erreur réseau : {e}"
        if donnees:
            resultats[isin] = donnees
            print(f"[{n:2}/{len(fonds)}] {isin} VL={donnees['vl']} au {donnees['date']}")
        else:
            echecs.append(isin)
            print(f"[{n:2}/{len(fonds)}] {isin} ÉCHEC : {erreur}")
        if pause and n < len(fonds):
            time.sleep(pause)

    statut = {
        "date": common.maintenant_utc(),
        "ok": False,
        "funds_total": len(fonds),
        "funds_ok": len(resultats),
        "funds_failed": len(echecs),
        "failed_isins": echecs,
        "failed_step": None,
        "newest_vl_date": None,
        "message": "",
    }

    def echec(etape, message):
        statut.update(failed_step=etape, message=message)
        print(f"ÉCHEC : {message} — quotes.json inchangé")
        return 1, None, statut

    if not resultats:
        return echec("releve", "aucun fonds relevé")
    if len(resultats) < len(fonds) * TAUX_MIN:
        return echec("releve", f"{len(resultats)}/{len(fonds)} fonds relevés "
                               f"(minimum {TAUX_MIN:.0%})")
    dates = sorted(d["date"] for d in resultats.values() if d["date"])
    if not dates:
        return echec("fraicheur", "aucune date de VL lisible")
    statut["newest_vl_date"] = dates[-1]
    age = (aujourd_hui - datetime.date.fromisoformat(dates[-1])).days
    if age > AGE_MAX_JOURS:
        return echec("fraicheur", f"VL la plus récente du {dates[-1]}, "
                                  f"{age} jours (maximum {AGE_MAX_JOURS})")
    avec_1an = sum(1 for d in resultats.values()
                   if d["eom"]["a1"] is not None or d["gli"]["a1"] is not None)
    if avec_1an < len(resultats) * TAUX_MIN_PERF_1AN:
        return echec("performances", f"performance 1 an lue sur {avec_1an}/"
                                     f"{len(resultats)} fonds seulement")

    # Un fonds non relevé aujourd'hui garde sa dernière entrée, marquée périmée.
    anciens = (precedent or {}).get("data", {})
    for isin in echecs:
        if isin in anciens:
            entree = dict(anciens[isin])
            entree.setdefault("stale_since", aujourd_hui.isoformat())
            resultats[isin] = entree

    quotes = {
        "last_updated": aujourd_hui.isoformat(),
        "source": "Boursorama — tableau PERFORMANCES DU FONDS",
        "data": {isin: resultats[isin] for isin, _ in fonds if isin in resultats},
    }
    statut.update(ok=True, message=f"{len(fonds) - len(echecs)}/{len(fonds)} fonds relevés")
    return 0, quotes, statut


URL_TICKS_90J = ("https://www.boursorama.com/bourse/action/graph/ws/GetTicksEOD"
                 "?symbol={}&length=90&period=0&guid=")   # 60 jours : réponse vide


def telecharger_ticks_90j():
    """Fonction bid → réponse GetTicksEOD, avec une session (cookies) commune."""
    import json

    opener = common.ouvreur()
    etat = {"session": False}

    def telecharger(bid):
        fiche = common.URL_FICHE.format(bid)
        if not etat["session"]:
            common.telecharger(fiche, opener=opener)
            etat["session"] = True
        return json.loads(common.telecharger(
            URL_TICKS_90J.format(bid), headers={**common.HEADERS_XHR, "Referer": fiche}, opener=opener))
    return telecharger


def relever_journalier(fonds, telecharger, aujourd_hui, existant, pause=common.PAUSE):
    """Séries journalières des 90 derniers jours. Renvoie (ok, daily ou None, échecs)."""
    donnees = dict((existant or {}).get("data", {}))
    echecs = []
    for n, (isin, bid) in enumerate(fonds, 1):
        try:
            serie = scrape_history.filtrer_aberrants(scrape_history.journaliser(telecharger(bid)))
        except Exception:
            serie = []
        if serie:
            donnees[isin] = serie
        else:
            echecs.append(isin)
        if pause and n < len(fonds):
            time.sleep(pause)
    if len(fonds) - len(echecs) < len(fonds) * TAUX_MIN:
        print(f"ÉCHEC : VL journalières lues pour {len(fonds) - len(echecs)}/{len(fonds)} fonds "
              f"— daily.json inchangé")
        return False, None, echecs
    connus = {isin for isin, _ in fonds}
    daily = {"last_updated": aujourd_hui.isoformat(),
             "data": {i: donnees[i] for i in sorted(donnees) if i in connus}}
    return True, daily, echecs


def main(dossier=common.DATA):
    fonds = common.charger_fonds(dossier)
    aujourd_hui = datetime.date.today()
    print(f"Relevé Boursorama — {aujourd_hui.isoformat()} — {len(fonds)} fonds")
    precedent = common.charger_json(dossier / "quotes.json")
    code, quotes, statut = relever(
        fonds, lambda bid: common.telecharger(common.URL_FICHE.format(bid)),
        aujourd_hui, precedent)
    if quotes is not None:
        common.ecrire_json(dossier / "quotes.json", quotes)
        ok, daily, echecs = relever_journalier(
            fonds, telecharger_ticks_90j(), aujourd_hui, common.charger_json(dossier / "daily.json"))
        statut["journalier_ok"] = ok
        statut["journalier_echecs"] = echecs
        if daily is not None:
            common.ecrire_json(dossier / "daily.json", daily)
        else:
            statut["message"] += " — VL journalières en échec (courbe 1 mois non mise à jour)"
            code = 1
    common.maj_statut(dossier, "daily", statut)
    print(statut["message"])
    return code


if __name__ == "__main__":
    # Dossier de données en argument : sert à la comparaison avec l'ancien site
    # (relevé dans une copie temporaire, sans toucher à data/).
    sys.exit(main(common.Path(sys.argv[1]) if len(sys.argv) > 1 else common.DATA))
