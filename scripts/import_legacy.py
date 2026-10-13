"""Extraction unique du référentiel depuis le dépôt conservateur-fonds.

Usage :
    python scripts/import_legacy.py <clone de conservateur-fonds> <PDF liste des OPC>

Le script lit le code de l'ancien site sans jamais l'exécuter (analyse
syntaxique uniquement) et écrit data/funds.json, data/portfolios.json et
data/euro_fund.json. Il ne sert qu'une fois : ensuite, ces fichiers sont
édités à la main.

Sources :
- gen_app_v2.py : CATEGORIES (fonds affichés, gérant, SRRI, fonds en attente),
  _PORTFOLIOS_DEF (portefeuilles modèles), _FE_RATES et curseurs (fonds en
  euros, DOP) ;
- scraper.py : FUNDS (ISIN → identifiant Boursorama), liste des fonds relevés ;
- PDF « Liste des OPC commercialisés par Conservateur Finance » : type de part
  (C, D, A, I, R…) et nom des parts de distribution (D), absentes de CATEGORIES.
  Le SRI du PDF n'est PAS repris (échelle différente, décision en attente).

Dépendance ponctuelle : pypdf (pip install pypdf), uniquement pour ce script.
"""
import ast
import json
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DATA = RACINE / "data"

# Part D → part C du même fonds, dont elle reprend gérant, catégorie et SRRI.
PART_C_DE = {
    "FR0011461334": "FR0011461326",  # Conservateur Oblig. CT
    "FR0007497813": "FR0010564328",  # Conservateur Oblig. MT
    "FR0010057711": "FR0010564336",  # Conservateur Diversifié
    "FR0011199322": "FR0011199314",  # Conservateur Immo-Or
    "FR0010510370": "FR0010489542",  # Conservateur Diversifié Réactif
    "FR0013108982": "FR0013087152",  # Conservateur Rendement Flexible
    "FR0014008EJ0": "FR0014008EI2",  # Conservateur Actions Euro
    "FR0013256922": "FR0013256930",  # Conservateur Actions Flexibles
    "FR0000930471": "FR0010038257",  # Conservateur Emploi Durable
    "FR0007499470": "FR0010564229",  # Conservateur Actions Monde
    "FR0011184191": "FR0011175652",  # Conservateur Reverso
}

SOURCE_LIST = (
    "Liste des OPC commercialisés par Conservateur Finance — 01/10/2026, "
    "complétée des 10 fonds ajoutés le 08/10/2026"
)


def lire_affectation(source, nom):
    """Valeur littérale d'une affectation de premier niveau `nom = ...`."""
    for noeud in ast.parse(source).body:
        if isinstance(noeud, ast.Assign) and any(
            isinstance(c, ast.Name) and c.id == nom for c in noeud.targets
        ):
            return ast.literal_eval(noeud.value)
    raise SystemExit(f"Affectation {nom} introuvable")


def lire_pdf(chemin):
    """ISIN → (nom, type de part) depuis la liste officielle."""
    from pypdf import PdfReader

    texte = "\n".join(p.extract_text() for p in PdfReader(chemin).pages)
    lignes = {}
    motif = re.compile(r"^([A-Z]{2}[A-Z0-9]{9}\d) (.+?) +([A-Z]{1,2}) Supports ", re.M)
    for isin, nom, part in motif.findall(texte):
        lignes[isin] = (nom.strip(), part)
    return lignes


def typographie(texte):
    """« 31% SRRI1 » → « 31 % SRRI 1 » (typographie française)."""
    texte = re.sub(r"(\d)%", r"\1 %", texte)
    return re.sub(r"SRRI(\d)", r"SRRI \1", texte)


def construire_funds(gen, scraper, pdf):
    categories = lire_affectation(gen, "CATEGORIES")
    releves = lire_affectation(scraper, "FUNDS")
    bourso = dict(releves)

    par_isin = {}
    for ordre, cat in enumerate(categories, start=1):
        for f in cat["funds"]:
            par_isin[f["isin"]] = (cat["id"], f)

    fonds = []
    for isin, bid in releves:
        if isin in par_isin:
            cat_id, f = par_isin[isin]
            part = pdf[isin][1] if isin in pdf else None
            fonds.append({
                "isin": isin,
                "bourso_id": bid,
                "name": f["name"],
                "manager": f["mgr"],
                "category": cat_id,
                "srri": f["srri"],
                "share_class": part,
                "displayed": True,
                "pending": f.get("pending"),
            })
        elif isin in PART_C_DE:
            cat_id, soeur = par_isin[PART_C_DE[isin]]
            nom, part = pdf[isin]
            fonds.append({
                "isin": isin,
                "bourso_id": bid,
                "name": nom,
                "manager": soeur["mgr"],
                "category": cat_id,
                "srri": soeur["srri"],
                "share_class": part,
                "displayed": False,
                "pending": None,
            })
        else:
            raise SystemExit(f"{isin} relevé mais ni affiché ni part D connue")

    absents = [i for i in par_isin if i not in bourso]
    if absents:
        raise SystemExit(f"Fonds affichés sans identifiant Boursorama : {absents}")

    return {
        "version": 1,
        "source_list": SOURCE_LIST,
        "categories": [
            {"id": c["id"], "label": c["label"], "color": c["color"], "order": i}
            for i, c in enumerate(categories, start=1)
        ],
        "funds": fonds,
    }


def construire_portfolios(gen):
    profils = []
    for p in lire_affectation(gen, "_PORTFOLIOS_DEF"):
        profils.append({
            "id": p["id"],
            "label": p["label"],
            "emoji": p["emoji"],
            "range": p["range"],
            "description": typographie(p["desc"]),
            "note": typographie(p["note"]),
            "funds": [{"isin": isin, "weight": w} for isin, w in p["funds"]],
        })
    return {"as_of": "2026-10-08", "profiles": profils}


def construire_euro_fund(gen):
    taux = re.findall(r"ucMin:\s*(\d+), rates: \[([\d.]+), ([\d.]+)\]", gen)
    libelles = dict(re.findall(r"ucMin:\s*(\d+), label: '([^']+)'", gen))
    fe = re.search(r'id="feSlider" type="range" min="(\d+)" max="(\d+)" value="(\d+)"', gen)
    dop = re.search(r'id="dopSlider" type="range" min="(\d+)" max="(\d+)" value="(\d+)"', gen)
    taux_dop = re.search(r"const DOP_RATE = ([\d.]+);", gen)
    annee = re.search(r"Table taux Le Conservateur (\d{4})", gen)
    if not (taux and fe and dop and taux_dop and annee):
        raise SystemExit("Grille du fonds en euros introuvable dans gen_app_v2.py")
    return {
        "year": int(annee.group(1)),
        "euro_fund": {
            "allocation": {"min": int(fe.group(1)), "max": int(fe.group(2)),
                           "default": int(fe.group(3))},
            "threshold_eur": 150000,
            "grid": [
                {"uc_min": int(u), "rate_low": float(b), "rate_high": float(h),
                 "label": libelles[u]}
                for u, b, h in taux
            ],
        },
        "dop": {
            "label": "DOP",
            "rate": float(taux_dop.group(1)),
            "allocation": {"min": int(dop.group(1)), "max": int(dop.group(2)),
                           "default": int(dop.group(3))},
            "interest": "simple",
        },
    }


def ecrire(nom, contenu):
    chemin = DATA / nom
    chemin.write_text(json.dumps(contenu, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    print(f"Écrit : {chemin.relative_to(RACINE)}")


def main(argv):
    if len(argv) != 3:
        raise SystemExit(__doc__)
    legacy, pdf_chemin = Path(argv[1]), Path(argv[2])
    gen = (legacy / "gen_app_v2.py").read_text(encoding="utf-8")
    scraper = (legacy / "scraper.py").read_text(encoding="utf-8")
    pdf = lire_pdf(pdf_chemin)

    funds = construire_funds(gen, scraper, pdf)
    ecrire("funds.json", funds)
    ecrire("portfolios.json", construire_portfolios(gen))
    ecrire("euro_fund.json", construire_euro_fund(gen))

    tous = funds["funds"]
    print(f"{len(tous)} fonds relevés, {sum(f['displayed'] for f in tous)} affichés, "
          f"{sum(1 for f in tous if f['pending'])} en attente")


if __name__ == "__main__":
    main(sys.argv)
