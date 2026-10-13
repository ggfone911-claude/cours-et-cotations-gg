"""Tests de scripts/validate.py et des fichiers réels de data/."""
import copy
import json
import sys
from pathlib import Path

import pytest

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))

import validate  # noqa: E402

DATA = RACINE / "data"


def charger(nom):
    return json.loads((DATA / nom).read_text(encoding="utf-8"))


@pytest.fixture
def jeu():
    return {n: charger(n) for n in ("funds.json", "portfolios.json", "euro_fund.json")}


def ecrire(dossier, jeu):
    for nom, contenu in jeu.items():
        (dossier / nom).write_text(json.dumps(contenu, ensure_ascii=False), encoding="utf-8")


# ── ISIN ─────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("isin", ["US0378331005", "FR0013287315", "LU1585265066",
                                  "IE000S1JLOI7", "FR001400PKZ3"])
def test_isin_valides(isin):
    assert validate.isin_valide(isin)


@pytest.mark.parametrize("isin", ["FR0013287316", "FR001328731", "fr0013287315",
                                  "FR00132873155", "", None, "1R0013287315"])
def test_isin_invalides(isin):
    assert not validate.isin_valide(isin)


# ── Fichiers réels ───────────────────────────────────────────────────────────
def test_donnees_reelles_valides():
    assert validate.valider(DATA) == []


def test_decompte_des_fonds():
    fonds = charger("funds.json")["funds"]
    assert len(fonds) == 61
    assert sum(f["displayed"] for f in fonds) == 50
    assert {f["isin"] for f in fonds if not f["displayed"]} == {
        f["isin"] for f in fonds if f["share_class"] == "D"}
    assert [f["isin"] for f in fonds if f["pending"]] == ["IE000S1JLOI7"]


def test_trois_profils():
    assert [p["id"] for p in charger("portfolios.json")["profiles"]] == ["pru", "equ", "dyn"]


def test_main_code_retour(tmp_path, jeu, capsys):
    ecrire(tmp_path, jeu)
    assert validate.main(["validate.py", str(tmp_path)]) == 0
    jeu["portfolios.json"]["profiles"][0]["funds"][0]["weight"] += 1
    ecrire(tmp_path, jeu)
    assert validate.main(["validate.py", str(tmp_path)]) == 1
    assert "pondérations = 101" in capsys.readouterr().out


# ── Erreurs détectées ────────────────────────────────────────────────────────
def test_ponderations_differentes_de_100(jeu):
    p = copy.deepcopy(jeu["portfolios.json"])
    p["profiles"][1]["funds"].pop()
    erreurs = validate.valider_portfolios(p, jeu["funds.json"])
    assert any("Équilibré" in e and "attendu 100" in e for e in erreurs)


def test_isin_de_portefeuille_inconnu(jeu):
    p = copy.deepcopy(jeu["portfolios.json"])
    p["profiles"][0]["funds"][0]["isin"] = "US0378331005"
    erreurs = validate.valider_portfolios(p, jeu["funds.json"])
    assert any("US0378331005 absent de funds.json" in e for e in erreurs)


@pytest.mark.parametrize("srri", [0, 8, None, "3", True])
def test_srri_hors_limites(jeu, srri):
    f = copy.deepcopy(jeu["funds.json"])
    f["funds"][0]["srri"] = srri
    assert any("SRRI" in e for e in validate.valider_funds(f))


@pytest.mark.parametrize("bid", ["", None, "0P123", "XX-123"])
def test_identifiant_boursorama_absent_ou_invalide(jeu, bid):
    f = copy.deepcopy(jeu["funds.json"])
    f["funds"][0]["bourso_id"] = bid
    assert any("Boursorama" in e for e in validate.valider_funds(f))


def test_isin_en_double(jeu):
    f = copy.deepcopy(jeu["funds.json"])
    f["funds"].append(copy.deepcopy(f["funds"][0]))
    assert any("en double" in e for e in validate.valider_funds(f))


def test_categorie_inconnue(jeu):
    f = copy.deepcopy(jeu["funds.json"])
    f["funds"][0]["category"] = "inexistante"
    assert any("catégorie inconnue" in e for e in validate.valider_funds(f))


def test_grille_fonds_euros_incoherente(jeu):
    ef = copy.deepcopy(jeu["euro_fund.json"])
    ef["euro_fund"]["grid"][0]["rate_low"] = 5.0  # > rate_high
    ef["euro_fund"]["allocation"]["default"] = 60  # > max
    erreurs = validate.valider_euro_fund(ef)
    assert any("taux incohérents" in e for e in erreurs)
    assert any("allocation incohérente" in e for e in erreurs)


def test_fichier_manquant(tmp_path):
    assert validate.valider(tmp_path) == ["funds.json introuvable"]


def test_quotes_et_history_controles_s_ils_existent(tmp_path, jeu):
    jeu["quotes.json"] = {"last_updated": "2026-10-11",
                          "data": {"FR0013287315": {"vl": -1}}}
    jeu["history.json"] = {"data": {"FR0013287315": [{"date": "2021-11", "vl": 1},
                                                     {"date": "2021-10", "vl": 1}]}}
    ecrire(tmp_path, jeu)
    erreurs = validate.valider(tmp_path)
    assert any("VL invalide" in e for e in erreurs)
    assert any("non triées" in e for e in erreurs)
