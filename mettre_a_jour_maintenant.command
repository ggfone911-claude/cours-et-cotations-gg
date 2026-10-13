#!/bin/bash
# Script de secours, à lancer d'un double-clic sur le Mac quand GitHub Actions
# est en panne. Il fait la même chose que les workflows : relevé quotidien,
# historique mensuel, contrôle des données, puis mise en ligne (le push
# déclenche la publication du site).
set -u -o pipefail

fin() { echo ""; echo "Appuyez sur Entrée pour fermer..."; read -r; exit "${1:-0}"; }

# Python 3.11 installé par uv si présent, sinon le Python du Mac.
if [ -x "$HOME/.local/bin/uv" ]; then
  PY=("$HOME/.local/bin/uv" run --quiet --no-project --python 3.11 python)
else
  PY=(python3)
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "Récupération de la dernière version du site..."
git clone --quiet git@github.com:ggfone911-claude/cours-et-cotations-gg.git "$TMP/site" \
  || { echo "Échec du clonage (clé SSH ?). Copiez ce message à Claude."; fin 1; }
cd "$TMP/site" || fin 1

echo ""; echo "=== 1/3 Relevé quotidien Boursorama (environ 1 min) ==="
"${PY[@]}" scripts/scrape_daily.py | tail -4
QUOTIDIEN=$?

echo ""; echo "=== 2/3 Historique mensuel 5 ans (environ 3 min) ==="
"${PY[@]}" scripts/scrape_history.py | tail -3
MENSUEL=$?

echo ""; echo "=== 3/3 Contrôle des données ==="
"${PY[@]}" scripts/validate.py \
  || { echo "ÉCHEC du contrôle : rien n'a été envoyé. Copiez ce message à Claude."; fin 1; }

git add data/quotes.json data/history.json data/status.json
if git diff --staged --quiet; then
  echo "Aucune donnée nouvelle."
else
  git commit --quiet -m "Relevé VL — $(date '+%d/%m/%Y %H:%M') (depuis le Mac)"
  git push --quiet origin main \
    && echo "" && echo "OK : données envoyées, site en ligne dans 1 à 2 minutes." \
    || { echo "Échec de l'envoi (push)."; fin 1; }
fi

[ "$QUOTIDIEN" -ne 0 ] && echo "" && echo "ATTENTION : relevé quotidien en échec (VL inchangées). Copiez ce message à Claude."
[ "$MENSUEL" -ne 0 ] && echo "" && echo "ATTENTION : historique mensuel en échec (historique inchangé)."
fin $(( QUOTIDIEN || MENSUEL ))
