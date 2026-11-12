#!/usr/bin/env bash
# Install anything the TikZ MCP server needs, then point Cursor at this skill.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH:-/usr/bin:/bin}"

log() { printf 'tikz: %s\n' "$*"; }

if [[ -x /opt/homebrew/bin/brew ]]; then
  BREW=/opt/homebrew/bin/brew
elif [[ -x /usr/local/bin/brew ]]; then
  BREW=/usr/local/bin/brew
else
  BREW=""
fi

py_ok() {
  "$1" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'
}

PY=""
for candidate in \
  /opt/homebrew/opt/python@3.13/bin/python3.13 \
  /opt/homebrew/opt/python@3.12/bin/python3.12 \
  /opt/homebrew/opt/python@3.11/bin/python3.11 \
  /usr/local/opt/python@3.13/bin/python3.13 \
  /usr/local/opt/python@3.12/bin/python3.12 \
  python3.13 python3.12 python3.11 python3
do
  if [[ -x "$candidate" ]] || command -v "$candidate" >/dev/null 2>&1; then
    resolved="$(command -v "$candidate" 2>/dev/null || true)"
    [[ -n "$resolved" ]] || resolved="$candidate"
    if [[ -x "$resolved" ]] && py_ok "$resolved"; then
      PY="$resolved"
      break
    fi
  fi
done

if [[ -z "$PY" ]]; then
  if [[ -z "$BREW" ]]; then
    echo "tikz: Python 3.10+ is missing and Homebrew is not installed." >&2
    exit 1
  fi
  log "installing python@3.12"
  "$BREW" install python@3.12
  PY="/opt/homebrew/opt/python@3.12/bin/python3.12"
  [[ -x "$PY" ]] || PY="/usr/local/opt/python@3.12/bin/python3.12"
fi

if [[ ! -x "$SKILL_DIR/venv/bin/python" ]]; then
  log "creating venv"
  "$PY" -m venv "$SKILL_DIR/venv"
fi
log "installing Python package mcp==1.30.0"
"$SKILL_DIR/venv/bin/pip" install -q -r "$SKILL_DIR/requirements.txt"

if ! command -v convert >/dev/null 2>&1 && ! command -v magick >/dev/null 2>&1; then
  [[ -n "$BREW" ]] || { echo "tikz: ImageMagick is missing and Homebrew is not installed." >&2; exit 1; }
  log "installing ImageMagick"
  "$BREW" install imagemagick
fi

if ! command -v gs >/dev/null 2>&1; then
  [[ -n "$BREW" ]] || { echo "tikz: Ghostscript is missing and Homebrew is not installed." >&2; exit 1; }
  log "installing Ghostscript"
  "$BREW" install ghostscript
fi

find_xelatex() {
  if command -v xelatex >/dev/null 2>&1; then
    command -v xelatex
    return 0
  fi
  local candidate
  for candidate in \
    "${HOME}/Library/TinyTeX/bin/universal-darwin/xelatex" \
    "/Library/TeX/texbin/xelatex"
  do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

XELATEX=""
if ! XELATEX="$(find_xelatex)"; then
  if [[ -n "$BREW" ]]; then
    log "xelatex missing; trying BasicTeX (this asks for an admin password)"
    "$BREW" install --cask basictex || log "BasicTeX install did not finish; falling back to TinyTeX"
    if [[ -x /usr/libexec/path_helper ]]; then
      eval "$(/usr/libexec/path_helper)" || true
    fi
    export PATH="/Library/TeX/texbin:${PATH}"
  fi
fi

if ! XELATEX="$(find_xelatex)"; then
  log "installing TinyTeX into ${HOME}/Library/TinyTeX"
  curl -fsSL "https://yihui.org/tinytex/install-bin-unix.sh" | sh || true
  XELATEX="$(find_xelatex)"
fi

if [[ -z "$XELATEX" || ! -x "$XELATEX" ]]; then
  echo "tikz: xelatex is still missing." >&2
  exit 1
fi

TEXBIN="$(cd "$(dirname "$XELATEX")" && pwd)"
export PATH="${TEXBIN}:${PATH}"

if ! kpsewhich tikz.sty >/dev/null 2>&1 \
  || ! kpsewhich xeCJK.sty >/dev/null 2>&1 \
  || ! kpsewhich standalone.cls >/dev/null 2>&1 \
  || ! kpsewhich pgfplots.sty >/dev/null 2>&1
then
  log "installing TeX packages"
  tlmgr install standalone pgf pgfplots xcolor amsmath amsfonts tools xetex fontspec xeCJK || true
fi

missing=()
for sty in tikz.sty xeCJK.sty pgfplots.sty; do
  kpsewhich "$sty" >/dev/null 2>&1 || missing+=("$sty")
done
kpsewhich standalone.cls >/dev/null 2>&1 || missing+=(standalone.cls)
if (( ${#missing[@]} > 0 )); then
  echo "tikz: still missing TeX files: ${missing[*]}" >&2
  exit 1
fi

MCP_PATH="${TEXBIN}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export TIKZ_SKILL_DIR="$SKILL_DIR"
export TIKZ_MCP_PATH="$MCP_PATH"
export TIKZ_HOME="$HOME"
python3 - <<'PY'
import json
import os
from pathlib import Path

skill = Path(os.environ["TIKZ_SKILL_DIR"])
mcp_path = Path.home() / ".cursor" / "mcp.json"
data = {"mcpServers": {}}
if mcp_path.exists():
    data = json.loads(mcp_path.read_text())
data.setdefault("mcpServers", {})
data["mcpServers"]["tikz-renderer"] = {
    "command": str(skill / "venv" / "bin" / "python"),
    "args": [str(skill / "tikz_mcp_server.py")],
    "env": {
        "HOME": os.environ["TIKZ_HOME"],
        "PATH": os.environ["TIKZ_MCP_PATH"],
    },
}
mcp_path.parent.mkdir(parents=True, exist_ok=True)
mcp_path.write_text(json.dumps(data, indent=2) + "\n")
print(f"tikz: mcp.json -> {mcp_path}")
PY

log "ready"
log "xelatex ${XELATEX}"
log "python ${SKILL_DIR}/venv/bin/python"
