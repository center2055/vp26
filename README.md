# VP26

VP26 ist eine moderne Vertretungsplan-Oberflaeche fuer Indiware / VpMobil24 mit drei Zielplattformen aus derselben Codebasis:

- Web-Frontend mit React + Vite
- Desktop-App mit Tauri v2
- Python / FastAPI als Datenadapter fuer VpMobil24

## Struktur

```text
backend/
  app/
frontend/
  src/
  src-tauri/
.github/
  workflows/
```

## Lokal entwickeln

### Backend

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

Die Backend-Konfiguration liegt in `backend/.env` oder `backend/.env.local`.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Im Dev-Modus proxyt Vite `/api` automatisch auf `http://127.0.0.1:8000`.

### Desktop

```powershell
cd frontend
npm run tauri:dev
```

## Build-Skripte

Im Frontend sind diese Build-Ziele vorbereitet:

- `npm run tauri:build:nsis`
- `npm run tauri:build:deb`

Der Python-Sidecar wird ueber `frontend/scripts/build-sidecar.mjs` auf Windows und Linux plattformfaehig erzeugt.

## GitHub Actions

Die GitHub-Workflows liegen unter `.github/workflows/`:

- `desktop-build.yml` baut Windows-App, Windows-Installer, Linux-App und Linux-`deb`
- `deploy-pages.yml` baut die statische Web-Version und deployed sie auf GitHub Pages

Bei Tags im Format `v*` haengt der Desktop-Workflow die gebauten Artefakte direkt an einen GitHub Release.

## GitHub Pages

Die Pages-Version ist bewusst als Web-Variante abgespeckt:

- keine Tray-Optionen
- kein Autostart
- keine Close-to-tray-Logik

Wenn `VITE_API_BASE_URL` beim Build gesetzt ist, nutzt die Website diesen Backend-Endpunkt direkt.
Ohne gesetzte API-Basis startet die Web-Version trotzdem sauber und fordert im Login-Screen eine API-Basis an.

Fuer GitHub Actions kann der Backend-Endpunkt als Repository-Variable gesetzt werden:

- `VP26_WEB_API_BASE_URL`

Falls das Backend separat gehostet wird, muss dessen CORS-Konfiguration den Pages-Origin erlauben. Standardmaessig ist `https://center2055.github.io` bereits in den Default-Origins enthalten. Fuer andere Accounts oder Domains bitte `VP26_ALLOWED_ORIGINS` im Backend anpassen.

## Ubuntu

Eine Ubuntu-WSL-taugliche Build-Anleitung liegt in:

- `docs/ubuntu-deb-build.md`

Das Hilfsskript dazu liegt in:

- `frontend/scripts/build-linux-deb.sh`
