"""Contrôles de base du lot 0 : arborescence et mentions légales."""
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent

MENTIONS = (
    "Les performances passées ne préjugent pas des performances futures. "
    "L'assureur ne s'engage que sur le nombre d'unités de compte et non sur leur valeur. "
    "Données issues de Boursorama, fournies à titre informatif, sans garantie d'exactitude. "
    "Document établi à titre informatif, ne constitue pas un conseil en investissement."
)


def test_arborescence():
    for chemin in ["data", "scripts", "site/css", "site/js", "site/vendor",
                   "tests/fixtures", "tests/js", ".github/workflows"]:
        assert (RACINE / chemin).is_dir(), chemin


def test_mentions_legales_en_pied_de_page():
    html = (RACINE / "site" / "index.html").read_text(encoding="utf-8")
    assert MENTIONS in html


def test_aucun_continue_on_error():
    for workflow in (RACINE / ".github" / "workflows").glob("*.yml"):
        assert "continue-on-error" not in workflow.read_text(encoding="utf-8"), workflow.name


def lire_workflow(nom):
    return (RACINE / ".github" / "workflows" / nom).read_text(encoding="utf-8")


def test_programmation_des_releves():
    daily = lire_workflow("daily.yml")
    assert "cron: '0 6 * * 1-5'" in daily and "cron: '0 7 * * 6'" in daily
    assert "cron: '0 7 1 * *'" in lire_workflow("monthly.yml")


def test_releves_publient_le_site_et_echouent_bruyamment():
    for nom in ("daily.yml", "monthly.yml"):
        w = lire_workflow(nom)
        assert "uses: ./.github/workflows/deploy.yml" in w, nom
        assert "group: data-update" in w, nom
        assert "git pull --rebase origin main" in w, nom
        assert "exit 1" in w, nom  # le run passe au rouge si le relevé échoue
    assert "workflow_call:" in lire_workflow("deploy.yml")


def test_url_de_panne_simulee(monkeypatch):
    import importlib
    import sys
    sys.path.insert(0, str(RACINE / "scripts"))
    import common
    monkeypatch.setenv("CCGG_URL_FICHE", "https://adresse-invalide.example/{}/")
    assert importlib.reload(common).URL_FICHE.startswith("https://adresse-invalide")
    monkeypatch.setenv("CCGG_URL_FICHE", "")
    assert importlib.reload(common).URL_FICHE == "https://www.boursorama.com/bourse/opcvm/cours/{}/"


def test_script_de_secours_executable():
    script = RACINE / "mettre_a_jour_maintenant.command"
    assert script.stat().st_mode & 0o111
    assert "git push" in script.read_text(encoding="utf-8")
