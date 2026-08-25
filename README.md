# VP26

VP26 ist eine moderne Vertretungsplan-Oberfläche für Indiware / VpMobil24 mit drei Zielplattformen aus derselben Codebasis:

- Web-Frontend mit React + Vite
- Desktop-App mit Tauri v2
- Python / FastAPI als Datenadapter für VpMobil24

## Anmeldung

Jede Schule meldet sich mit den eigenen Zugangsdaten von VpMobil24 an. Die Oberflaeche
schickt Schulnummer, Benutzername und Passwort einmalig an `POST /api/session`. Das
Backend prueft sie mit einem echten Abruf und legt sie verschluesselt in die Anmeldung:

- im Browser als `HttpOnly`-Cookie, das JavaScript nicht lesen kann
- in der Desktop-App als Datei `session.token` im App-Ordner des Nutzers

Danach reisen bei jedem Plan-Abruf keine Zugangsdaten mehr mit, und im Browserspeicher
liegt kein Passwort. Das Geraet bleibt angemeldet, bis auf `Abmelden` geklickt wird.

Den Schluessel dafuer legt das Backend beim ersten Start selbst an
(`backend/.vp26-session-key`). Fuer mehrere Instanzen hinter einem Loadbalancer gehoert
stattdessen derselbe Wert als `VP26_SESSION_SECRET` in die Konfiguration.

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
backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8010
```

Die Backend-Konfiguration liegt in `backend/.env` oder `backend/.env.local`.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Im Dev-Modus proxyt Vite `/api` automatisch auf `http://127.0.0.1:8010`.

### Desktop

```powershell
cd frontend
npm run tauri:dev
```

## Build-Skripte

Im Frontend sind diese Build-Ziele vorbereitet:

- `npm run tauri:build:nsis`
- `npm run tauri:build:deb`

Der Python-Sidecar wird über `frontend/scripts/build-sidecar.mjs` auf Windows und Linux plattformfähig erzeugt.

## GitHub Actions

Die GitHub-Workflows liegen unter `.github/workflows/`:

- `desktop-build.yml` baut Windows-App, Windows-Installer, Linux-App und Linux-`deb`
- `deploy-pages.yml` baut die statische Web-Version und deployt sie auf GitHub Pages

Bei Tags im Format `v*` hängt der Desktop-Workflow die gebauten Artefakte direkt an einen GitHub Release.

## GitHub Pages

Die Pages-Version ist bewusst als Web-Variante abgespeckt:

- keine Tray-Optionen
- kein Autostart
- keine Close-to-tray-Logik

Wenn `VITE_API_BASE_URL` beim Build gesetzt ist, nutzt die Website diesen Backend-Endpunkt direkt.
Ohne gesetzte API-Basis startet die Web-Version trotzdem sauber und fordert im Login-Screen eine API-Basis an.

Für GitHub Actions kann der Backend-Endpunkt als Repository-Variable gesetzt werden:

- `VP26_WEB_API_BASE_URL`

Falls das Backend separat gehostet wird, muss dessen CORS-Konfiguration den Pages-Origin erlauben. Standardmäßig ist `https://center2055.github.io` bereits in den Default-Origins enthalten. Für andere Accounts oder Domains bitte `VP26_ALLOWED_ORIGINS` im Backend anpassen.

### Lokalen Backend-Endpunkt für Pages veröffentlichen

Wenn noch kein externer Host vorhanden ist, kann das lokale FastAPI-Backend temporär öffentlich gemacht werden:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish-pages-backend.ps1
```

Das Skript startet das Backend lokal, erstellt einen Cloudflare Quick Tunnel, setzt `VP26_WEB_API_BASE_URL` im GitHub-Repo und triggert den Pages-Deploy neu. Das ist ein pragmatischer Test- und Übergangsweg, aber kein stabiler Produktivhost: die URL ist an den laufenden Tunnel auf diesem Rechner gebunden.

## Ubuntu

Eine Ubuntu-WSL-taugliche Build-Anleitung liegt in:

- `docs/ubuntu-deb-build.md`

Das Hilfsskript dazu liegt in:

- `frontend/scripts/build-linux-deb.sh`
