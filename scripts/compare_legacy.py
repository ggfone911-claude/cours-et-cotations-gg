"""Comparaison avec l'ancien site (conservateur-fonds) pendant la bascule (lot 7).

Deux usages :

  python scripts/compare_legacy.py --meme-page <clone de conservateur-fonds>
      Méthode retenue pour la recette : chaque fiche Boursorama est téléchargée
      UNE fois et lue par les deux parseurs (l'ancien scraper.py, importé depuis
      un clone en lecture seule, et le nouveau). Boursorama sert parfois des
      versions différentes d'une même page à quelques secondes d'intervalle
      (cache) : comparer deux relevés séparés n'est donc pas probant.

  python scripts/compare_legacy.py [fichier_ou_URL_ancien] [quotes.json]
      Compare les relevés publiés (bourso_perf.json de l'ancien site et
      data/quotes.json), à titre indicatif.

Critères :
- VL : écart relatif maximal 0,01 % ;
- performances (fin de mois et glissantes, YTD à 10 ans) : écart 0,00 point ;
- date de VL identique ; mêmes fonds des deux côtés.
« 1 semaine » n'existe pas dans l'ancien site : elle n'est pas comparée.

Sort avec le code 1 s'il y a un écart, un fonds manquant, ou si les deux
relevés ne datent pas du même jour (comparaison impossible). Le compte rendu
s'ajoute au résumé du run GitHub (GITHUB_STEP_SUMMARY) s'il existe.
"""
import datetime
import importlib.util
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

import common
import scrape_daily

URL_ANCIEN = ("https://raw.githubusercontent.com/ggfone911-claude/"
              "conservateur-fonds/main/bourso_perf.json")
ECART_VL_MAX = 0.0001      # 0,01 %
ECART_PERF_MAX = 0.005     # moins d'un centième de point : « 0,00 pt » à l'affichage
CLES = ("ytd", "m1", "m6", "a1", "a3", "a5", "a10")


def charger(source):
    if str(source).startswith("http"):
        with urllib.request.urlopen(source, timeout=common.TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8"))
    return json.loads(Path(source).read_text(encoding="utf-8"))


def comparer(ancien, nouveau):
    a, n = ancien.get("data", {}), nouveau.get("data", {})
    rapport = {
        "releve_ancien": ancien.get("last_updated"),
        "releve_nouveau": nouveau.get("last_updated"),
        "fonds_communs": sorted(set(a) & set(n)),
        "absents_nouveau": sorted(set(a) - set(n)),
        "absents_ancien": sorted(set(n) - set(a)),
        "ecarts": [],
    }
    for isin in rapport["fonds_communs"]:
        va, vn = a[isin], n[isin]
        def ecart(champ, x, y):
            rapport["ecarts"].append({"isin": isin, "champ": champ, "ancien": x, "nouveau": y})
        if (va.get("vl") is None) != (vn.get("vl") is None):
            ecart("vl", va.get("vl"), vn.get("vl"))
        elif va.get("vl") and abs(vn["vl"] / va["vl"] - 1) > ECART_VL_MAX:
            ecart("vl", va["vl"], vn["vl"])
        if va.get("date") != vn.get("date"):
            ecart("date", va.get("date"), vn.get("date"))
        for jeu in ("eom", "gli"):
            for cle in CLES:
                x = (va.get(jeu) or {}).get(cle)
                y = (vn.get(jeu) or {}).get(cle)
                if (x is None) != (y is None) or (x is not None and abs(x - y) > ECART_PERF_MAX):
                    ecart(f"{jeu}.{cle}", x, y)
    rapport["meme_jour"] = rapport["releve_ancien"] == rapport["releve_nouveau"]
    rapport["identique"] = (rapport["meme_jour"] and bool(rapport["fonds_communs"]) and not rapport["ecarts"]
                            and not rapport["absents_nouveau"] and not rapport["absents_ancien"])
    return rapport


def charger_ancien_parseur(clone):
    """Importe scraper.py de l'ancien site (clone en lecture seule) sans l'exécuter."""
    spec = importlib.util.spec_from_file_location("ancien_scraper", Path(clone) / "scraper.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.parse_page


def comparer_meme_page(fonds, telecharger_page, ancien_parseur, pause=common.PAUSE):
    """Une seule page par fonds, lue par les deux parseurs."""
    jour = datetime.date.today().isoformat()
    ancien = {"last_updated": jour, "data": {}}
    nouveau = {"last_updated": jour, "data": {}}
    erreurs = []
    for n, (isin, bid) in enumerate(fonds, 1):
        try:
            html = telecharger_page(bid)
        except Exception as e:
            erreurs.append(isin)
            print(f"[{n:2}/{len(fonds)}] {isin} page inaccessible : {e}")
            continue
        a = ancien_parseur(html)
        b = scrape_daily.lire_page(html)
        if a:
            ancien["data"][isin] = a
        if b:
            nouveau["data"][isin] = b
        if pause and n < len(fonds):
            time.sleep(pause)
    rapport = comparer(ancien, nouveau)
    rapport["pages_inaccessibles"] = erreurs
    rapport["identique"] = rapport["identique"] and not erreurs
    return rapport


def texte(rapport, noms):
    nom = lambda i: f"{noms.get(i, i)} ({i})"
    lignes = [
        "## Comparaison avec l'ancien site",
        "",
        f"- Relevé de l'ancien site : {rapport['releve_ancien']}",
        f"- Relevé du nouveau site : {rapport['releve_nouveau']}",
        f"- Fonds comparés : {len(rapport['fonds_communs'])}",
    ]
    if not rapport["meme_jour"]:
        lignes.append("- **Les deux relevés ne datent pas du même jour : comparaison non probante.**")
    for cle, libelle in (("absents_nouveau", "Absents du nouveau site"),
                         ("absents_ancien", "Absents de l'ancien site")):
        if rapport[cle]:
            lignes.append(f"- {libelle} : " + ", ".join(nom(i) for i in rapport[cle]))
    if rapport["ecarts"]:
        lignes += ["", f"### {len(rapport['ecarts'])} écart(s)", "",
                   "| Fonds | Donnée | Ancien site | Nouveau site |", "|---|---|---|---|"]
        lignes += [f"| {nom(e['isin'])} | {e['champ']} | {e['ancien']} | {e['nouveau']} |"
                   for e in rapport["ecarts"]]
    if rapport.get("pages_inaccessibles"):
        lignes.append("- Pages inaccessibles (non comparées) : "
                      + ", ".join(nom(i) for i in rapport["pages_inaccessibles"]))
    lignes += ["", "**Résultat : identique.**" if rapport["identique"] else "**Résultat : différences à examiner.**"]
    return "\n".join(lignes)


def main(argv):
    if len(argv) > 2 and argv[1] == "--meme-page":
        rapport = comparer_meme_page(
            common.charger_fonds(), lambda bid: common.telecharger(common.URL_FICHE.format(bid)),
            charger_ancien_parseur(argv[2]))
    else:
        source_ancien = argv[1] if len(argv) > 1 else URL_ANCIEN
        source_nouveau = argv[2] if len(argv) > 2 else common.DATA / "quotes.json"
        rapport = comparer(charger(source_ancien), charger(source_nouveau))
    fonds = common.charger_json(common.DATA / "funds.json") or {"funds": []}
    sortie = texte(rapport, {f["isin"]: f["name"] for f in fonds["funds"]})
    print(sortie)
    resume = os.environ.get("GITHUB_STEP_SUMMARY")
    if resume:
        with open(resume, "a", encoding="utf-8") as f:
            f.write(sortie + "\n")
    return 0 if rapport["identique"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
