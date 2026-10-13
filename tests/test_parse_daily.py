"""Tests du relevé quotidien : lecture des pages, nombres, garde-fous."""
import datetime
import json
import shutil
import sys
from pathlib import Path

import pytest

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))

import common  # noqa: E402
import scrape_daily  # noqa: E402

FIXTURES = RACINE / "tests" / "fixtures"
VIDE = dict.fromkeys(scrape_daily.CLES)


def page(nom):
    return (FIXTURES / nom).read_text(encoding="utf-8")


# ── Lecture des pages ───────────────────────────────────────────────────────
PALATINE_EOM = {"ytd": 1.56, "w1": None, "m1": 0.19, "m6": 1.08, "a1": 2.05,
                "a3": 8.83, "a5": 11.39, "a10": None}
PALATINE_GLI = {"ytd": 1.64, "w1": 0.05, "m1": 0.19, "m6": 1.09, "a1": 2.06,
                "a3": 8.79, "a5": 11.49, "a10": None}


def test_mise_en_page_verticale():
    d = scrape_daily.lire_page(page("verticale_0P.html"))
    assert d == {"vl": 647.62, "date": "2026-10-11",
                 "eom": PALATINE_EOM, "gli": PALATINE_GLI}


def test_mise_en_page_horizontale():
    d = scrape_daily.lire_page(page("horizontale.html"))
    assert d == {"vl": 647.62, "date": "2026-10-11",
                 "eom": PALATINE_EOM, "gli": PALATINE_GLI}


def test_identifiant_mp_et_valeurs_negatives():
    d = scrape_daily.lire_page(page("verticale_MP.html"))
    assert d["vl"] == 866.39
    assert d["date"] == "2026-10-09"
    assert d["eom"] == {"ytd": 7.38, "w1": None, "m1": -0.07, "m6": 7.65,
                        "a1": 8.98, "a3": 33.75, "a5": 16.81, "a10": 33.05}
    assert d["gli"] == {"ytd": 9.78, "w1": 1.51, "m1": 1.83, "m6": 8.11,
                        "a1": 9.81, "a3": 37.19, "a5": 19.27, "a10": 36.57}


def test_fonds_sans_tableau_de_performances():
    d = scrape_daily.lire_page(page("sans_performances.html"))
    assert d == {"vl": 647.62, "date": "2026-10-11", "eom": VIDE, "gli": VIDE}


def test_tableau_fonds_partenaires_ignore():
    # La fiche contient un tableau LIBELLE / 1er Janv / 1 AN / 3 ANS des fonds
    # partenaires : il ne doit produire aucun jeu de performances.
    tableaux = scrape_daily.tableaux_performances(page("verticale_0P.html"))
    assert len(tableaux) == 2
    assert [semaine for _, semaine in tableaux] == [False, True]


def test_un_seul_tableau_glissantes_n_est_pas_pris_pour_fin_de_mois():
    html = page("verticale_0P.html")
    tableaux = list(scrape_daily._TABLE.finditer(html))
    eom = [m for m in tableaux if "RANG" in m.group(0) and "SEMAINE" not in m.group(0)][0]
    d = scrape_daily.lire_page(html[:eom.start()] + html[eom.end():])
    assert d["eom"] == VIDE
    assert d["gli"] == PALATINE_GLI


def test_vl_illisible_ou_nulle():
    assert scrape_daily.lire_page("<html>aucune VL</html>") is None
    assert scrape_daily.lire_page('<span class="c-instrument--last">0,00</span>') is None


@pytest.mark.parametrize("html,vl", [
    ('<span class="c-instrument c-instrument--last" data-ist-last>1 234,56</span>', 1234.56),
    ('<span data-ist-last="98,7">', 98.7),
    ('{"currentPrice": "45.6"}', 45.6),
    ('{"last": 12.5}', 12.5),
])
def test_quatre_motifs_de_vl(html, vl):
    assert scrape_daily.lire_page(html)["vl"] == vl


# ── Nombres ─────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("texte,attendu", [
    ("1 234,56 %", 1234.56),
    ("1 234,56 %", 1234.56),
    ("1 234,56 %", 1234.56),
    ("+3,45%", 3.45),
    ("-1,16 %", -1.16),
    ("−0,07%", -0.07),
    ("0", 0.0),
    ("-", None), ("–", None), ("ND", None), ("N/A", None), ("", None), (None, None),
    ("abc", None),
])
def test_nettoyage_des_nombres(texte, attendu):
    assert common.nombre(texte) == attendu


@pytest.mark.parametrize("texte,attendu", [
    ("09/10/2026", "2026-10-09"), ("09.10.2026", "2026-10-09"),
    ("31/02/2026", None), ("", None), (None, None),
])
def test_dates(texte, attendu):
    assert common.date_fr(texte) == attendu


# ── Garde-fous ──────────────────────────────────────────────────────────────
AUJOURDHUI = datetime.date(2026, 10, 13)
FONDS = [(f"F{i:02}", f"0P{i:08}") for i in range(10)]


def page_fonds(date="11/10/2026", perf=True):
    tableau = ('<table><thead><tr><th></th><th>FONDS</th></tr></thead><tbody>'
               '<tr><th>1er JANV.</th><td>1,00%</td></tr>'
               '<tr><th>1 AN</th><td>2,00%</td></tr></tbody></table>') if perf else ""
    return (f'<span class="c-instrument--last">100,00</span>'
            f'<p>Dernier cours connu au {date}</p>{tableau}')


def relever(pages, precedent=None):
    def telecharger(bid):
        contenu = pages(bid)
        if isinstance(contenu, Exception):
            raise contenu
        return contenu
    return scrape_daily.relever(FONDS, telecharger, AUJOURDHUI, precedent, pause=0)


def test_releve_complet():
    code, quotes, statut = relever(lambda bid: page_fonds())
    assert code == 0 and statut["ok"]
    assert len(quotes["data"]) == 10
    assert quotes["data"]["F00"]["eom"]["a1"] == 2.0
    assert statut["newest_vl_date"] == "2026-10-11"


def test_releve_vide():
    code, quotes, statut = relever(lambda bid: OSError("réseau coupé"))
    assert (code, quotes) == (1, None)
    assert statut["failed_step"] == "releve" and statut["funds_failed"] == 10


def test_releve_partiel_sous_60_pourcents():
    code, quotes, statut = relever(
        lambda bid: page_fonds() if bid < "0P00000005" else "<html></html>")
    assert (code, quotes) == (1, None)
    assert "5/10" in statut["message"]


def test_releve_a_60_pourcents_accepte_et_fonds_perimes_conserves():
    precedent = {"data": {"F09": {"vl": 50.0, "date": "2026-10-01"},
                          "F08": {"vl": 40.0, "date": "2026-09-30",
                                  "stale_since": "2026-10-10"}}}
    code, quotes, statut = relever(
        lambda bid: page_fonds() if bid < "0P00000006" else "<html></html>", precedent)
    assert code == 0
    assert quotes["data"]["F09"] == {"vl": 50.0, "date": "2026-10-01",
                                     "stale_since": "2026-10-13"}
    assert quotes["data"]["F08"]["stale_since"] == "2026-10-10"
    assert "F07" not in quotes["data"]
    assert statut["failed_isins"] == ["F06", "F07", "F08", "F09"]


def test_releve_perime():
    code, quotes, statut = relever(lambda bid: page_fonds(date="04/10/2026"))
    assert (code, quotes) == (1, None)
    assert statut["failed_step"] == "fraicheur"


def test_releve_a_8_jours_accepte():
    assert relever(lambda bid: page_fonds(date="05/10/2026"))[0] == 0


def test_performances_1_an_absentes():
    code, quotes, statut = relever(lambda bid: page_fonds(perf=bid < "0P00000005"))
    assert code == 0  # 5/10 = 50 % : encore accepté
    code, quotes, statut = relever(lambda bid: page_fonds(perf=bid < "0P00000004"))
    assert (code, quotes) == (1, None)
    assert statut["failed_step"] == "performances"


def test_echec_ne_modifie_pas_quotes_json(tmp_path, monkeypatch):
    for nom in ("funds.json",):
        shutil.copy(RACINE / "data" / nom, tmp_path / nom)
    avant = '{"last_updated": "2026-10-01", "data": {}}\n'
    (tmp_path / "quotes.json").write_text(avant, encoding="utf-8")

    def panne(url, **_):
        raise OSError("URL invalide")
    monkeypatch.setattr(common, "telecharger", panne)
    monkeypatch.setattr(common, "PAUSE", 0)
    monkeypatch.setattr(scrape_daily.time, "sleep", lambda s: None)

    assert scrape_daily.main(tmp_path) == 1
    assert (tmp_path / "quotes.json").read_text(encoding="utf-8") == avant
    statut = json.loads((tmp_path / "status.json").read_text(encoding="utf-8"))
    assert statut["daily"]["ok"] is False
    assert statut["daily"]["funds_failed"] == 61
