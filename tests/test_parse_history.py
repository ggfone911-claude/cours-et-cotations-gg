"""Tests de l'historique mensuel."""
import datetime
import json
import shutil
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))

import common  # noqa: E402
import scrape_history  # noqa: E402

FIXTURES = RACINE / "tests" / "fixtures"
AUJOURDHUI = datetime.date(2026, 10, 13)


def jour(iso):
    return (datetime.date.fromisoformat(iso) - datetime.date(1970, 1, 1)).days


def reponse(points):
    return {"d": {"QuoteTab": [{"d": jour(d), "c": c} for d, c in points]}}


def mois(n, vl=100.0):
    """n mois consécutifs à partir de 2020-01, VL constante."""
    return [{"date": f"{2020 + i // 12}-{i % 12 + 1:02}", "vl": vl} for i in range(n)]


def test_reponse_reelle_getticks():
    serie = scrape_history.historique_fonds(
        json.loads((FIXTURES / "ticks_0P0001CB5C.json").read_text()))
    assert 55 <= len(serie) <= 60
    dates = [p["date"] for p in serie]
    assert dates == sorted(dates) and len(set(dates)) == len(dates)
    assert all(500 < p["vl"] < 700 for p in serie)


def test_derniere_vl_du_mois():
    serie = scrape_history.mensualiser(reponse([
        ("2026-09-02", 10.0), ("2026-09-30", 12.0), ("2026-09-15", 11.0),
        ("2026-10-01", 13.0)]))
    assert serie == [{"date": "2026-09", "vl": 12.0}, {"date": "2026-10", "vl": 13.0}]


def test_valeurs_invalides_ignorees():
    data = {"d": {"QuoteTab": [{"d": jour("2026-09-01"), "c": 0},
                               {"d": jour("2026-09-02"), "c": "x"},
                               {"c": 5}, {"d": jour("2026-09-03"), "c": 7.5}]}}
    assert scrape_history.mensualiser(data) == [{"date": "2026-09", "vl": 7.5}]
    assert scrape_history.mensualiser({"inattendu": 1}) == []
    assert scrape_history.mensualiser(None) == []


def test_filtre_des_cotations_aberrantes():
    # Cas réel FR0010106500 : 47 948 € au lieu de ~487 € en 09/2021
    serie = [{"date": "2021-07", "vl": 485.0}, {"date": "2021-08", "vl": 486.0},
             {"date": "2021-09", "vl": 47948.79}, {"date": "2021-10", "vl": 487.0},
             {"date": "2021-11", "vl": 489.0}]
    assert [p["date"] for p in scrape_history.filtrer_aberrants(serie)] == [
        "2021-07", "2021-08", "2021-10", "2021-11"]
    bas = [dict(p) for p in serie]
    bas[2]["vl"] = 4.87  # ÷ 100
    assert len(scrape_history.filtrer_aberrants(bas)) == 4


def test_point_aberrant_en_debut_et_fin_de_serie():
    serie = [{"date": f"2021-0{i}", "vl": v} for i, v in
             enumerate([48000.0, 486.0, 487.0, 488.0, 489.0, 490.0, 49000.0], start=1)]
    assert [p["vl"] for p in scrape_history.filtrer_aberrants(serie)] == [
        486.0, 487.0, 488.0, 489.0, 490.0]


def test_vraie_hausse_conservee():
    serie = [{"date": f"2021-0{i}", "vl": v} for i, v in
             enumerate([100, 150, 220, 300, 420], start=1)]
    assert scrape_history.filtrer_aberrants(serie) == serie


def test_decoupe_a_60_mois():
    points = [(f"{2020 + i // 12}-{i % 12 + 1:02}-15", 100.0 + i) for i in range(70)]
    serie = scrape_history.historique_fonds(reponse(points))
    assert len(serie) == 60
    assert serie[0]["date"] == "2020-11" and serie[-1]["date"] == "2025-10"


def test_fonds_recent_serie_courte_gardee():
    serie = scrape_history.historique_fonds(reponse([("2026-08-29", 10.0),
                                                     ("2026-09-30", 10.2)]))
    assert len(serie) == 2


FONDS = [(f"F{i}", f"B{i}") for i in range(5)]


def test_echec_d_un_fonds_conserve_son_historique():
    existant = {"data": {"F4": mois(12, 50.0)}}

    def telecharger(bid):
        if bid == "B4":
            raise OSError("délai dépassé")
        return reponse([("2026-09-30", 10.0)])
    code, history, statut = scrape_history.relever(FONDS, telecharger, AUJOURDHUI,
                                                   existant, pause=0)
    assert code == 0
    assert history["data"]["F4"] == mois(12, 50.0)
    assert history["data"]["F0"] == [{"date": "2026-09", "vl": 10.0}]
    assert statut["failed_isins"] == ["F4"]


def test_echec_global_sous_60_pourcents():
    def telecharger(bid):
        if bid in ("B2", "B3", "B4"):
            raise OSError("panne")
        return reponse([("2026-09-30", 10.0)])
    code, history, statut = scrape_history.relever(FONDS, telecharger, AUJOURDHUI,
                                                   None, pause=0)
    assert (code, history) == (1, None)
    assert "2/5" in statut["message"]


def test_echec_ne_modifie_pas_history_json(tmp_path, monkeypatch):
    shutil.copy(RACINE / "data" / "funds.json", tmp_path / "funds.json")
    avant = '{"last_updated": "2026-10-01", "data": {}}\n'
    (tmp_path / "history.json").write_text(avant, encoding="utf-8")

    def panne(url, **_):
        raise OSError("URL invalide")
    monkeypatch.setattr(common, "telecharger", panne)
    monkeypatch.setattr(scrape_history.time, "sleep", lambda s: None)

    assert scrape_history.main(tmp_path) == 1
    assert (tmp_path / "history.json").read_text(encoding="utf-8") == avant
    statut = json.loads((tmp_path / "status.json").read_text(encoding="utf-8"))
    assert statut["monthly"]["ok"] is False


def test_series_journalieres():
    serie = scrape_history.journaliser(reponse([
        ("2026-10-09", 866.39), ("2026-10-08", 862.22), ("2026-10-12", 867.15), ("2026-10-12", 867.15)]))
    assert serie == [{"date": "2026-10-08", "vl": 862.22}, {"date": "2026-10-09", "vl": 866.39},
                     {"date": "2026-10-12", "vl": 867.15}]
    assert scrape_history.journaliser({"x": 1}) == []
