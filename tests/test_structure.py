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
