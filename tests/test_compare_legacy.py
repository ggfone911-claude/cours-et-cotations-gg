"""Tests de la comparaison avec l'ancien site (lot 7)."""
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))

import compare_legacy  # noqa: E402
import scrape_daily  # noqa: E402

PERF = {"ytd": 1.56, "m1": 0.19, "m6": 1.08, "a1": 2.05, "a3": 8.83, "a5": 11.39, "a10": None}


def releve(vl=647.62, date="2026-10-11", **perf):
    eom = {**PERF, **perf}
    return {"vl": vl, "date": date, "eom": eom, "gli": dict(eom)}


def jeu(jour="2026-10-13", **fonds):
    return {"last_updated": jour, "data": fonds}


def test_releves_identiques():
    r = compare_legacy.comparer(jeu(A=releve()), jeu(A={**releve(), "eom": {**PERF, "w1": None}}))
    assert r["identique"] and r["ecarts"] == []


def test_tolerances():
    # VL : 0,01 % toléré ; au-delà, écart
    assert compare_legacy.comparer(jeu(A=releve(100.0)), jeu(A=releve(100.009)))["identique"]
    assert not compare_legacy.comparer(jeu(A=releve(100.0)), jeu(A=releve(100.02)))["identique"]
    # Performances : 0,00 point
    r = compare_legacy.comparer(jeu(A=releve()), jeu(A=releve(a1=2.06)))
    assert [e["champ"] for e in r["ecarts"]] == ["eom.a1", "gli.a1"]


def test_valeur_absente_d_un_seul_cote():
    r = compare_legacy.comparer(jeu(A=releve()), jeu(A=releve(a3=None)))
    assert {e["champ"] for e in r["ecarts"]} == {"eom.a3", "gli.a3"}


def test_fonds_manquants_et_jours_differents():
    r = compare_legacy.comparer(jeu(A=releve(), B=releve()), jeu("2026-10-14", A=releve(), C=releve()))
    assert r["absents_nouveau"] == ["B"] and r["absents_ancien"] == ["C"]
    assert not r["meme_jour"] and not r["identique"]
    assert "comparaison non probante" in compare_legacy.texte(r, {})


def test_meme_page_lue_par_les_deux_parseurs():
    html = (RACINE / "tests" / "fixtures" / "verticale_MP.html").read_text(encoding="utf-8")

    def ancien_parseur(page):  # simule l'ancien scraper.py : pas de « 1 semaine »
        d = scrape_daily.lire_page(page)
        for jeu_perf in ("eom", "gli"):
            d[jeu_perf] = {k: v for k, v in d[jeu_perf].items() if k != "w1"}
        return d

    r = compare_legacy.comparer_meme_page([("F1", "MP-1"), ("F2", "MP-2")],
                                          lambda bid: html, ancien_parseur, pause=0)
    assert r["identique"] and r["fonds_communs"] == ["F1", "F2"]

    def parseur_fautif(page):  # inverse fin de mois et glissantes
        d = ancien_parseur(page)
        d["eom"], d["gli"] = d["gli"], d["eom"]
        return d
    r = compare_legacy.comparer_meme_page([("F1", "MP-1")], lambda bid: html, parseur_fautif, pause=0)
    assert not r["identique"] and len(r["ecarts"]) > 0


def test_page_inaccessible_signalee():
    def panne(bid):
        raise OSError("réseau")
    r = compare_legacy.comparer_meme_page([("F1", "X")], panne, lambda p: None, pause=0)
    assert r["pages_inaccessibles"] == ["F1"]
    assert not r["identique"]
    assert "Pages inaccessibles" in compare_legacy.texte(r, {})
