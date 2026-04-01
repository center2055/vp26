#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd -- "${FRONTEND_ROOT}/.." && pwd)"
BACKEND_ROOT="${PROJECT_ROOT}/backend"
VENV_DIR="${BACKEND_ROOT}/.venv"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 fehlt. Bitte zuerst Python 3 installieren." >&2
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo fehlt. Bitte zuerst Rust installieren." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm fehlt. Bitte zuerst Node.js installieren." >&2
  exit 1
fi

if [ ! -x "${VENV_DIR}/bin/python3" ] && [ ! -x "${VENV_DIR}/bin/python" ]; then
  python3 -m venv "${VENV_DIR}"
fi

PYTHON_BIN="${VENV_DIR}/bin/python3"
if [ ! -x "${PYTHON_BIN}" ]; then
  PYTHON_BIN="${VENV_DIR}/bin/python"
fi

"${PYTHON_BIN}" -m pip install --upgrade pip
"${PYTHON_BIN}" -m pip install -r "${BACKEND_ROOT}/requirements.txt" pyinstaller

cd "${FRONTEND_ROOT}"
npm ci
npm run tauri:build:deb
